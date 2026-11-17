// Avaliações configuráveis por turma: CRUD com trava após a 1ª resposta, duplicar, modelos, respostas,
// resultados e exportação CSV. As regras puras ficam em services/avaliacao.ts.
import type { Db } from '../db.ts';
import type { Router } from '../router.ts';
import { HttpError, ValidationError } from '../router.ts';
import { Validador, encontrado, exigirCorpo, parseId, queryInt } from '../validation.ts';
import {
  MSG_TRAVADA,
  calcularResultados,
  gerarCsv,
  montarAnswers,
  nomeArquivoCsv,
  validarForm,
  validarRespostas,
} from '../services/avaliacao.ts';
import type { ItemResposta, RespostaComItens } from '../services/avaliacao.ts';
import { MODELOS_AVALIACAO } from '../data/modelos-avaliacao.ts';
import type { Avaliacao, EvaluationForm, ExportacaoCsv, RespostaAvaliacao, ResultadosAvaliacao } from '../../shared/types.ts';

const SELECT_AVALIACAO = `
  SELECT av.id, av.turma_id, t.nome AS turma_nome, av.titulo, av.descricao, av.form, av.criado_em,
         (SELECT count(*) FROM avaliacao_respostas r WHERE r.avaliacao_id = av.id) AS total_respostas
  FROM avaliacoes av JOIN turmas t ON t.id = av.turma_id`;

type Linha = Omit<Avaliacao, 'form' | 'travada'> & { form: string };

function converter(l: Linha): Avaliacao {
  return { ...l, form: JSON.parse(l.form) as EvaluationForm, travada: l.total_respostas > 0 };
}

export function buscarAvaliacao(db: Db, id: number): Avaliacao {
  return converter(encontrado(db.get<Linha>(`${SELECT_AVALIACAO} WHERE av.id = ?`, [id]), 'Avaliação não encontrada'));
}

export function listarAvaliacoes(db: Db, turmaId?: number): Avaliacao[] {
  return db
    .all<Linha>(
      `${SELECT_AVALIACAO} ${turmaId !== undefined ? 'WHERE av.turma_id = :turma_id' : ''} ORDER BY av.criado_em DESC, av.id DESC`,
      turmaId !== undefined ? { turma_id: turmaId } : undefined,
    )
    .map(converter);
}

/** Valida turma, título, descrição e form (ou `modelo_id`, que usa o formulário de um modelo pronto). */
function validarDados(db: Db, dados: Record<string, unknown>) {
  const v = new Validador(dados);
  const turma_id = v.inteiro('turma_id', { obrigatorio: true, min: 1, rotulo: 'turma' });
  const titulo = v.texto('titulo', { obrigatorio: true, max: 150, rotulo: 'título' });
  const descricao = v.texto('descricao', { max: 1000, rotulo: 'descrição' }) || null;
  if (turma_id && !db.get('SELECT 1 FROM turmas WHERE id = ?', [turma_id])) v.erro(`Turma ${turma_id} não existe`);
  let entrada = dados.form;
  if ((entrada === undefined || entrada === null) && dados.modelo_id !== undefined) {
    const modelo = MODELOS_AVALIACAO.find((m) => m.id === dados.modelo_id);
    if (!modelo) v.erro(`Modelo "${String(dados.modelo_id)}" não existe`);
    else entrada = structuredClone(modelo.form);
  }
  let form: EvaluationForm = { questions: [] };
  if (entrada === undefined || entrada === null) v.erro('form é obrigatório (ou informe modelo_id)');
  else {
    const r = validarForm(entrada);
    for (const d of r.detalhes) v.erro(d);
    form = r.form;
  }
  v.verificar('Avaliação inválida');
  return { turma_id: turma_id!, titulo: titulo!, descricao, form };
}

/** Cria a avaliação (exportada para a seed). */
export function criarAvaliacao(db: Db, dados: Record<string, unknown>): Avaliacao {
  const d = validarDados(db, dados);
  const { lastInsertRowid } = db.run('INSERT INTO avaliacoes (turma_id, titulo, descricao, form) VALUES (?, ?, ?, ?)', [
    d.turma_id,
    d.titulo,
    d.descricao,
    JSON.stringify(d.form),
  ]);
  return buscarAvaliacao(db, lastInsertRowid);
}

