// Rotas de alunos. O histórico (GET /alunos/:id/historico) é implementado na parte 3.
import type { Db } from '../db.ts';
import type { Router } from '../router.ts';
import { HttpError } from '../router.ts';
import { Validador, encontrado, exigirCorpo, parseId, queryBool } from '../validation.ts';
import type { Aluno } from '../../shared/types.ts';

const COLUNAS = 'id, nome, data_nascimento, documento, email, telefone, endereco, pais_origem, moeda_origem, ativo, criado_em';

export function buscarAluno(db: Db, id: number): Aluno {
  return encontrado(db.get<Aluno>(`SELECT ${COLUNAS} FROM alunos WHERE id = ?`, [id]), 'Aluno não encontrado');
}

function validar(db: Db, dados: Record<string, unknown>, id: number | null) {
  const v = new Validador(dados);
  const nome = v.texto('nome', { obrigatorio: true, max: 150 });
  const data_nascimento = v.data('data_nascimento', { naoFutura: true, rotulo: 'data de nascimento' });
  const documento = v.texto('documento', { max: 30 });
  const email = v.email('email', { rotulo: 'e-mail' });
  const telefone = v.texto('telefone', { max: 30 });
  const endereco = v.texto('endereco', { max: 300, rotulo: 'endereço' });
  const pais_origem = v.texto('pais_origem', { max: 60, rotulo: 'país de origem' });
  const moeda = (v.texto('moeda_origem', { rotulo: 'moeda de origem' }) ?? 'BRL').toUpperCase();
  if (!/^[A-Z]{3}$/.test(moeda)) v.erro('moeda de origem deve ser um código ISO 4217 de 3 letras, ex.: BRL, USD, EUR');
  const ativo = v.booleano('ativo', { padrao: true });
  if (documento && db.get('SELECT 1 FROM alunos WHERE documento = ? AND id <> ?', [documento, id ?? 0])) {
    v.erro(`Já existe um aluno com o documento "${documento}"`);
  }
  v.verificar();
  return { nome, data_nascimento, documento, email, telefone, endereco, pais_origem, moeda_origem: moeda, ativo: ativo ?? true };
}

export function register(router: Router, db: Db): void {
  router.get('/alunos', ({ query }) => {
    const where: string[] = [];
    const p: Record<string, string | number | boolean> = {};
    const busca = query.busca?.trim();
    if (busca) {
      where.push(`(instr(sem_acento(nome), sem_acento(:busca)) > 0 OR instr(sem_acento(coalesce(email, '')), sem_acento(:busca)) > 0
        OR instr(coalesce(documento, ''), :busca) > 0 OR instr(coalesce(telefone, ''), :busca) > 0)`);
      p.busca = busca;
    }
    const ativo = queryBool(query, 'ativo');
    if (ativo !== undefined) {
      where.push('ativo = :ativo');
      p.ativo = ativo;
    }
    return db.all<Aluno>(`SELECT ${COLUNAS} FROM alunos ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY nome COLLATE NOCASE`, p);
  });

  router.get('/alunos/:id', ({ params }) => buscarAluno(db, parseId(params.id, 'Aluno')));

  router.post('/alunos', ({ body }) => {
    const d = validar(db, exigirCorpo(body), null);
    const { lastInsertRowid } = db.run(
      `INSERT INTO alunos (nome, data_nascimento, documento, email, telefone, endereco, pais_origem, moeda_origem, ativo)
       VALUES (:nome, :data_nascimento, :documento, :email, :telefone, :endereco, :pais_origem, :moeda_origem, :ativo)`, d);
    return buscarAluno(db, lastInsertRowid);
  }, { status: 201 });

  router.put('/alunos/:id', ({ params, body }) => {
    const id = parseId(params.id, 'Aluno');
    const atual = buscarAluno(db, id);
    const d = validar(db, { ...atual, ...exigirCorpo(body) }, id);
    db.run(
      `UPDATE alunos SET nome = :nome, data_nascimento = :data_nascimento, documento = :documento, email = :email,
         telefone = :telefone, endereco = :endereco, pais_origem = :pais_origem, moeda_origem = :moeda_origem, ativo = :ativo
       WHERE id = :id`, { ...d, id });
    return buscarAluno(db, id);
  });

  router.delete('/alunos/:id', ({ params }) => {
    const id = parseId(params.id, 'Aluno');
    const aluno = buscarAluno(db, id);
    const c = db.get<{ matriculas: number; mensalidades: number; respostas: number }>(
      `SELECT (SELECT count(*) FROM matriculas WHERE aluno_id = :id) AS matriculas,
              (SELECT count(*) FROM mensalidades WHERE aluno_id = :id) AS mensalidades,
              (SELECT count(*) FROM avaliacao_respostas WHERE aluno_id = :id) AS respostas`, { id })!;
    const deps: string[] = [];
    if (c.matriculas) deps.push(`${c.matriculas} matrícula(s)`);
    if (c.mensalidades) deps.push(`${c.mensalidades} mensalidade(s)`);
    if (c.respostas) deps.push(`${c.respostas} resposta(s) de avaliação`);
    if (deps.length) {
      throw new HttpError(422,
        `Não é possível excluir o aluno "${aluno.nome}" porque ele possui ${deps.join(', ')}. Para preservar o histórico, inative o cadastro (ativo = falso).`,
        deps);
    }
    db.run('DELETE FROM alunos WHERE id = ?', [id]);
    return { ok: true };
  });
}
