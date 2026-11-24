import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { openDb } from '../main/db.ts';
import { createApi } from '../main/app.ts';
import { criarServidorHttp } from './transport/http.ts';
import { timingSafeEqual } from 'node:crypto';

// Fundação de desenvolvimento: autenticação individual substitui este token na parte 3.
const segredo = process.env.ESCOLA_DEV_TOKEN;
if (!segredo || segredo.length < 32) throw new Error('Defina ESCOLA_DEV_TOKEN com pelo menos 32 caracteres para desenvolvimento local.');
const pasta = resolve(process.env.ESCOLA_SERVER_DATA ?? './var/escola');
mkdirSync(pasta, { recursive: true, mode: 0o700 });
const db = await openDb({ file: resolve(pasta, 'escola.db') });
const api = createApi(db);
const server = criarServidorHttp({
  async handle(req, token) {
    const a = Buffer.from(token ?? '');
    const b = Buffer.from(segredo);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, status: 401, erro: 'Acesso não autorizado' };
    return api.handle(req);
  },
});
server.listen(Number(process.env.ESCOLA_PORT ?? 3489), '127.0.0.1', () => console.log('API de desenvolvimento em 127.0.0.1:3489'));
const parar = () =>
  server.close(() => {
    db.close();
    process.exit(0);
  });
process.on('SIGINT', parar);
process.on('SIGTERM', parar);