function atualizarAvaliacao(db: Db, id: number, corpo: Record<string, unknown>): Avaliacao {
  const atual = buscarAvaliacao(db, id);
  if (atual.travada) {
    // Com respostas, só título e descrição podem mudar.
    if (corpo.form !== undefined && corpo.form !== null) {
      const novo = validarForm(corpo.form);
      if (novo.detalhes.length || JSON.stringify(novo.form) !== JSON.stringify(atual.form)) throw new HttpError(422, MSG_TRAVADA);
    }
    if (corpo.turma_id !== undefined && Number(corpo.turma_id) !== atual.turma_id) throw new HttpError(422, MSG_TRAVADA);
    if (corpo.modelo_id !== undefined) throw new HttpError(422, MSG_TRAVADA);
  }
  const { turma_nome: _t, total_respostas: _r, travada: _tr, criado_em: _c, id: _i, ...base } = atual;
  const merged: Record<string, unknown> = { ...base, ...corpo };
  if (corpo.modelo_id !== undefined && (corpo.form === undefined || corpo.form === null)) delete merged.form;
  const d = validarDados(db, merged);
  db.run('UPDATE avaliacoes SET turma_id = ?, titulo = ?, descricao = ?, form = ? WHERE id = ?', [
    d.turma_id,
    d.titulo,
    d.descricao,
    JSON.stringify(d.form),
    id,
  ]);
  return buscarAvaliacao(db, id);
}

function duplicarAvaliacao(db: Db, id: number, corpo: Record<string, unknown>): Avaliacao {
  const a = buscarAvaliacao(db, id);
  const titulo = typeof corpo.titulo === 'string' && corpo.titulo.trim() ? corpo.titulo : `Cópia de ${a.titulo}`.slice(0, 150);
  return criarAvaliacao(db, { turma_id: corpo.turma_id ?? a.turma_id, titulo, descricao: a.descricao, form: a.form });
}

// ---------------------------------------------------------------- respostas

interface LinhaResposta {
  id: number;
  avaliacao_id: number;
  aluno_id: number;
  aluno_nome: string;
  score: number | null;
  criado_em: string;
}

function carregarRespostas(db: Db, avaliacaoId: number): (LinhaResposta & { itens: ItemResposta[] })[] {
  const linhas = db.all<LinhaResposta>(
    `SELECT r.id, r.avaliacao_id, r.aluno_id, a.nome AS aluno_nome, r.score, r.criado_em
     FROM avaliacao_respostas r JOIN alunos a ON a.id = r.aluno_id
     WHERE r.avaliacao_id = ? ORDER BY a.nome COLLATE NOCASE, r.id`,
    [avaliacaoId],
  );
  const itens = db.all<ItemResposta & { resposta_id: number }>(
    `SELECT i.resposta_id, i.question_id, i.row_id, i.option_id, i.value_text, i.value_number, i.reason
     FROM avaliacao_resposta_itens i JOIN avaliacao_respostas r ON r.id = i.resposta_id
     WHERE r.avaliacao_id = ? ORDER BY i.id`,
    [avaliacaoId],
  );
  const porResposta = new Map<number, ItemResposta[]>();
  for (const { resposta_id, ...i } of itens) {
    const l = porResposta.get(resposta_id) ?? [];
    l.push(i);
    porResposta.set(resposta_id, l);
  }
  return linhas.map((l) => ({ ...l, itens: porResposta.get(l.id) ?? [] }));
}

export function listarRespostas(db: Db, avaliacaoId: number): RespostaAvaliacao[] {
  const a = buscarAvaliacao(db, avaliacaoId);
  return carregarRespostas(db, avaliacaoId).map(({ itens, ...r }) => ({ ...r, answers: montarAnswers(a.form, itens) }));
}

