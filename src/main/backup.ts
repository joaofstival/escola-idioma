// Backup e restauração do banco. Sem dependência do Electron (testável com node --test).
// Backups: VACUUM INTO (cópia consistente mesmo com WAL). Restauração em duas fases: validar e preparar
// `escola.db.restaurar` com o app aberto; trocar os arquivos no próximo boot, antes de abrir o banco.
import { DatabaseSync } from 'node:sqlite';
import {
  existsSync, mkdirSync, readdirSync, statSync, renameSync, rmSync, copyFileSync, mkdtempSync, constants,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import type { Db } from './db.ts';
import { TABELAS } from './db.ts';
import { ULTIMA_VERSAO } from './migrations/index.ts';
import type { BackupInfo } from '../shared/types.ts';

export const RETENCAO_AUTOMATICOS = 14;
const NOME_RE = /^escola-(auto|manual)-(\d{4})-(\d{2})-(\d{2})-(\d{6})(?:-\d+)?\.db$/;

const dois = (n: number) => String(n).padStart(2, '0');
const dataLocal = (d: Date) => `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;
const horaLocal = (d: Date) => `${dois(d.getHours())}${dois(d.getMinutes())}${dois(d.getSeconds())}`;

/** Pasta de backups ao lado do banco: userData/backups. */
export function pastaDeBackups(db: Db): string {
  if (!db.file) throw new Error('Backup indisponível: o banco está só em memória');
  return join(dirname(db.file), 'backups');
}

/** VACUUM INTO num temporário e rename: nunca deixa arquivo parcial no destino. */
function copiarConsistente(db: Db, destino: string, sobrescrever: boolean): void {
  if (!sobrescrever && existsSync(destino)) throw new Error(`O arquivo já existe: ${basename(destino)}`);
  mkdirSync(dirname(destino), { recursive: true });
  const tmp = `${destino}.${process.pid}.tmp`;
  rmSync(tmp, { force: true });
  try {
    db.raw.prepare('VACUUM INTO ?').run(tmp);
    if (!sobrescrever && existsSync(destino)) throw new Error(`O arquivo já existe: ${basename(destino)}`);
    renameSync(tmp, destino);
  } catch (err) {
    rmSync(tmp, { force: true });
    throw err;
  }
}

function infoDoArquivo(pasta: string, nome: string): BackupInfo | null {
  const m = NOME_RE.exec(nome);
  if (!m) return null;
  const st = statSync(join(pasta, nome));
  return { nome, tamanho: st.size, criadoEm: st.mtime.toISOString(), tipo: m[1] as 'auto' | 'manual' };
}

/** Backups da pasta, do mais novo para o mais antigo (o nome carrega data e hora). */
export function listarBackups(pasta: string): BackupInfo[] {
  if (!existsSync(pasta)) return [];
  const carimbo = (n: string) => NOME_RE.exec(n)!.slice(2).join('') + n; // data+hora primeiro, independente do tipo
  return readdirSync(pasta).filter((n) => NOME_RE.test(n)).sort((a, b) => carimbo(b).localeCompare(carimbo(a)))
    .map((n) => infoDoArquivo(pasta, n)).filter((i): i is BackupInfo => i !== null);
}

/** Cria `escola-<auto|manual>-AAAA-MM-DD-HHmmss.db`. Nome repetido no mesmo segundo ganha sufixo -2, -3... */
export function criarBackup(db: Db, pasta: string, motivo: 'auto' | 'manual', agora: Date = new Date()): BackupInfo {
  const base = `escola-${motivo}-${dataLocal(agora)}-${horaLocal(agora)}`;
  let nome = `${base}.db`;
  for (let i = 2; existsSync(join(pasta, nome)); i++) nome = `${base}-${i}.db`;
  copiarConsistente(db, join(pasta, nome), false);
  return infoDoArquivo(pasta, nome)!;
}

/** Mantém só os `max` automáticos mais novos; manuais (e qualquer outro arquivo) nunca são apagados. */
export function aplicarRetencao(pasta: string, max = RETENCAO_AUTOMATICOS): string[] {
  const autos = listarBackups(pasta).filter((b) => b.tipo === 'auto'); // mais novo primeiro
  const apagar = autos.slice(max).map((b) => b.nome);
  for (const n of apagar) rmSync(join(pasta, n), { force: true });
  return apagar;
}

/** Backup automático do dia: cria só se ainda não existe um automático com a data de hoje. */
export function backupDiario(db: Db, pasta: string, agora: Date = new Date()): BackupInfo | null {
  const hoje = dataLocal(agora);
  if (listarBackups(pasta).some((b) => b.tipo === 'auto' && b.nome.startsWith(`escola-auto-${hoje}-`))) return null;
  const info = criarBackup(db, pasta, 'auto', agora);
  aplicarRetencao(pasta);
  return info;
}

/** Falha de backup não derruba o app: registra e segue. */
export function backupDiarioSeguro(db: Db, pasta: string, agora: Date = new Date(), log: (m: string, e?: unknown) => void = console.error): BackupInfo | null {
  try {
    return backupDiario(db, pasta, agora);
  } catch (err) {
    log('[backup] falha ao criar o backup automático', err);
    return null;
  }
}

/**
 * Backup ao abrir e quando o dia muda com o app aberto (confere a cada `intervaloMs`).
 * Devolve a função que para o agendamento.
 */
export function iniciarBackupAutomatico(db: Db, opts: { agora?: () => Date; intervaloMs?: number; log?: (m: string, e?: unknown) => void } = {}): () => void {
  const agora = opts.agora ?? (() => new Date());
  const pasta = pastaDeBackups(db);
  backupDiarioSeguro(db, pasta, agora(), opts.log);
  const timer = setInterval(() => backupDiarioSeguro(db, pasta, agora(), opts.log), opts.intervaloMs ?? 30 * 60 * 1000);
  timer.unref();
  return () => clearInterval(timer);
}

/** Exporta uma cópia consistente para onde o usuário escolheu. `sobrescrever`: o diálogo nativo já confirmou. */
export function exportarBackup(db: Db, destino: string, sobrescrever = false): void {
  copiarConsistente(db, destino, sobrescrever);
}

// ---------- Restauração ----------

const SUFIXO_RESTAURAR = '.restaurar';

/**
 * Confere que `arquivo` é um banco desta escola: SQLite íntegro, versão 1..atual, as 11 tabelas, sem violação
 * de chave estrangeira. Trabalha numa cópia temporária, para nunca tocar (nem criar -wal ao lado de) o original.
 * Devolve a mensagem do problema ou null se estiver tudo certo.
 */
export function validarArquivoDeBackup(arquivo: string): string | null {
  if (!existsSync(arquivo) || !statSync(arquivo).isFile()) return 'Arquivo não encontrado';
  const dir = mkdtempSync(join(tmpdir(), 'escola-validar-'));
  const copia = join(dir, 'candidato.db');
  let d: DatabaseSync | null = null;
  try {
    copiarComWal(arquivo, copia);
    d = new DatabaseSync(copia);
    const integ = d.prepare('PRAGMA integrity_check').all() as { integrity_check: string }[];
    if (integ.length !== 1 || integ[0].integrity_check !== 'ok') return 'O arquivo está corrompido (falhou na verificação de integridade)';
    const versao = Number((d.prepare('PRAGMA user_version').get() as { user_version: number }).user_version);
    if (versao < 1) return 'O arquivo não é um banco da escola (sem versão)';
    if (versao > ULTIMA_VERSAO) return `O arquivo é de uma versão mais nova do app (versão ${versao}); atualize o app antes de restaurar`;
    const nomes = new Set((d.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map((r) => r.name));
    const faltam = TABELAS.filter((t) => !nomes.has(t));
    if (faltam.length) return `O arquivo não é um banco da escola (faltam tabelas: ${faltam.join(', ')})`;
    if (d.prepare('PRAGMA foreign_key_check').all().length) return 'O arquivo tem registros ligados a dados que não existem (falhou em foreign_key_check)';
    return null;
  } catch {
    return 'O arquivo não é um banco SQLite válido';
  } finally {
    try { d?.close(); } catch { /* já fechado */ }
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Fase 1 (app aberto): valida e gera `<userData>/escola.db.restaurar` com VACUUM INTO a partir do arquivo
 * escolhido (nunca copyFile: o -wal do original ficaria de fora). Não toca no banco atual.
 */
export function prepararRestauracao(origem: string, userData: string): void {
  const erro = validarArquivoDeBackup(origem);
  if (erro) throw new Error(erro);
  const dir = mkdtempSync(join(tmpdir(), 'escola-restaurar-'));
  const copia = join(dir, 'origem.db');
  const destino = join(userData, `escola.db${SUFIXO_RESTAURAR}`);
  const tmp = `${destino}.${process.pid}.tmp`;
  try {
    copiarComWal(origem, copia);
    const d = new DatabaseSync(copia);
    try {
      rmSync(tmp, { force: true });
      d.prepare('VACUUM INTO ?').run(tmp);
    } finally {
      d.close();
    }
    renameSync(tmp, destino);
  } catch (err) {
    rmSync(tmp, { force: true });
    throw err;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Copia o arquivo e, se existirem ao lado, o -wal e o -shm (o que só está no WAL faz parte do banco). */
function copiarComWal(origem: string, destino: string): void {
  copyFileSync(origem, destino);
  for (const s of ['-wal', '-shm']) if (existsSync(origem + s)) copyFileSync(origem + s, destino + s);
}

function nomeLivre(base: string): string {
  if (!existsSync(base)) return base;
  for (let i = 2; ; i++) if (!existsSync(`${base}-${i}`)) return `${base}-${i}`;
}

/**
 * Fase 2 (boot, antes de abrir o banco): se existe `escola.db.restaurar`, guarda o banco atual como
 * `escola.db.pre-restauracao-<data>` e troca. Devolve true se concluiu uma restauração (o chamador NÃO
 * deve rodar o seed nesse boot: um banco restaurado vazio não pode ser coberto por dados de exemplo).
 */
export function concluirRestauracaoPendente(userData: string, agora: Date = new Date()): boolean {
  const atual = join(userData, 'escola.db');
  const novo = `${atual}${SUFIXO_RESTAURAR}`;
  if (!existsSync(novo)) return false;
  const sufixos = ['-wal', '-shm'];
  if (existsSync(atual)) {
    const guardado = nomeLivre(`${atual}.pre-restauracao-${dataLocal(agora)}`);
    let checkpointOk = false;
    try {
      const d = new DatabaseSync(atual);
      try { d.exec('PRAGMA wal_checkpoint(TRUNCATE)'); checkpointOk = true; } finally { d.close(); }
    } catch { /* banco atual ilegível: guarda os arquivos como estão, abaixo */ }
    checkpointOk = checkpointOk && sufixos.every((s) => !existsSync(atual + s));
    copyFileSync(atual, guardado, constants.COPYFILE_EXCL);
    if (!checkpointOk) {
      // Sem checkpoint limpo o -wal pode ter dados que só existem lá: guarda junto, ao lado da cópia.
      for (const s of sufixos) if (existsSync(atual + s)) copyFileSync(atual + s, guardado + s);
    }
  }
  // Se caiu entre os renames: sem escola.db, só o .restaurar. Conclui a troca (nunca cria banco vazio).
  for (const s of sufixos) rmSync(atual + s, { force: true });
  renameSync(novo, atual);
  return true;
}
