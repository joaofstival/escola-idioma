import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { openDb } from '../main/db.ts';
import { seed } from '../main/seed.ts';
import { AplicacaoCentral } from './application.ts';
import { bloquearPasta } from './runtime.ts';
process.env.ESCOLA_SERVER_DATA = resolve(process.env.ESCOLA_DEMO_DATA ?? './var/demo');
const pasta = process.env.ESCOLA_SERVER_DATA;
if (!existsSync(resolve(pasta, 'escola.db'))) {
  const liberar = bloquearPasta(pasta),
    db = await openDb({ file: resolve(pasta, 'escola.db') });
  try {
    seed(db);
    const app = new AplicacaoCentral(db),
      senha = process.env.ESCOLA_DEMO_PASSWORD ?? randomBytes(15).toString('base64url');
    await app.identidade.provisionarAdmin('admin@demo.escola', senha);
    const sessao = await app.identidade.login({ email: 'admin@demo.escola', senha });
    const ano = new Date().getFullYear();
    const aluno = db.get<{ id: number }>(
      "SELECT aluno_id id FROM matriculas WHERE turma_id IN(SELECT id FROM turmas WHERE professor_id IS NOT NULL AND ano_letivo=?) AND status='ativa' ORDER BY id LIMIT 1",
      [ano],
    );
    const prof = aluno
      ? db.get<{ id: number }>(
          'SELECT t.professor_id id FROM turmas t JOIN matriculas m ON m.turma_id=t.id WHERE m.aluno_id=? AND m.ano_letivo=? LIMIT 1',
          [aluno.id, ano],
        )
      : undefined;
    for (const papel of ['aluno', 'professor', 'secretaria', 'financeiro'] as const) {
      const id = papel === 'aluno' ? aluno?.id : papel === 'professor' ? prof?.id : undefined;
      if (['aluno', 'professor'].includes(papel) && !id) continue;
      const conta = await app.identidade.criarConta(sessao.usuario, {
        nome: 'Demonstração ' + papel,
        email: papel + '@demo.escola',
        papel,
        ...(papel === 'aluno' ? { aluno_id: id } : papel === 'professor' ? { professor_id: id } : {}),
      });
      await app.identidade.ativar({ codigo: conta.codigoAtivacao, senha });
    }
    if (aluno) {
      const turma = db.get<{ id: number }>('SELECT turma_id id FROM matriculas WHERE aluno_id=? AND ano_letivo=? LIMIT 1', [aluno.id, ano]);
      if (turma) {
        const candidata = new Date(Date.now() + 86400000);
        const amanha = (candidata.getFullYear() === ano ? candidata : new Date()).toLocaleDateString('sv-SE');
        app.diario.criar(sessao.usuario, { turma_id: turma.id, data: amanha, inicio: '18:00', fim: '19:00', local: 'Sala 1' });
        app.biblioteca.criar(sessao.usuario, {
          turma_id: turma.id,
          titulo: 'Dicionário para os estudos',
          descricao: 'Material complementar para consulta em casa.',
          link: 'https://dictionary.cambridge.org/',
          estado: 'publicado',
        });
        app.aprendizagem.criar(sessao.usuario, {
          turma_id: turma.id,
          titulo: 'Prática de apresentação pessoal',
          descricao: 'Escreva uma apresentação curta para retomarmos na próxima aula presencial.',
          prazo: amanha,
          valor_max: 10,
          estado: 'publicada',
        });
        app.comunicacao.publicar(sessao.usuario, {
          titulo: 'Bem-vindos à área da escola',
          texto: 'Consulte sua agenda, os materiais da turma e suas atividades. Para dúvidas, abra uma solicitação à secretaria.',
          expira_em: new Date(Date.now() + 30 * 86400000).toLocaleDateString('sv-SE'),
        });
      }
    }
    app.identidade.logout(sessao.token);
    console.log('DADOS FICTÍCIOS. Contas: admin, aluno, professor, secretaria, financeiro @demo.escola');
    console.log('Senha gerada apenas para esta demonstração:', senha);
  } finally {
    db.close();
    liberar();
  }
}
await import('./bootstrap.ts');
