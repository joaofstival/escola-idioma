// Rotas de backup: lista e cria backup manual agora (exportar/restaurar com diálogo nativo ficam no main.ts).
import type { Db } from '../db.ts';
import type { Router } from '../router.ts';
import { HttpError } from '../router.ts';
import { criarBackup, listarBackups, obterEstadoBackup, pastaDeBackups } from '../backup.ts';
import type { BackupInfo } from '../../shared/types.ts';

export function register(router: Router, db: Db): void {
  const pasta = () => {
    try {
      return pastaDeBackups(db);
    } catch (err) {
      throw new HttpError(409, err instanceof Error ? err.message : String(err));
    }
  };
  router.get('/backups/estado', () => {
    pasta();
    return obterEstadoBackup(db);
  });
  router.get('/backups', () => listarBackups(pasta()) satisfies BackupInfo[]);
  router.post('/backups', () => criarBackup(db, pasta(), 'manual'), { status: 201 });
}