/** Registra a resposta de um aluno (matrícula ativa na turma, uma vez só). Exportada para a seed. */
export function responderAvaliacao(db: Db, avaliacaoId: number, dados: Record<string, unknown>): RespostaAvaliacao {
  const a = buscarAvaliacao(db, avaliacaoId);
  const v = new Validador(dados);
  const alunoId = v.inteiro('aluno_id', { obrigatorio: true, min: 1, rotulo: 'aluno' });
  v.verificar('Resposta inválida');
  const aluno = db.get<{ nome: string }>('SELECT nome FROM alunos WHERE id = ?', [alunoId]);
  if (!aluno) throw new ValidationError([`Aluno ${alunoId} não existe`], 'Resposta inválida');
  if (!db.get("SELECT 1 FROM matriculas WHERE aluno_id = ? AND turma_id = ? AND status = 'ativa'", [alunoId, a.turma_id])) {
    throw new ValidationError([`${aluno.nome} não tem matrícula ativa na turma ${a.turma_nome}`], 'Resposta inválida');
  }
  if (db.get('SELECT 1 FROM avaliacao_respostas WHERE avaliacao_id = ? AND aluno_id = ?', [avaliacaoId, alunoId])) {
    throw new HttpError(422, `${aluno.nome} já respondeu esta avaliação`);
  }
  const r = validarRespostas(a.form, dados.answers);
  if (r.detalhes.length) throw new ValidationError(r.detalhes, 'Respostas inválidas');
  const id = db.transaction(() => {
    const novo = db.run('INSERT INTO avaliacao_respostas (avaliacao_id, aluno_id, score) VALUES (?, ?, ?)', [
      avaliacaoId,
      alunoId,
      r.score,
    ]).lastInsertRowid;
    for (const i of r.itens) {
      db.run(
        `INSERT INTO avaliacao_resposta_itens (resposta_id, question_id, row_id, option_id, value_text, value_number, reason)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [novo, i.question_id, i.row_id, i.option_id, i.value_text, i.value_number, i.reason],
      );
    }
    return novo;
  });
  return listarRespostas(db, avaliacaoId).find((x) => x.id === id)!;
}

export function resultadosAvaliacao(db: Db, avaliacaoId: number): ResultadosAvaliacao {
  const a = buscarAvaliacao(db, avaliacaoId);
  return calcularResultados(a.id, a.form, carregarRespostas(db, avaliacaoId) as RespostaComItens[]);
}

export function exportarAvaliacao(db: Db, avaliacaoId: number): ExportacaoCsv {
  const a = buscarAvaliacao(db, avaliacaoId);
  return { nome_arquivo: nomeArquivoCsv(a.id, a.titulo), csv: gerarCsv(a.form, carregarRespostas(db, avaliacaoId)) };
}

export function register(router: Router, db: Db): void {
  router.get('/avaliacoes', ({ query }) => listarAvaliacoes(db, queryInt(query, 'turma_id', { min: 1 })));
  router.get('/avaliacoes/modelos', () => MODELOS_AVALIACAO);
  router.get('/avaliacoes/:id', ({ params }) => buscarAvaliacao(db, parseId(params.id, 'Avaliação')));
  router.post('/avaliacoes', ({ body }) => criarAvaliacao(db, exigirCorpo(body)), { status: 201 });
  router.put('/avaliacoes/:id', ({ params, body }) => atualizarAvaliacao(db, parseId(params.id, 'Avaliação'), exigirCorpo(body)));
  router.delete('/avaliacoes/:id', ({ params }) => {
    const a = buscarAvaliacao(db, parseId(params.id, 'Avaliação'));
    if (a.travada) {
      throw new HttpError(422, `Não é possível excluir a avaliação "${a.titulo}" porque ela possui ${a.total_respostas} resposta(s).`);
    }
    db.run('DELETE FROM avaliacoes WHERE id = ?', [a.id]);
    return { ok: true };
  });
  router.post(
    '/avaliacoes/:id/duplicar',
    ({ params, body }) =>
      duplicarAvaliacao(db, parseId(params.id, 'Avaliação'), body === undefined || body === null ? {} : exigirCorpo(body)),
    { status: 201 },
  );
  router.post(
    '/avaliacoes/:id/respostas',
    ({ params, body }) => responderAvaliacao(db, parseId(params.id, 'Avaliação'), exigirCorpo(body)),
    { status: 201 },
  );
  router.get('/avaliacoes/:id/respostas', ({ params }) => listarRespostas(db, parseId(params.id, 'Avaliação')));
  router.get('/avaliacoes/:id/resultados', ({ params }) => resultadosAvaliacao(db, parseId(params.id, 'Avaliação')));
  router.get('/avaliacoes/:id/exportar', ({ params }) => exportarAvaliacao(db, parseId(params.id, 'Avaliação')));
}
