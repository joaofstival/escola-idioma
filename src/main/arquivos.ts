// Utilitários de arquivo para cópias de segurança: gravar completo ou não gravar.
import { closeSync, copyFileSync, existsSync, fsyncSync, openSync, renameSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';

/** fsync do arquivo (ou da pasta, para o rename ficar durável). */
export function sincronizar(caminho: string): void {
  const fd = openSync(caminho, 'r');
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

/** Renomeia e sincroniza o arquivo e a pasta. */
export function renomearDuravel(tmp: string, destino: string): void {
  sincronizar(tmp);
  renameSync(tmp, destino);
  sincronizar(dirname(destino));
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
