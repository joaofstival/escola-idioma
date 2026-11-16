// Banco de dados: SQLite em WASM (sql.js), persistido em arquivo de forma atômica.
// Sem `file` o banco fica só em memória (usado nos testes).
import initSqlJs from 'sql.js';
import type { Database, SqlJsStatic, SqlValue } from 'sql.js';
import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';

/** Valores aceitos como parâmetro: booleanos viram 0/1 e undefined vira NULL. */
export type Param = string | number | boolean | null | undefined | Uint8Array;
export type Params = Param[] | Record<string, Param>;

export interface RunResult { lastInsertRowid: number; changes: number }

export interface Db {
  /** Todas as linhas da consulta. */
  all<T = Record<string, unknown>>(sql: string, params?: Params): T[];
  /** Primeira linha ou undefined. */
  get<T = Record<string, unknown>>(sql: string, params?: Params): T | undefined;
  /** Executa um comando de escrita e persiste em disco (exceto dentro de transaction). */
  run(sql: string, params?: Params): RunResult;
  /** Executa vários comandos SQL sem parâmetros (DDL, scripts). */
  exec(sql: string): void;
  /** Executa fn numa transação (aninhável via SAVEPOINT). Persiste ao final da transação externa. */
  transaction<T>(fn: () => T): T;
  /** Grava o banco em disco (temporário + rename). Não faz nada em bancos em memória. */
  persist(): void;
  /** Fecha o banco (persistindo antes). */
  close(): void;
  /** Caminho do arquivo ou null quando em memória. */
  readonly file: string | null;
  /** Acesso ao objeto sql.js (uso avançado). */
  readonly raw: Database;
}

/** Colunas INTEGER 0/1 que são devolvidas como boolean. Partes futuras podem acrescentar nomes. */
export const BOOL_COLUMNS = new Set<string>(['ativo']);

export const SCHEMA_VERSION = 1;

