import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, limparDados } from './db.ts';
import { seed, ALUNOS } from './seed.ts';
import { createApi } from './app.ts';

test('seed popula banco vazio e é idempotente', async () => {
  const db = await openDb();
  const r1 = seed(db, { anoAtual: 2026 });
  assert.equal(r1.populado, true);
  assert.deepEqual(r1.contagem, { idiomas: 5, professores: 6, alunos: ALUNOS.length, turmas: r1.contagem.turmas });
  assert.ok(ALUNOS.length >= 20);
  const r2 = seed(db, { anoAtual: 2026 });
  assert.equal(r2.populado, false);
  assert.deepEqual(r2.contagem, r1.contagem);
  limparDados(db);
  assert.equal(seed(db, { anoAtual: 2026 }).populado, true);
});

test('dados da seed respeitam as regras da API', async () => {
  const db = await openDb();
  seed(db, { anoAtual: 2026 });
  const api = createApi(db);
  const idiomas = (await api.handle({ method: 'GET', path: '/idiomas' })) as any;
  assert.equal(new Set(idiomas.data.map((i: any) => i.mensalidade)).size, 5, 'mensalidades diferentes');
  const profs = (await api.handle({ method: 'GET', path: '/professores' })) as any;
  assert.ok(profs.data.every((p: any) => p.idiomas.length >= 1 && p.idiomas.length <= 2));
  const turmas = db.all<{ n: number }>(
    `SELECT count(*) AS n FROM turmas t WHERE NOT EXISTS
       (SELECT 1 FROM professor_idiomas pi WHERE pi.professor_id = t.professor_id AND pi.idioma_id = t.idioma_id)`);
  assert.equal(turmas[0].n, 0, 'todo professor de turma está habilitado no idioma');
  const anos = db.all<{ ano_letivo: number }>('SELECT DISTINCT ano_letivo FROM turmas ORDER BY 1').map((r) => r.ano_letivo);
  assert.deepEqual(anos, [2025, 2026]);
  const moedas = new Set(db.all<{ moeda_origem: string }>('SELECT moeda_origem FROM alunos').map((r) => r.moeda_origem));
  for (const m of ['BRL', 'USD', 'EUR', 'ARS', 'CLP', 'JPY']) assert.ok(moedas.has(m), m);
});
