import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cenarioCentral, dados } from './test-helpers.ts';
import { abrirBancoCentral } from './restauracao.ts';
import { criarBackup, pastaDeBackups, prepararRestauracao } from '../main/backup.ts';
import { bloquearPasta } from './runtime.ts';
import { AplicacaoCentral } from './application.ts';
test('recuperação central devolve anexos e histórico, revoga sessões e mantém exclusão de processo', async () => {
  const pasta = mkdtempSync(join(tmpdir(), 'escola-central-'));
  const c = await cenarioCentral();
  try {
    const arquivo = { nome: 'material.pdf', mime: 'application/pdf', base64: Buffer.from('%PDF-1.7\nmaterial privado').toString('base64') };
    const p = dados<any>(
      await c.app.handle(
        { method: 'POST', path: '/biblioteca', body: { turma_id: 1, titulo: 'Recuperação', arquivo, estado: 'publicado' } },
        c.tokens.profA,
      ),
    );
    c.db.raw.prepare('VACUUM INTO ?').run(join(pasta, 'escola.db'));
    c.db.close();
    let db = await abrirBancoCentral(pasta);
    const liberar = bloquearPasta(pasta);
    assert.throws(() => bloquearPasta(pasta), /Pasta em uso/);
    liberar();
    const b = criarBackup(db, pastaDeBackups(db), 'manual');
    db.run("INSERT INTO alunos(nome) VALUES('Posterior ao backup')");
    prepararRestauracao(join(pastaDeBackups(db), b.nome), pasta);
    db.close();
    db = await abrirBancoCentral(pasta);
    try {
      assert.equal(db.get<{ n: number }>('SELECT count(*) n FROM alunos')?.n, 2);
      assert.equal(db.get<{ n: number }>('SELECT count(*) n FROM sessoes')?.n, 0);
      assert.equal(db.get<{ n: number }>('SELECT count(*) n FROM acessos_temporarios')?.n, 0);
      const app = new AplicacaoCentral(db);
      assert.equal((await app.handle({ method: 'GET', path: '/biblioteca' }, c.tokens.alunoA)).status, 401);
      const login = dados<any>(
        await app.handle({ method: 'POST', path: '/auth/login', body: { email: 'alunoA@escola.test', senha: 'Senha-Aluno-2026!' } }),
      );
      const download = dados<any>(await app.handle({ method: 'GET', path: `/biblioteca/${p.id}/arquivo` }, login.token));
      assert.equal(download.base64, arquivo.base64);
      assert.ok(db.get("SELECT id FROM auditoria WHERE acao='RESTAURAR_BACKUP'"));
    } finally {
      db.close();
    }
  } finally {
    assert.ok(pasta.startsWith(join(tmpdir(), 'escola-central-')));
    rmSync(pasta, { recursive: true, force: true });
  }
});
test('troca de senha exige senha atual e encerra sessões antigas', async () => {
  const { app, db, tokens: t } = await cenarioCentral();
  try {
    assert.equal(
      (await app.handle({ method: 'POST', path: '/auth/senha', body: { senha_atual: 'errada', nova_senha: 'Nova-Senha-2026!' } }, t.alunoA))
        .status,
      401,
    );
    dados(
      await app.handle(
        { method: 'POST', path: '/auth/senha', body: { senha_atual: 'Senha-Aluno-2026!', nova_senha: 'Nova-Senha-2026!' } },
        t.alunoA,
      ),
    );
    assert.equal((await app.handle({ method: 'GET', path: '/auth/session' }, t.alunoA)).status, 401);
    assert.equal(
      (await app.handle({ method: 'POST', path: '/auth/login', body: { email: 'alunoA@escola.test', senha: 'Senha-Aluno-2026!' } })).status,
      401,
    );
    dados(await app.handle({ method: 'POST', path: '/auth/login', body: { email: 'alunoA@escola.test', senha: 'Nova-Senha-2026!' } }));
  } finally {
    db.close();
  }
});
test('avaliações publicadas chegam ao aluno da turma e identificam resposta autenticada', async () => {
  const { app, db, tokens: t } = await cenarioCentral();
  try {
    const a = dados<any>(
      await app.handle({ method: 'POST', path: '/avaliacoes', body: { turma_id: 1, titulo: 'Feedback', modelo_id: 'feedback' } }, t.profA),
    );
    assert.equal(dados<any[]>(await app.handle({ method: 'GET', path: '/avaliacoes' }, t.alunoA)).length, 0);
    dados(
      await app.handle(
        { method: 'POST', path: `/avaliacoes/${a.id}/publicar`, body: { publicada: true, finalidade: 'feedback' } },
        t.profA,
      ),
    );
    const lista = dados<any[]>(await app.handle({ method: 'GET', path: '/avaliacoes' }, t.alunoA));
    assert.equal(lista.length, 1);
    assert.equal(lista[0].finalidade, 'feedback');
    assert.equal(dados<any[]>(await app.handle({ method: 'GET', path: '/avaliacoes' }, t.alunoB)).length, 0);
    assert.equal(
      (await app.handle({ method: 'POST', path: `/avaliacoes/${a.id}/respostas`, body: { aluno_id: 2, answers: [] } }, t.alunoA)).status,
      422,
    );
  } finally {
    db.close();
  }
});
