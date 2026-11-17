import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readdirSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb, limparDados, TABELAS } from './db.ts';

const FIXTURE_V1 = fileURLToPath(new URL('./fixtures/escola-v1-antigo.db', import.meta.url));

/** Pasta temporária para um teste; remove ao final. */
async function comPasta(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), 'escola-db-'));
  try {
    await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('cria todas as tabelas do schema com foreign keys ligadas', async () => {
  const db = await openDb();
  const tabelas = db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'").map((t) => t.name);
  for (const t of TABELAS) assert.ok(tabelas.includes(t), `tabela ${t} ausente`);
  assert.equal(db.get<{ foreign_keys: number }>('PRAGMA foreign_keys')!.foreign_keys, 1);
  assert.throws(
    () => db.run('INSERT INTO turmas (nome, idioma_id, nivel, ano_letivo, capacidade) VALUES (?, ?, ?, ?, ?)', ['X', 999, 1, 2026, 10]),
    /FOREIGN KEY/,
  );
});

test('CHECKs do schema: nível fora da faixa, status inválido, JSON inválido', async () => {
  const db = await openDb();
  const { lastInsertRowid: idioma } = db.run("INSERT INTO idiomas (nome, codigo, mensalidade) VALUES ('Inglês', 'en', 300)");
  assert.throws(
    () => db.run('INSERT INTO turmas (nome, idioma_id, nivel, ano_letivo, capacidade) VALUES (?, ?, 13, 2026, 10)', ['T', idioma]),
    /CHECK/,
  );
  assert.throws(
    () => db.run('INSERT INTO turmas (nome, idioma_id, nivel, ano_letivo, capacidade) VALUES (?, ?, 1, 2026, 0)', ['T', idioma]),
    /CHECK/,
  );
  const { lastInsertRowid: turma } = db.run(
    'INSERT INTO turmas (nome, idioma_id, nivel, ano_letivo, capacidade) VALUES (?, ?, 1, 2026, 10)',
    ['T', idioma],
  );
  assert.throws(() => db.run("INSERT INTO avaliacoes (turma_id, titulo, form) VALUES (?, 'A', 'não é json')", [turma]), /CHECK/);
  const { lastInsertRowid: aluno } = db.run("INSERT INTO alunos (nome) VALUES ('Fulano')");
  assert.throws(
    () => db.run("INSERT INTO matriculas (aluno_id, turma_id, ano_letivo, status) VALUES (?, ?, 2026, 'xyz')", [aluno, turma]),
    /CHECK/,
  );
  db.run('INSERT INTO matriculas (aluno_id, turma_id, ano_letivo) VALUES (?, ?, 2026)', [aluno, turma]);
  assert.throws(() => db.run('INSERT INTO matriculas (aluno_id, turma_id, ano_letivo) VALUES (?, ?, 2026)', [aluno, turma]), /UNIQUE/);
});

test('booleanos voltam como boolean e parâmetros boolean viram 0/1', async () => {
  const db = await openDb();
  db.run('INSERT INTO alunos (nome, ativo) VALUES (?, ?)', ['A', false]);
  db.run('INSERT INTO alunos (nome, ativo) VALUES (:nome, :ativo)', { nome: 'B', ativo: true });
  const rows = db.all<{ nome: string; ativo: boolean; moeda_origem: string }>('SELECT nome, ativo, moeda_origem FROM alunos ORDER BY nome');
  assert.deepEqual(
    rows.map((r) => r.ativo),
    [false, true],
  );
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
  assert.throws(
    () =>
      db.transaction(() => {
        db.run("INSERT INTO alunos (nome) VALUES ('A')");
        throw new Error('falhou');
      }),
    /falhou/,
  );
  assert.equal(db.get<{ n: number }>('SELECT count(*) AS n FROM alunos')!.n, 0);
  db.transaction(() => {
    db.run("INSERT INTO alunos (nome) VALUES ('B')");
    try {
      db.transaction(() => {
        db.run("INSERT INTO alunos (nome) VALUES ('C')");
        throw new Error('interna');
      });
    } catch {
      /* só a interna é desfeita */
    }
  });
  assert.deepEqual(
    db.all<{ nome: string }>('SELECT nome FROM alunos').map((r) => r.nome),
    ['B'],
  );
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
    assert.deepEqual(
      readdirSync(join(dir, 'sub')).filter((f) => f.endsWith('.tmp')),
      [],
      'sem temporários sobrando',
    );
    limparDados(db2);
    const db3 = await openDb({ file });
    assert.equal(db3.get<{ n: number }>('SELECT count(*) AS n FROM idiomas')!.n, 0);
    db.close();
    db2.close();
    db3.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('arquivo em disco usa WAL, synchronous NORMAL e grava sem persist()', async () => {
  await comPasta(async (dir) => {
    const file = join(dir, 'escola.db');
    const db = await openDb({ file });
    assert.equal(db.get<{ journal_mode: string }>('PRAGMA journal_mode')!.journal_mode, 'wal');
    assert.equal(db.get<{ synchronous: number }>('PRAGMA synchronous')!.synchronous, 1);
    assert.equal(db.get<{ timeout: number }>('PRAGMA busy_timeout')!.timeout > 0, true);
    db.run("INSERT INTO idiomas (nome, codigo, mensalidade) VALUES ('Alemão', 'de', 310)");
    assert.equal('persist' in db, false, 'persist foi removido da interface');
    // reabre sem close(): o confirmado precisa estar visível (WAL)
    const db2 = await openDb({ file });
    assert.equal(db2.get<{ n: number }>('SELECT count(*) AS n FROM idiomas')!.n, 1);
    db.close();
    db2.close();
    assert.deepEqual(
      readdirSync(dir).filter((f) => f.endsWith('-wal') || f.endsWith('-shm')),
      [],
      'close() faz checkpoint e remove -wal/-shm',
    );
  });
});

test('SAVEPOINT aninhado com rollback em arquivo WAL', async () => {
  await comPasta(async (dir) => {
    const db = await openDb({ file: join(dir, 'escola.db') });
    db.transaction(() => {
      db.run("INSERT INTO alunos (nome) VALUES ('B')");
      try {
        db.transaction(() => {
          db.run("INSERT INTO alunos (nome) VALUES ('C')");
          throw new Error('interna');
        });
      } catch {
        /* só a interna é desfeita */
      }
    });
    const db2 = await openDb({ file: join(dir, 'escola.db') });
    assert.deepEqual(
      db2.all<{ nome: string }>('SELECT nome FROM alunos').map((r) => r.nome),
      ['B'],
    );
    db.close();
    db2.close();
  });
});

test('linhas têm protótipo comum (deepEqual estrito) e inteiros vêm como number', async () => {
  const db = await openDb();
  db.run("INSERT INTO alunos (nome) VALUES ('A')");
  const linha = db.get<{ id: number }>('SELECT id FROM alunos')!;
  assert.equal(Object.getPrototypeOf(linha), Object.prototype);
  assert.equal(typeof linha.id, 'number');
  assert.deepEqual(db.all('SELECT id FROM alunos'), [{ id: 1 }]);
});

test('parâmetro nomeado a mais é ignorado e string com aspas duplas é recusada', async () => {
  const db = await openDb();
  assert.equal(db.get<{ a: number }>('SELECT :a AS a', { a: 1, sobrando: 2 })!.a, 1);
  assert.equal(db.get<{ a: number }>('SELECT :a AS a', { ':a': 3 })!.a, 3);
  assert.throws(() => db.all('SELECT "texto" AS t FROM alunos'), /no such column/);
});

test('arquivo do motor antigo (journal 01 01) é copiado para .pre-node-sqlite antes da 1ª abertura, sem sobrescrever', async () => {
  await comPasta(async (dir) => {
    const file = join(dir, 'escola.db');
    copyFileSync(FIXTURE_V1, file);
    const original = readFileSync(file);
    assert.deepEqual([original[18], original[19]], [1, 1]);
    const db = await openDb({ file });
    const copia = `${file}.pre-node-sqlite`;
    assert.ok(existsSync(copia), 'cópia criada');
    assert.ok(readFileSync(copia).equals(original), 'cópia idêntica ao arquivo do motor antigo');
    assert.equal(db.get<{ n: number }>('SELECT count(*) AS n FROM alunos')!.n, 25);
    db.run("INSERT INTO alunos (nome) VALUES ('Novo')");
    db.close();
    // segunda abertura: arquivo já está em WAL; a cópia original permanece intacta
    const db2 = await openDb({ file });
    db2.close();
    assert.ok(readFileSync(copia).equals(original), 'cópia não foi sobrescrita');
  });
});

test('banco novo e arquivo vazio não geram .pre-node-sqlite', async () => {
  await comPasta(async (dir) => {
    const novo = join(dir, 'novo.db');
    (await openDb({ file: novo })).close();
    assert.equal(existsSync(`${novo}.pre-node-sqlite`), false);
    const vazio = join(dir, 'vazio.db');
    writeFileSync(vazio, '');
    (await openDb({ file: vazio })).close();
    assert.equal(existsSync(`${vazio}.pre-node-sqlite`), false);
  });
});

test('rollback real: checkpoint + journal_mode=DELETE devolve arquivo legível pelo motor antigo (cabeçalho 01 01)', async () => {
  await comPasta(async (dir) => {
    const file = join(dir, 'escola.db');
    copyFileSync(FIXTURE_V1, file);
    const db = await openDb({ file });
    db.run("INSERT INTO alunos (nome) VALUES ('Novo')");
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    db.exec('PRAGMA journal_mode = DELETE');
    db.close();
    const bytes = readFileSync(file);
    assert.deepEqual([bytes[18], bytes[19]], [1, 1]);
    assert.deepEqual(
      readdirSync(dir).filter((f) => f.endsWith('-wal') || f.endsWith('-shm')),
      [],
    );
  });
});