/** Schema completo (seção 3 do PLANO.md), inclusive tabelas usadas nas partes 3 e 4. */
export const SCHEMA = `
CREATE TABLE IF NOT EXISTS idiomas (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  nome        TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK (length(trim(nome)) > 0),
  codigo      TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK (length(trim(codigo)) > 0),
  mensalidade REAL NOT NULL CHECK (mensalidade >= 0)
);

CREATE TABLE IF NOT EXISTS alunos (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  nome            TEXT NOT NULL CHECK (length(trim(nome)) > 0),
  data_nascimento TEXT,
  documento       TEXT,
  email           TEXT,
  telefone        TEXT,
  endereco        TEXT,
  pais_origem     TEXT,
  moeda_origem    TEXT NOT NULL DEFAULT 'BRL' CHECK (length(moeda_origem) = 3),
  ativo           INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0, 1)),
  criado_em       TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_alunos_documento ON alunos(documento) WHERE documento IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_alunos_nome ON alunos(nome);
CREATE INDEX IF NOT EXISTS ix_alunos_ativo ON alunos(ativo);

CREATE TABLE IF NOT EXISTS professores (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  nome     TEXT NOT NULL CHECK (length(trim(nome)) > 0),
  email    TEXT,
  telefone TEXT,
  ativo    INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0, 1))
);

CREATE TABLE IF NOT EXISTS professor_idiomas (
  professor_id INTEGER NOT NULL REFERENCES professores(id) ON DELETE CASCADE,
  idioma_id    INTEGER NOT NULL REFERENCES idiomas(id) ON DELETE RESTRICT,
  PRIMARY KEY (professor_id, idioma_id)
);
CREATE INDEX IF NOT EXISTS ix_professor_idiomas_idioma ON professor_idiomas(idioma_id);

CREATE TABLE IF NOT EXISTS turmas (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  nome         TEXT NOT NULL CHECK (length(trim(nome)) > 0),
  idioma_id    INTEGER NOT NULL REFERENCES idiomas(id) ON DELETE RESTRICT,
  nivel        INTEGER NOT NULL CHECK (nivel BETWEEN 1 AND 12),
  ano_letivo   INTEGER NOT NULL CHECK (ano_letivo BETWEEN 2000 AND 2100),
  professor_id INTEGER REFERENCES professores(id) ON DELETE RESTRICT,
  horario      TEXT,
  capacidade   INTEGER NOT NULL CHECK (capacidade >= 1),
  UNIQUE (nome, ano_letivo)
);
CREATE INDEX IF NOT EXISTS ix_turmas_filtro ON turmas(ano_letivo, idioma_id, nivel);
CREATE INDEX IF NOT EXISTS ix_turmas_professor ON turmas(professor_id);

CREATE TABLE IF NOT EXISTS matriculas (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  aluno_id   INTEGER NOT NULL REFERENCES alunos(id) ON DELETE RESTRICT,
  turma_id   INTEGER NOT NULL REFERENCES turmas(id) ON DELETE RESTRICT,
  ano_letivo INTEGER NOT NULL CHECK (ano_letivo BETWEEN 2000 AND 2100),
  tipo       TEXT NOT NULL DEFAULT 'matricula' CHECK (tipo IN ('matricula', 'rematricula')),
  status     TEXT NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa', 'cancelada', 'concluida')),
  data       TEXT NOT NULL DEFAULT (date('now', 'localtime')),
  UNIQUE (aluno_id, turma_id, ano_letivo)
);
CREATE INDEX IF NOT EXISTS ix_matriculas_turma ON matriculas(turma_id, status);
CREATE INDEX IF NOT EXISTS ix_matriculas_aluno ON matriculas(aluno_id);
CREATE INDEX IF NOT EXISTS ix_matriculas_ano ON matriculas(ano_letivo);

CREATE TABLE IF NOT EXISTS materiais (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  titulo     TEXT NOT NULL CHECK (length(trim(titulo)) > 0),
  tipo       TEXT NOT NULL CHECK (tipo IN ('livro', 'apostila', 'audio', 'video', 'link', 'outro')),
  idioma_id  INTEGER NOT NULL REFERENCES idiomas(id) ON DELETE RESTRICT,
  nivel      INTEGER NOT NULL CHECK (nivel BETWEEN 1 AND 12),
  autor      TEXT,
  referencia TEXT,
  descricao  TEXT
);
CREATE INDEX IF NOT EXISTS ix_materiais_idioma_nivel ON materiais(idioma_id, nivel);

CREATE TABLE IF NOT EXISTS mensalidades (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  matricula_id    INTEGER NOT NULL REFERENCES matriculas(id) ON DELETE RESTRICT,
  aluno_id        INTEGER NOT NULL REFERENCES alunos(id) ON DELETE RESTRICT,
  competencia     TEXT NOT NULL CHECK (competencia GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]'),
  valor           REAL NOT NULL CHECK (valor >= 0),
  vencimento      TEXT NOT NULL CHECK (vencimento GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
  status          TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'paga', 'cancelada')),
  data_pagamento  TEXT,
  valor_pago      REAL CHECK (valor_pago IS NULL OR valor_pago >= 0),
  forma_pagamento TEXT,
  UNIQUE (matricula_id, competencia),
  CHECK (status <> 'paga' OR (data_pagamento IS NOT NULL AND valor_pago IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS ix_mensalidades_aluno ON mensalidades(aluno_id);
CREATE INDEX IF NOT EXISTS ix_mensalidades_status_venc ON mensalidades(status, vencimento);
CREATE INDEX IF NOT EXISTS ix_mensalidades_competencia ON mensalidades(competencia);

CREATE TABLE IF NOT EXISTS avaliacoes (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  turma_id  INTEGER NOT NULL REFERENCES turmas(id) ON DELETE RESTRICT,
  titulo    TEXT NOT NULL CHECK (length(trim(titulo)) > 0),
  descricao TEXT,
  form      TEXT NOT NULL CHECK (json_valid(form)),
  criado_em TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);
CREATE INDEX IF NOT EXISTS ix_avaliacoes_turma ON avaliacoes(turma_id);

CREATE TABLE IF NOT EXISTS avaliacao_respostas (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  avaliacao_id INTEGER NOT NULL REFERENCES avaliacoes(id) ON DELETE CASCADE,
  aluno_id     INTEGER NOT NULL REFERENCES alunos(id) ON DELETE RESTRICT,
  score        REAL CHECK (score IS NULL OR score BETWEEN 0 AND 10),
  criado_em    TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  UNIQUE (avaliacao_id, aluno_id)
);
CREATE INDEX IF NOT EXISTS ix_avaliacao_respostas_aluno ON avaliacao_respostas(aluno_id);

CREATE TABLE IF NOT EXISTS avaliacao_resposta_itens (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  resposta_id  INTEGER NOT NULL REFERENCES avaliacao_respostas(id) ON DELETE CASCADE,
  question_id  TEXT NOT NULL,
  row_id       TEXT,
  option_id    TEXT,
  value_text   TEXT,
  value_number REAL,
  reason       TEXT
);
CREATE INDEX IF NOT EXISTS ix_itens_resposta ON avaliacao_resposta_itens(resposta_id);
CREATE INDEX IF NOT EXISTS ix_itens_question ON avaliacao_resposta_itens(question_id);
`;

/** Tabelas na ordem de criação (dependências primeiro). Usado para limpar os dados. */
export const TABELAS = [
  'idiomas', 'alunos', 'professores', 'professor_idiomas', 'turmas', 'matriculas', 'materiais',
  'mensalidades', 'avaliacoes', 'avaliacao_respostas', 'avaliacao_resposta_itens',
] as const;

const sqlCache = new Map<string, Promise<SqlJsStatic>>();
function carregarSql(wasmPath?: string): Promise<SqlJsStatic> {
  const chave = wasmPath ?? '';
  let p = sqlCache.get(chave);
  if (!p) {
    p = initSqlJs(wasmPath ? { locateFile: () => wasmPath } : undefined);
    sqlCache.set(chave, p);
  }
  return p;
}

