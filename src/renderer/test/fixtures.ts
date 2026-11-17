import type { Avaliacao, Mensalidade } from '../../shared/types.ts';

export const mensalidade = (extra: Partial<Mensalidade> = {}): Mensalidade => ({
  id: 1,
  matricula_id: 1,
  aluno_id: 7,
  aluno_nome: 'Maria Souza',
  idioma_nome: 'Inglês',
  turma_nome: 'Inglês A1',
  competencia: '2026-03',
  valor: 300,
  vencimento: '2026-03-10',
  status: 'pendente',
  atrasada: false,
  dias_atraso: 0,
  multa: 0,
  juros: 0,
  valor_atualizado: 300,
  data_pagamento: null,
  valor_pago: null,
  forma_pagamento: null,
  ...extra,
});

export const avaliacao = (extra: Partial<Avaliacao> = {}): Avaliacao => ({
  id: 1,
  turma_id: 1,
  turma_nome: 'Inglês A1',
  titulo: 'Feedback do trimestre',
  descricao: null,
  form: { questions: [{ id: 'q1', type: 'open', title: 'Como foi?', required: true }] },
  criado_em: '2026-03-01 10:00:00',
  total_respostas: 0,
  travada: false,
  ...extra,
});
