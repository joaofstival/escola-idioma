// Utilitários de arquivo para cópias de segurança: gravar completo ou não gravar.
import { closeSync, copyFileSync, existsSync, fsyncSync, openSync, renameSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';

/** Flush do conteúdo. No Windows, FlushFileBuffers exige um handle com escrita. */
export function sincronizar(caminho: string): void {
  const fd = openSync(caminho, process.platform === 'win32' ? 'r+' : 'r');
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

/**
 * Publica somente conteúdo completo e sincronizado. POSIX também permite fsync da pasta.
 * Windows não oferece esse flush de diretório pela API do Node: não tenta abrir a pasta
 * como arquivo nem promete durabilidade do rename em queda de energia. Restaurações
 * mantêm a origem preparada até a publicação terminar, permitindo repetição segura.
 */
export function renomearDuravel(tmp: string, destino: string): void {
  sincronizar(tmp);
  renameSync(tmp, destino);
  if (process.platform !== 'win32') sincronizar(dirname(destino));
}

/** Copia para um temporário e renomeia: nunca deixa cópia parcial com o nome final; recusa se o destino existe. */
export function copiarSemSobrescrever(origem: string, destino: string): void {
  if (existsSync(destino)) throw new Error(`Já existe: ${destino}`);
  const tmp = `${destino}.${process.pid}.tmp`;
  try {
    copyFileSync(origem, tmp);
    renomearDuravel(tmp, destino);
  } catch (err) {
    rmSync(tmp, { force: true });
    throw err;
  }
}
