import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { openDb } from '../main/db.ts';
import { iniciarBackupAutomatico } from '../main/backup.ts';
import { criarServidorHttp } from './transport/http.ts';
import { AplicacaoCentral } from './application.ts';
const pasta = resolve(process.env.ESCOLA_SERVER_DATA ?? './var/escola');
mkdirSync(pasta, { recursive: true, mode: 0o700 });
const db = await openDb({ file: resolve(pasta, 'escola.db') });
const pararBackup = iniciarBackupAutomatico(db);
const server = criarServidorHttp(new AplicacaoCentral(db));
const host = process.env.ESCOLA_HOST ?? '127.0.0.1';
if (host !== '127.0.0.1' && process.env.ESCOLA_HTTPS_PROXY !== '1') throw new Error('Exposição de rede exige proxy HTTPS configurado.');
server.listen(Number(process.env.ESCOLA_PORT ?? 3489), host, () => console.log('API central iniciada'));
const parar = () =>
  server.close(() => {
    pararBackup();
    db.close();
    process.exit(0);
  });
process.on('SIGINT', parar);
process.on('SIGTERM', parar);
