import { resolve } from 'node:path';
import { appendFileSync } from 'node:fs';
import { openDb } from '../main/db.ts';
import { criarBackup, pastaDeBackups, prepararRestauracao, validarArquivoDeBackup } from '../main/backup.ts';
import { AplicacaoCentral } from './application.ts';
import { bloquearPasta } from './runtime.ts';
const pasta = resolve(process.env.ESCOLA_SERVER_DATA ?? './var/escola');
const acao = process.argv[2],
  origem = process.argv[3];
if (!['backup', 'restaurar'].includes(acao)) throw new Error('Uso: npm run server:ops -- backup | restaurar C:/caminho/copia.db');
const liberar = bloquearPasta(pasta);
const db = await openDb({ file: resolve(pasta, 'escola.db') });
try {
  if (acao === 'backup') console.log('Backup criado:', criarBackup(db, pastaDeBackups(db), 'manual').nome);
  else {
    if (!origem) throw new Error('Informe o arquivo de backup');
    const email = process.env.ESCOLA_ADMIN_EMAIL,
      senha = process.env.ESCOLA_ADMIN_PASSWORD;
    if (!email || !senha) throw new Error('Restauração exige ESCOLA_ADMIN_EMAIL e ESCOLA_ADMIN_PASSWORD da conta administrativa atual');
    const aplicacao = new AplicacaoCentral(db),
      sessao = await aplicacao.identidade.login({ email, senha });
    aplicacao.identidade.logout(sessao.token);
    const problema = validarArquivoDeBackup(resolve(origem));
    if (problema) throw new Error(problema);
    prepararRestauracao(resolve(origem), pasta);
    appendFileSync(
      resolve(pasta, 'operacoes.log'),
      JSON.stringify({ acao: 'RESTAURACAO_PREPARADA', usuario: sessao.usuario.id, em: new Date().toISOString() }) + '\n',
      { mode: 0o600 },
    );
    console.log('Restauração validada e preparada. Inicie o servidor para concluir; as sessões serão revogadas.');
  }
} finally {
  db.close();
  liberar();
}
