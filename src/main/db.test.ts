import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, limparDados, TABELAS } from './db.ts';

test('cria todas as tabelas do schema com foreign keys ligadas', async () => {
  const db = await openDb();
  const tabelas = db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'").map((t) => t.name);
  for (const t of TABELAS) assert.ok(tabelas.includes(t), `tabela ${t} ausente`);
  assert.equal(db.get<{ foreign_keys: number }>('PRAGMA foreign_keys')!.foreign_keys, 1);
  assert.throws(() => db.run('INSERT INTO turmas (nome, idioma_id, nivel, ano_letivo, capacidade) VALUES (?, ?, ?, ?, ?)', ['X', 999, 1, 2026, 10]), /FOREIGN KEY/);
});

test('CHECKs do schema: nível fora da faixa, status inválido, JSON inválido', async () => {
  const db = await openDb();
  const { lastInsertRowid: idioma } = db.run("INSERT INTO idiomas (nome, codigo, mensalidade) VALUES ('Inglês', 'en', 300)");
  assert.throws(() => db.run('INSERT INTO turmas (nome, idioma_id, nivel, ano_letivo, capacidade) VALUES (?, ?, 13, 2026, 10)', ['T', idioma]), /CHECK/);
  assert.throws(() => db.run('INSERT INTO turmas (nome, idioma_id, nivel, ano_letivo, capacidade) VALUES (?, ?, 1, 2026, 0)', ['T', idioma]), /CHECK/);
  const { lastInsertRowid: turma } = db.run('INSERT INTO turmas (nome, idioma_id, nivel, ano_letivo, capacidade) VALUES (?, ?, 1, 2026, 10)', ['T', idioma]);
  assert.throws(() => db.run("INSERT INTO avaliacoes (turma_id, titulo, form) VALUES (?, 'A', 'não é json')", [turma]), /CHECK/);
  const { lastInsertRowid: aluno } = db.run("INSERT INTO alunos (nome) VALUES ('Fulano')");
  assert.throws(() => db.run("INSERT INTO matriculas (aluno_id, turma_id, ano_letivo, status) VALUES (?, ?, 2026, 'xyz')", [aluno, turma]), /CHECK/);
  db.run('INSERT INTO matriculas (aluno_id, turma_id, ano_letivo) VALUES (?, ?, 2026)', [aluno, turma]);
  assert.throws(() => db.run('INSERT INTO matriculas (aluno_id, turma_id, ano_letivo) VALUES (?, ?, 2026)', [aluno, turma]), /UNIQUE/);
});

test('booleanos voltam como boolean e parâmetros boolean viram 0/1', async () => {
  const db = await openDb();
  db.run('INSERT INTO alunos (nome, ativo) VALUES (?, ?)', ['A', false]);
  db.run('INSERT INTO alunos (nome, ativo) VALUES (:nome, :ativo)', { nome: 'B', ativo: true });
  const rows = db.all<{ nome: string; ativo: boolean; moeda_origem: string }>('SELECT nome, ativo, moeda_origem FROM alunos ORDER BY nome');
  assert.deepEqual(rows.map((r) => r.ativo), [false, true]);
  assert.equal(rows[0].moeda_origem, 'BRL');
  assert.equal(db.get('SELECT * FROM alunos WHERE id = 999'), undefined);
});

test('run devolve lastInsertRowid e changes', async () => {
  const db = await openDb();
  const r1 = db.run("INSERT INTO alunos (nome) VALUES ('A')");
  const r2 = db.run("INSERT INTO alunos (nome) VALUES ('B')");
  assert.equal(r1.lastInsertRowid, 1);
  assert.equal(r2.lastInsertRowid, 2);
  assert.equal(db.run('UPDATE alunos SET telefone = ?', ['1']).changes, 2);
});

test('transaction faz rollback em erro e aceita aninhamento', async () => {
  const db = await openDb();
  assert.throws(() => db.transaction(() => {
    db.run("INSERT INTO alunos (nome) VALUES ('A')");
    throw new Error('falhou');
  }), /falhou/);
  assert.equal(db.get<{ n: number }>('SELECT count(*) AS n FROM alunos')!.n, 0);
  db.transaction(() => {
    db.run("INSERT INTO alunos (nome) VALUES ('B')");
    try {
      db.transaction(() => {
        db.run("INSERT INTO alunos (nome) VALUES ('C')");
        throw new Error('interna');
      });
    } catch { /* só a interna é desfeita */ }
  });
  assert.deepEqual(db.all<{ nome: string }>('SELECT nome FROM alunos').map((r) => r.nome), ['B']);
});

test('sem_acento permite busca sem acentos', async () => {
  const db = await openDb();
  db.run("INSERT INTO alunos (nome) VALUES ('João Ávila')");
  assert.equal(db.all("SELECT 1 FROM alunos WHERE instr(sem_acento(nome), sem_acento('joao avila')) > 0").length, 1);
});

test('persiste em arquivo (gravar, reabrir, ler) de forma atômica', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'escola-db-'));
  try {
    const file = join(dir, 'sub', 'escola.db');
    const db = await openDb({ file });
    assert.ok(existsSync(file), 'arquivo criado na abertura');
    db.run("INSERT INTO idiomas (nome, codigo, mensalidade) VALUES ('Francês', 'fr', 340.5)");
    db.transaction(() => db.run("INSERT INTO alunos (nome, ativo) VALUES ('Persistido', 0)"));
    // sem close(): cada escrita já foi persistida
    const db2 = await openDb({ file });
    assert.deepEqual(db2.get('SELECT nome, codigo, mensalidade FROM idiomas'), { nome: 'Francês', codigo: 'fr', mensalidade: 340.5 });
    assert.equal(db2.get<{ ativo: boolean }>("SELECT ativo FROM alunos WHERE nome = 'Persistido'")!.ativo, false);
    assert.equal(db2.get<{ foreign_keys: number }>('PRAGMA foreign_keys')!.foreign_keys, 1);
    assert.deepEqual(readdirSync(join(dir, 'sub')).filter((f) => f.endsWith('.tmp')), [], 'sem temporários sobrando');
    limparDados(db2);
    const db3 = await openDb({ file });
    assert.equal(db3.get<{ n: number }>('SELECT count(*) AS n FROM idiomas')!.n, 0);
    db.close(); db2.close(); db3.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
