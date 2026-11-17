import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, copyFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb, TABELAS } from './db.ts';
import { MIGRATIONS, ULTIMA_VERSAO } from './migrations/index.ts';
import type { Migration } from './migrations/index.ts';

const FIXTURE_V1 = fileURLToPath(new URL('./fixtures/escola-v1-antigo.db', import.meta.url));

async function comPasta(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), 'escola-mig-'));
  try { await fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}

function contar(file: string): Record<string, number> {
  const d = new DatabaseSync(file, { readOnly: true });
  try {
    const out: Record<string, number> = {};
    for (const t of TABELAS) out[t] = Number((d.prepare(`SELECT count(*) AS n FROM ${t}`).get() as { n: number }).n);
    return out;
  } finally { d.close(); }
}

const versao = (db: { get<T>(s: string): T | undefined }) => db.get<{ user_version: number }>('PRAGMA user_version')!.user_version;

const extra = (v: number, sql: string): Migration => ({ versao: v, nome: `extra-${v}`, sql });

test('banco novo chega à última versão e a lista de migrations é sequencial', async () => {
  MIGRATIONS.forEach((m, i) => assert.equal(m.versao, i + 1));
  assert.equal(ULTIMA_VERSAO, MIGRATIONS.length);
  const db = await openDb();
  assert.equal(versao(db), ULTIMA_VERSAO);
  assert.equal(db.all("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('alunos','mensalidades')").length, 2);
});

test('banco v1 gravado pelo motor antigo abre sem perder linhas', async () => {
  await comPasta(async (dir) => {
    const file = join(dir, 'escola.db');
    copyFileSync(FIXTURE_V1, file);
    const antes = contar(FIXTURE_V1);
    assert.equal(antes.alunos, 25);
    const db = await openDb({ file });
    assert.equal(versao(db), ULTIMA_VERSAO);
    db.close();
    assert.deepEqual(contar(file), antes);
  });
});

