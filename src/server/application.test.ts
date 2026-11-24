import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../main/db.ts';
import { AplicacaoCentral } from './application.ts';
import { criarServidorHttp } from './transport/http.ts';
import type { ApiResponse } from '../shared/types.ts';

import { dados, cenarioCentral } from './test-helpers.ts';

test('contas armazenam hash e sessões revogáveis; ativação é de uso único', async () => {
  const { app, db, tokens } = await cenarioCentral();
  try {
    const users = dados(await app.handle({ method: 'GET', path: '/admin/usuarios' }, tokens.admin));
    assert.ok(!JSON.stringify(users).includes('senha_hash'));
    const hash = db.get<{ senha_hash: string }>('SELECT senha_hash FROM usuarios WHERE id=1')!.senha_hash;
    assert.ok(!hash.includes('Senha-Admin'));
    assert.ok(hash.length > 120);
    assert.equal((await app.handle({ method: 'GET', path: '/alunos' })).status, 401);
    assert.equal(
      (await app.handle({ method: 'POST', path: '/alunos', body: { nome: 'Intruso', papel: 'admin' } }, tokens.alunoA)).status,
      403,
    );
    const a = users.find((u: any) => u.email === 'alunoa@escola.test');
    dados(await app.handle({ method: 'POST', path: `/admin/usuarios/${a.id}/desativar` }, tokens.admin));
    assert.equal((await app.handle({ method: 'GET', path: '/auth/session' }, tokens.alunoA)).status, 401);
    assert.equal((await app.handle({ method: 'POST', path: '/admin/usuarios/1/desativar' }, tokens.admin)).status, 422);
    dados(await app.handle({ method: 'POST', path: '/auth/logout' }, tokens.profA));
    assert.equal((await app.handle({ method: 'GET', path: '/auth/session' }, tokens.profA)).status, 401);
  } finally {
    db.close();
  }
});

test('aluno e professor não atravessam escopo por IDs, query ou exportação', async () => {
  const { app, db, tokens } = await cenarioCentral();
  try {
    assert.deepEqual(
      dados<any[]>(await app.handle({ method: 'GET', path: '/portal/turmas?aluno_id=2' }, tokens.alunoA)).map((t) => t.id),
      [1],
    );
    assert.deepEqual(
      dados<any[]>(await app.handle({ method: 'GET', path: '/portal/turmas' }, tokens.profB)).map((t) => t.id),
      [2],
    );
    assert.equal((await app.handle({ method: 'GET', path: '/portal/turmas/2/alunos' }, tokens.profA)).status, 403);
    assert.equal((await app.handle({ method: 'GET', path: '/portal/turmas/1/alunos' }, tokens.alunoA)).status, 403);
    for (const path of [
      '/alunos/2',
      '/alunos/2/historico',
      '/financeiro/inadimplentes',
      '/avaliacoes/1/exportar',
      '/backups',
      '/admin/usuarios',
    ])
      assert.equal((await app.handle({ method: 'GET', path }, tokens.alunoA)).status, 403, path);
    const alunos = dados<any[]>(await app.handle({ method: 'GET', path: '/portal/turmas/1/alunos' }, tokens.profA));
    assert.deepEqual(alunos, [{ id: 1, nome: 'Aluno A' }]);
    assert.equal((await app.handle({ method: 'GET', path: '/portal/mensalidades' }, tokens.profA)).status, 403);
  } finally {
    db.close();
  }
});

test('login incorreto limita tentativas e não revela se o e-mail existe', async () => {
  const db = await openDb();
  const app = new AplicacaoCentral(db);
  try {
    for (let i = 0; i < 5; i++)
      assert.equal(
        (await app.handle({ method: 'POST', path: '/auth/login', body: { email: 'ausente@escola.test', senha: 'errada' } })).status,
        401,
      );
    assert.equal(
      (await app.handle({ method: 'POST', path: '/auth/login', body: { email: 'ausente@escola.test', senha: 'errada' } })).status,
      429,
    );
  } finally {
    db.close();
  }
});

test('login pelo transporte real não permite dados centrais sem sessão', async () => {
  const { app, db } = await cenarioCentral();
  const server = criarServidorHttp(app);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}/api/v1`;
  try {
    assert.equal((await fetch(base + '/alunos')).status, 401);
    const login = await fetch(base + '/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@escola.test', senha: 'Senha-Admin-2026!' }),
    });
    const sessao = dados((await login.json()) as ApiResponse);
    assert.equal((await fetch(base + '/alunos', { headers: { Authorization: 'Bearer ' + sessao.token } })).status, 200);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
    db.close();
  }
});
