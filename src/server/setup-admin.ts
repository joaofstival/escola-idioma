import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { openDb } from '../main/db.ts';
import { AplicacaoCentral } from './application.ts';
const email = process.env.ESCOLA_ADMIN_EMAIL,
  senha = process.env.ESCOLA_ADMIN_PASSWORD;
if (!email || !senha)
  throw new Error('Defina ESCOLA_ADMIN_EMAIL e ESCOLA_ADMIN_PASSWORD somente para esta execução. Senha com pelo menos 12 caracteres.');
const pasta = resolve(process.env.ESCOLA_SERVER_DATA ?? './var/escola');
mkdirSync(pasta, { recursive: true, mode: 0o700 });
const db = await openDb({ file: resolve(pasta, 'escola.db') });
try {
  await new AplicacaoCentral(db).identidade.provisionarAdmin(email, senha);
  console.log('Administrador inicial criado. Remova as variáveis de senha da sessão.');
} finally {
  db.close();
}