/** Remove acentos e passa para minúsculas: usada nas buscas (função SQL `sem_acento`). */
export function semAcento(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  return String(v).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function converterParams(params?: Params): SqlValue[] | Record<string, SqlValue> | undefined {
  if (params === undefined) return undefined;
  const conv = (v: Param): SqlValue => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v);
  if (Array.isArray(params)) return params.map(conv);
  const out: Record<string, SqlValue> = {};
  for (const [k, v] of Object.entries(params)) out[/^[:@$]/.test(k) ? k : ':' + k] = conv(v);
  return out;
}

function converterLinha(row: Record<string, SqlValue>): Record<string, unknown> {
  for (const k of Object.keys(row)) {
    if (BOOL_COLUMNS.has(k) && (row[k] === 0 || row[k] === 1)) (row as Record<string, unknown>)[k] = row[k] === 1;
  }
  return row;
}

/** Grava bytes de forma atômica: escreve num temporário ao lado e renomeia por cima. */
function gravarAtomico(file: string, data: Uint8Array): void {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  try {
    writeFileSync(tmp, data);
    renameSync(tmp, file);
  } catch (err) {
    rmSync(tmp, { force: true });
    throw err;
  }
}

export interface OpenDbOptions { file?: string; wasmPath?: string }

/** Abre (ou cria) o banco. Sem `file`, cria um banco em memória. */
export async function openDb(opts: OpenDbOptions = {}): Promise<Db> {
  const SQL = await carregarSql(opts.wasmPath);
  const file = opts.file ?? null;
  const raw = file && existsSync(file) ? new SQL.Database(readFileSync(file)) : new SQL.Database();
  raw.create_function('sem_acento', semAcento);
  raw.exec('PRAGMA foreign_keys = ON;');
  raw.exec(SCHEMA);
  raw.exec(`PRAGMA user_version = ${SCHEMA_VERSION};`);

  let profundidade = 0; // nível de transação aninhada
  let sujo = false;

  function consultar(sql: string, params?: Params): Record<string, unknown>[] {
    const stmt = raw.prepare(sql);
    try {
      const p = converterParams(params);
      if (p !== undefined) stmt.bind(p);
      const out: Record<string, unknown>[] = [];
      while (stmt.step()) out.push(converterLinha(stmt.getAsObject()));
      return out;
    } finally {
      stmt.free();
    }
  }

  function persist(): void {
    sujo = false;
    if (!file) return;
    gravarAtomico(file, raw.export());
    // Versões antigas do sql.js reabriam o banco no export() (perdendo o PRAGMA); garante que segue ligado.
    raw.exec('PRAGMA foreign_keys = ON;');
  }

  const db: Db = {
    file,
    raw,
    all<T>(sql: string, params?: Params): T[] {
      return consultar(sql, params) as T[];
    },
    get<T>(sql: string, params?: Params): T | undefined {
      return consultar(sql, params)[0] as T | undefined;
    },
    run(sql: string, params?: Params): RunResult {
      const stmt = raw.prepare(sql);
      try {
        const p = converterParams(params);
        if (p !== undefined) stmt.bind(p);
        stmt.step();
      } finally {
        stmt.free();
      }
      const changes = raw.getRowsModified();
      const id = raw.exec('SELECT last_insert_rowid() AS id')[0]?.values[0]?.[0];
      sujo = true;
      if (profundidade === 0) persist();
      return { lastInsertRowid: Number(id ?? 0), changes };
    },
    exec(sql: string): void {
      raw.exec(sql);
      sujo = true;
      if (profundidade === 0) persist();
    },
    transaction<T>(fn: () => T): T {
      const nome = `sp_${profundidade}`;
      raw.exec(profundidade === 0 ? 'BEGIN' : `SAVEPOINT ${nome}`);
      profundidade++;
      try {
        const r = fn();
        if (r instanceof Promise) throw new Error('transaction() não aceita funções assíncronas');
        profundidade--;
        raw.exec(profundidade === 0 ? 'COMMIT' : `RELEASE ${nome}`);
        if (profundidade === 0 && sujo) persist();
        return r;
      } catch (err) {
        profundidade--;
        raw.exec(profundidade === 0 ? 'ROLLBACK' : `ROLLBACK TO ${nome}; RELEASE ${nome}`);
        throw err;
      }
    },
    persist,
    close(): void {
      if (sujo) persist();
      raw.close();
    },
  };

  // Banco novo em arquivo: grava logo para o arquivo existir com o schema.
  if (file && !existsSync(file)) persist();
  return db;
}

/** Apaga todos os dados (mantém o schema) e zera os contadores de id. Usado por `--seed`. */
export function limparDados(db: Db): void {
  db.transaction(() => {
    for (const t of [...TABELAS].reverse()) db.run(`DELETE FROM ${t}`);
    db.run(`DELETE FROM sqlite_sequence`);
  });
}
