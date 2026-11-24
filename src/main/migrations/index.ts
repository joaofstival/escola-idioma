import { migration003 } from './003-financeiro.ts';
import { migration002 } from './002-identidade.ts';
// Migrations versionadas: lista ordenada {versao, nome, sql}; a versão aplicada fica em PRAGMA user_version.
// Cada migration roda numa transação: falhou = rollback e erro claro, nunca sobe parcial.
import type { DatabaseSync } from 'node:sqlite';
import { existsSync, renameSync, rmSync } from 'node:fs';
import { migration001 } from './001-schema-inicial.ts';

export interface Migration {
  versao: number;
  nome: string;
  sql: string;
}

/** Ordem importa: versões sequenciais a partir de 1. Nunca edite uma migration já liberada; crie a próxima. */
export const MIGRATIONS: Migration[] = [migration001, migration002, migration003];
export const ULTIMA_VERSAO = MIGRATIONS[MIGRATIONS.length - 1].versao;

function versaoDoBanco(raw: DatabaseSync): number {
  return Number((raw.prepare('PRAGMA user_version').get() as { user_version: number }).user_version);
}

function temTabelas(raw: DatabaseSync): boolean {
  return (raw.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").get()!.n as number) > 0;
}

/** Cópia consistente (VACUUM INTO, vale com WAL) sem sobrescrever uma cópia anterior. */
function copiarAntes(raw: DatabaseSync, destino: string): void {
  if (existsSync(destino)) return;
  const tmp = `${destino}.${process.pid}.tmp`;
  rmSync(tmp, { force: true });
  try {
    raw.prepare('VACUUM INTO ?').run(tmp);
    renameSync(tmp, destino);
  } catch (err) {
    rmSync(tmp, { force: true });
    throw err;
  }
}

/** Recusa banco de versão maior que a do app, sem alterar nada. */
export function verificarVersao(raw: DatabaseSync, migrations: Migration[] = MIGRATIONS): void {
  const ultima = migrations[migrations.length - 1].versao;
  const atual = versaoDoBanco(raw);
  if (atual > ultima) {
    throw new Error(
      `Este banco foi criado por uma versão mais nova do app (versão ${atual}; este app entende até a ${ultima}). Atualize o app; nada foi alterado.`,
    );
  }
}

/**
 * Leva o banco até a última versão. `file` (quando há) recebe `<file>.pre-migracao-v<N>` com o estado de
 * antes (N = versão de origem) se já havia dados e há migration pendente.
 */
export function aplicarMigrations(raw: DatabaseSync, file: string | null, migrations: Migration[] = MIGRATIONS): void {
  migrations.forEach((m, i) => {
    if (m.versao !== i + 1) throw new Error(`Lista de migrations fora de sequência: posição ${i + 1} tem versão ${m.versao}.`);
  });
  verificarVersao(raw, migrations);
  const atual = versaoDoBanco(raw);
  const pendentes = migrations.filter((m) => m.versao > atual);
  if (pendentes.length === 0) return;
  // Banco sem versão mas com tabelas (v0): a 001 usa IF NOT EXISTS, então só completa o que falta.
  if (file && temTabelas(raw)) copiarAntes(raw, `${file}.pre-migracao-v${atual}`);
  for (const m of pendentes) {
    raw.exec('BEGIN IMMEDIATE');
    try {
      raw.exec(m.sql);
      raw.exec(`PRAGMA user_version = ${m.versao}`);
      raw.exec('COMMIT');
    } catch (err) {
      try {
        raw.exec('ROLLBACK');
      } catch {
        /* sem transação aberta */
      }
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Migration ${m.versao} (${m.nome}) falhou: ${msg}. O banco ficou na versão ${m.versao - 1}.`);
    }
  }
}
