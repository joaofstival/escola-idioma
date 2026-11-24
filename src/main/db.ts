// Banco de dados: SQLite nativo do Node (node:sqlite), em arquivo com WAL (cada escrita já vai para o disco).
// Sem `file` o banco fica só em memória (usado nos testes).
import { DatabaseSync } from 'node:sqlite';
import type { StatementSync } from 'node:sqlite';
import { existsSync, mkdirSync, openSync, readSync, closeSync } from 'node:fs';
import { copiarSemSobrescrever } from './arquivos.ts';
import { dirname } from 'node:path';
import { aplicarMigrations, verificarVersao } from './migrations/index.ts';
import type { Migration } from './migrations/index.ts';

/** Valores aceitos como parâmetro: booleanos viram 0/1 e undefined vira NULL. */
export type Param = string | number | boolean | null | undefined | Uint8Array;
export type Params = Param[] | Record<string, Param>;

export interface RunResult {
  lastInsertRowid: number;
  changes: number;
}

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

/** Tabelas na ordem de criação (dependências primeiro). Usado para limpar os dados. */
export const TABELAS = [
  'idiomas',
  'alunos',
  'professores',
  'professor_idiomas',
  'turmas',
  'matriculas',
  'materiais',
  'mensalidades',
  'avaliacoes',
  'avaliacao_respostas',
  'avaliacao_resposta_itens',
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
  copiarSemSobrescrever(file, copia);
}

export interface OpenDbOptions {
  file?: string;
  /** Só para testes: lista alternativa de migrations. */ migrations?: Migration[];
}

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
  try {
    verificarVersao(raw, opts.migrations); // versão futura é recusada antes de qualquer mudança no arquivo
  } catch (err) {
    raw.close();
    throw err;
  }
  if (file) raw.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;');
  raw.exec('PRAGMA foreign_keys = ON;');
  try {
    aplicarMigrations(raw, file, opts.migrations);
  } catch (err) {
    raw.close(); // não deixa o arquivo preso
    throw err;
  }

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
        try {
          raw.exec(profundidade === 0 ? 'ROLLBACK' : `ROLLBACK TO ${nome}; RELEASE ${nome}`);
        } catch {
          /* o SQLite já desfez sozinho (ex.: disco cheio): mantém o erro original */
        }
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
    for (const t of ['movimentacoes_financeiras', 'auditoria', 'acessos_temporarios', 'sessoes', 'usuarios']) {
      if (db.get("SELECT name FROM sqlite_master WHERE type='table' AND name=?", [t])) db.run(`DELETE FROM ${t}`);
    }
    for (const t of [...TABELAS].reverse()) db.run(`DELETE FROM ${t}`);
    db.run(`DELETE FROM sqlite_sequence`);
  });
}
