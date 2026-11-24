import { abrirBancoCentral } from './restauracao.ts';
import { bloquearPasta } from './runtime.ts';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { iniciarBackupAutomatico } from '../main/backup.ts';
import { criarServidorHttp } from './transport/http.ts';
import { AplicacaoCentral } from './application.ts';
const host = process.env.ESCOLA_HOST ?? '127.0.0.1';
const port = Number(process.env.ESCOLA_PORT ?? 3489);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('ESCOLA_PORT inválida');
if (host !== '127.0.0.1' && process.env.ESCOLA_HTTPS_PROXY !== '1') throw new Error('Exposição de rede exige proxy HTTPS configurado.');
const pasta = resolve(process.env.ESCOLA_SERVER_DATA ?? './var/escola');
mkdirSync(pasta, { recursive: true, mode: 0o700 });
const liberar = bloquearPasta(pasta);
const db = await abrirBancoCentral(pasta);
const pararBackup = iniciarBackupAutomatico(db);
const server = criarServidorHttp(new AplicacaoCentral(db));
server.listen(port, host, () => console.log('API central iniciada'));
server.on('error', () => {
  pararBackup();
  db.close();
  liberar();
  process.exit(1);
});
const parar = () =>
  server.close(() => {
    pararBackup();
    db.close();
    liberar();
    process.exit(0);
  });
process.on('SIGINT', parar);
process.on('SIGTERM', parar);
