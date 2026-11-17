// Banco de dados: SQLite nativo do Node (node:sqlite), em arquivo com WAL (cada escrita já vai para o disco).
// Sem `file` o banco fica só em memória (usado nos testes).
import { DatabaseSync } from 'node:sqlite';
import type { StatementSync } from 'node:sqlite';
import { existsSync, mkdirSync, copyFileSync, openSync, readSync, closeSync, constants } from 'node:fs';
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
  /** Executa um comando de escrita (grava direto no arquivo). */
  run(sql: string, params?: Params): RunResult;
  /** Executa vários comandos SQL sem parâmetros (DDL, scripts). */
  exec(sql: string): void;
  /** Executa fn numa transação (aninhável via SAVEPOINT). */
  transaction<T>(fn: () => T): T;
  /** Faz checkpoint do WAL e fecha o banco. */
  close(): void;
  /** Caminho do arquivo ou null quando em memória. */
  readonly file: string | null;
  /** Acesso ao DatabaseSync do node:sqlite (uso avançado). */
  readonly raw: DatabaseSync;
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

/** Remove acentos e passa para minúsculas: usada nas buscas (função SQL `sem_acento`). */
export function semAcento(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  return String(v).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

type Bindable = string | number | bigint | null | Uint8Array;

function converterValor(v: Param): Bindable {
  return v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v;
}

/** Posicionais viram lista; nomeados viram objeto (o node:sqlite aceita a chave com ou sem prefixo). */
function converterParams(params?: Params): Bindable[] | [Record<string, Bindable>] {
  if (params === undefined) return [];
  if (Array.isArray(params)) return params.map(converterValor);
  const out: Record<string, Bindable> = {};
  for (const [k, v] of Object.entries(params)) out[k] = converterValor(v);
  return [out];
}

/** O node:sqlite devolve objetos sem protótipo; copiamos para um objeto comum e convertemos os booleanos. */
function converterLinha(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...row };
  for (const k of Object.keys(out)) {
    if (BOOL_COLUMNS.has(k) && (out[k] === 0 || out[k] === 1)) out[k] = out[k] === 1;
  }
  return out;
}

/** Sufixo da cópia feita antes da primeira abertura de um arquivo gravado pelo motor antigo (SQLite em WASM). */
export const SUFIXO_PRE_NODE_SQLITE = '.pre-node-sqlite';

/**
 * Arquivos do motor antigo ficam em modo "rollback journal" (bytes 18-19 do cabeçalho = 01 01); depois da
 * primeira abertura aqui viram WAL (02 02). Copia o arquivo fechado antes dessa troca, uma única vez.
 */
function copiarAntesDaTrocaDeMotor(file: string): void {
  const copia = file + SUFIXO_PRE_NODE_SQLITE;
  if (!existsSync(file) || existsSync(copia)) return;
  const fd = openSync(file, 'r');
  const cab = Buffer.alloc(20);
  try {
    if (readSync(fd, cab, 0, 20, 0) < 20) return;
  } finally {
    closeSync(fd);
  }
  if (cab.subarray(0, 15).toString('latin1') !== 'SQLite format 3' || cab[18] !== 1 || cab[19] !== 1) return;
  copyFileSync(file, copia, constants.COPYFILE_EXCL);
}

export interface OpenDbOptions { file?: string }

/** Abre (ou cria) o banco. Sem `file`, cria um banco em memória. Assíncrona por compatibilidade com os chamadores. */
export async function openDb(opts: OpenDbOptions = {}): Promise<Db> {
  const file = opts.file ?? null;
  if (file) {
    mkdirSync(dirname(file), { recursive: true });
    copiarAntesDaTrocaDeMotor(file);
  }
  const raw = new DatabaseSync(file ?? ':memory:');
  raw.function('sem_acento', { deterministic: true }, (v) => semAcento(v));
  raw.exec('PRAGMA busy_timeout = 5000;');
  if (file) raw.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;');
  raw.exec('PRAGMA foreign_keys = ON;');
  raw.exec(SCHEMA);
  raw.exec(`PRAGMA user_version = ${SCHEMA_VERSION};`);

  let profundidade = 0; // nível de transação aninhada

  function preparar(sql: string): StatementSync {
    const stmt = raw.prepare(sql);
    stmt.setAllowUnknownNamedParameters(true); // o motor antigo ignorava parâmetro nomeado a mais
    return stmt;
  }

  function consultar(sql: string, params?: Params): Record<string, unknown>[] {
    const linhas = preparar(sql).all(...(converterParams(params) as [])) as Record<string, unknown>[];
    return linhas.map(converterLinha);
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
      const r = preparar(sql).run(...(converterParams(params) as []));
      return { lastInsertRowid: Number(r.lastInsertRowid), changes: Number(r.changes) };
    },
    exec(sql: string): void {
      raw.exec(sql);
    },
    transaction<T>(fn: () => T): T {
      const nome = `sp_${profundidade}`;
      raw.exec(profundidade === 0 ? 'BEGIN IMMEDIATE' : `SAVEPOINT ${nome}`);
      profundidade++;
      try {
        const r = fn();
        if (r instanceof Promise) throw new Error('transaction() não aceita funções assíncronas');
        profundidade--;
        raw.exec(profundidade === 0 ? 'COMMIT' : `RELEASE ${nome}`);
        return r;
      } catch (err) {
        profundidade--;
        raw.exec(profundidade === 0 ? 'ROLLBACK' : `ROLLBACK TO ${nome}; RELEASE ${nome}`);
        throw err;
      }
    },
    close(): void {
      if (!raw.isOpen) return;
      // Esvazia o WAL no arquivo principal: o app fechado não deixa -wal/-shm para trás.
      if (file) raw.exec('PRAGMA wal_checkpoint(TRUNCATE);');
      raw.close();
    },
  };
  return db;
}

/** Apaga todos os dados (mantém o schema) e zera os contadores de id. Usado por `--seed`. */
export function limparDados(db: Db): void {
  db.transaction(() => {
    for (const t of [...TABELAS].reverse()) db.run(`DELETE FROM ${t}`);
    db.run(`DELETE FROM sqlite_sequence`);
  });
}
