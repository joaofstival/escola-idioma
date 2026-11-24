import { openSync, closeSync, writeFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
export function bloquearPasta(pasta: string) {
  mkdirSync(pasta, { recursive: true, mode: 0o700 });
  let fd: number;
  try {
    fd = openSync(join(pasta, 'server.lock'), 'wx', 0o600);
  } catch {
    throw new Error(
      'Pasta em uso ou lock de execução anterior. Pare o servidor; confirme que o processo terminou antes de remover server.lock.',
    );
  }
  writeFileSync(fd, String(process.pid));
  let liberado = false;
  return () => {
    if (!liberado) {
      liberado = true;
      closeSync(fd);
      unlinkSync(join(pasta, 'server.lock'));
    }
  };
}
