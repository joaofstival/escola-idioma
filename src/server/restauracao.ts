import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { openDb } from '../main/db.ts';
import { concluirRestauracaoPendente } from '../main/backup.ts';
export async function abrirBancoCentral(pasta: string) {
  const restaurando = existsSync(resolve(pasta, 'escola.db.restaurar'));
  concluirRestauracaoPendente(pasta);
  const db = await openDb({ file: resolve(pasta, 'escola.db') });
  if (restaurando)
    db.transaction(() => {
      db.exec('DELETE FROM sessoes;DELETE FROM acessos_temporarios;');
      db.run(
        "INSERT INTO auditoria(acao,recurso,motivo) VALUES('RESTAURAR_BACKUP','servidor','Sessões e códigos revogados após restauração')",
      );
    });
  return db;
}