test('migration pendente em arquivo existente: copia antes (pre-migracao-v<N>) e aplica', async () => {
  await comPasta(async (dir) => {
    const file = join(dir, 'escola.db');
    copyFileSync(FIXTURE_V1, file);
    const migs = [...MIGRATIONS, extra(ULTIMA_VERSAO + 1, 'CREATE TABLE nova (id INTEGER PRIMARY KEY); INSERT INTO alunos (nome) VALUES (\'Pós-migração\');')];
    const db = await openDb({ file, migrations: migs });
    assert.equal(versao(db), ULTIMA_VERSAO + 1);
    db.close();
    const copia = `${file}.pre-migracao-v${ULTIMA_VERSAO}`;
    assert.ok(existsSync(copia), 'cópia criada');
    assert.equal(contar(copia).alunos, 25, 'cópia é o estado de antes');
    const c = new DatabaseSync(copia, { readOnly: true });
    assert.equal(c.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name = 'nova'").get()!.n, 0);
    assert.equal(Number((c.prepare('PRAGMA user_version').get() as { user_version: number }).user_version), ULTIMA_VERSAO);
    c.close();
  });
});

test('cópia pre-migracao existente não é sobrescrita', async () => {
  await comPasta(async (dir) => {
    const file = join(dir, 'escola.db');
    copyFileSync(FIXTURE_V1, file);
    const copia = `${file}.pre-migracao-v${ULTIMA_VERSAO}`;
    copyFileSync(FIXTURE_V1, copia);
    const d = new DatabaseSync(copia);
    d.exec("INSERT INTO alunos (nome) VALUES ('marca')");
    d.close();
    const migs = [...MIGRATIONS, extra(ULTIMA_VERSAO + 1, 'CREATE TABLE nova (id INTEGER PRIMARY KEY);')];
    (await openDb({ file, migrations: migs })).close();
    assert.equal(contar(copia).alunos, 26, 'cópia anterior preservada');
  });
});

test('migration que falha dá rollback, erro claro e o banco fica na versão anterior', async () => {
  await comPasta(async (dir) => {
    const file = join(dir, 'escola.db');
    const ok = extra(ULTIMA_VERSAO + 1, 'CREATE TABLE boa (id INTEGER PRIMARY KEY);');
    const ruim = extra(ULTIMA_VERSAO + 2, 'CREATE TABLE parcial (id INTEGER PRIMARY KEY); INSERT INTO tabela_que_nao_existe VALUES (1);');
    await assert.rejects(openDb({ file, migrations: [...MIGRATIONS, ok, ruim] }), new RegExp(`Migration ${ULTIMA_VERSAO + 2}.*extra-${ULTIMA_VERSAO + 2}.*tabela_que_nao_existe`));
    const d = new DatabaseSync(file, { readOnly: true });
    assert.equal(Number((d.prepare('PRAGMA user_version').get() as { user_version: number }).user_version), ULTIMA_VERSAO + 1);
    const nomes = (d.prepare("SELECT name FROM sqlite_master WHERE name IN ('boa','parcial')").all() as { name: string }[]).map((r) => r.name);
    assert.deepEqual(nomes, ['boa'], 'a migration que falhou não deixou nada parcial');
    d.close();
    // o arquivo não ficou travado: dá para abrir de novo depois de corrigir
    (await openDb({ file, migrations: [...MIGRATIONS, ok] })).close();
  });
});

test('banco de versão futura é recusado sem alteração', async () => {
  await comPasta(async (dir) => {
    const file = join(dir, 'escola.db');
    copyFileSync(FIXTURE_V1, file);
    const d = new DatabaseSync(file);
    d.exec(`PRAGMA user_version = ${ULTIMA_VERSAO + 5}`);
    d.close();
    await assert.rejects(openDb({ file }), /versão mais nova/);
    // só a cópia da troca de motor é esperada; sem pre-migracao e sem -wal/-shm sobrando
    assert.deepEqual(readdirSync(dir).sort(), ['escola.db', 'escola.db.pre-node-sqlite']);
    const c = new DatabaseSync(file, { readOnly: true });
    assert.equal(Number((c.prepare('PRAGMA user_version').get() as { user_version: number }).user_version), ULTIMA_VERSAO + 5);
    c.close();
  });
});

test('abrir duas vezes é idempotente (sem cópia nova, mesmos dados)', async () => {
  await comPasta(async (dir) => {
    const file = join(dir, 'escola.db');
    copyFileSync(FIXTURE_V1, file);
    (await openDb({ file })).close();
    const arquivos = readdirSync(dir).sort();
    const dados = contar(file);
    const db = await openDb({ file });
    assert.equal(versao(db), ULTIMA_VERSAO);
    db.close();
    assert.deepEqual(readdirSync(dir).sort(), arquivos);
    assert.deepEqual(contar(file), dados);
  });
});

test('banco sem versão mas com tabelas é tratado como v1 (dados preservados, schema completado)', async () => {
  await comPasta(async (dir) => {
    const file = join(dir, 'escola.db');
    const d = new DatabaseSync(file);
    d.exec("CREATE TABLE alunos (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL CHECK (length(trim(nome)) > 0), data_nascimento TEXT, documento TEXT, email TEXT, telefone TEXT, endereco TEXT, pais_origem TEXT, moeda_origem TEXT NOT NULL DEFAULT 'BRL', ativo INTEGER NOT NULL DEFAULT 1, criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime'))); INSERT INTO alunos (nome) VALUES ('Antigo');");
    d.close();
    const db = await openDb({ file });
    assert.equal(versao(db), ULTIMA_VERSAO);
    assert.equal(db.get<{ nome: string }>('SELECT nome FROM alunos')!.nome, 'Antigo');
    assert.equal(db.all("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'idiomas'").length, 1);
    db.close();
    assert.ok(existsSync(`${file}.pre-migracao-v0`));
  });
});

test('lista de migrations fora de sequência é recusada', async () => {
  await assert.rejects(openDb({ migrations: [MIGRATIONS[0], extra(3, 'SELECT 1')] }), /sequência/);
});
