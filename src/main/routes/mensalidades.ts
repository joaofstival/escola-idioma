// Financeiro: mensalidades (listar, pagar, estornar), resumo anual e inadimplentes.
// Atraso, multa, juros e valor atualizado são calculados na leitura (services/financeiro.ts) e nunca gravados.
import type { Db } from '../db.ts';
import type { Router } from '../router.ts';
import { HttpError, ValidationError } from '../router.ts';
import { Validador, encontrado, exigirCorpo, parseId, queryInt } from '../validation.ts';
import { COMPETENCIA_RE, DIAS_COBRANCA, arredondar, calcularEncargos, competenciasDoAno, hoje } from '../services/financeiro.ts';
import type { Inadimplente, Mensalidade, ResumoFinanceiro } from '../../shared/types.ts';

export const FILTROS_STATUS = ['pendente', 'paga', 'atrasada', 'cancelada'] as const;
export type FiltroStatus = (typeof FILTROS_STATUS)[number];

type LinhaMensalidade = Omit<Mensalidade, 'atrasada' | 'dias_atraso' | 'multa' | 'juros' | 'valor_atualizado'>;

const SELECT_MENSALIDADE = `
  SELECT ms.id, ms.matricula_id, ms.aluno_id, a.nome AS aluno_nome, i.nome AS idioma_nome, t.nome AS turma_nome,
         ms.competencia, ms.valor, ms.vencimento, ms.status, ms.data_pagamento, ms.valor_pago, ms.forma_pagamento
  FROM mensalidades ms
  JOIN alunos a ON a.id = ms.aluno_id
  JOIN matriculas m ON m.id = ms.matricula_id
  JOIN turmas t ON t.id = m.turma_id
  JOIN idiomas i ON i.id = t.idioma_id`;

/** Acrescenta os campos calculados (atrasada, dias_atraso, multa, juros, valor_atualizado). */
export function comEncargos(linha: LinhaMensalidade, hojeRef: string): Mensalidade {
  return { ...linha, ...calcularEncargos(linha, hojeRef) };
}

export interface FiltrosMensalidade {
  status?: FiltroStatus; aluno_id?: number; matricula_id?: number; competencia?: string; ano?: number;
}

export function listarMensalidades(db: Db, f: FiltrosMensalidade, hojeRef: string): Mensalidade[] {
  const where: string[] = [];
  const p: Record<string, string | number> = {};
  if (f.status === 'atrasada') {
    where.push("ms.status = 'pendente' AND ms.vencimento < :hoje");
    p.hoje = hojeRef;
  } else if (f.status) {
    where.push('ms.status = :status');
    p.status = f.status;
  }
  if (f.aluno_id !== undefined) { where.push('ms.aluno_id = :aluno_id'); p.aluno_id = f.aluno_id; }
  if (f.matricula_id !== undefined) { where.push('ms.matricula_id = :matricula_id'); p.matricula_id = f.matricula_id; }
  if (f.competencia) { where.push('ms.competencia = :competencia'); p.competencia = f.competencia; }
  if (f.ano !== undefined) { where.push("substr(ms.competencia, 1, 4) = :ano"); p.ano = String(f.ano); }
  return db.all<LinhaMensalidade>(
    `${SELECT_MENSALIDADE} ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY ms.vencimento, a.nome COLLATE NOCASE, ms.id`, p,
  ).map((l) => comEncargos(l, hojeRef));
}

export function buscarMensalidade(db: Db, id: number, hojeRef: string = hoje()): Mensalidade {
  const l = encontrado(db.get<LinhaMensalidade>(`${SELECT_MENSALIDADE} WHERE ms.id = ?`, [id]), 'Mensalidade não encontrada');
  return comEncargos(l, hojeRef);
}

export interface DadosPagamento { valor_pago?: unknown; forma_pagamento?: unknown; data_pagamento?: unknown }

/** Registra o pagamento. Sem valor_pago, usa o valor atualizado na data do pagamento. */
export function pagarMensalidade(db: Db, id: number, dados: DadosPagamento, hojeRef: string): Mensalidade {
  const atual = buscarMensalidade(db, id, hojeRef);
  if (atual.status === 'paga') throw new HttpError(422, 'Esta mensalidade já está paga', [`Paga em ${atual.data_pagamento}`]);
  if (atual.status === 'cancelada') throw new HttpError(422, 'Mensalidade cancelada não pode ser paga');
  const v = new Validador(dados as Record<string, unknown>);
  const forma = v.texto('forma_pagamento', { obrigatorio: true, max: 40, rotulo: 'forma de pagamento' });
  const data = v.data('data_pagamento', { rotulo: 'data do pagamento' }) ?? hojeRef;
  if (data > hojeRef) v.erro('data do pagamento não pode ser uma data futura');
  const valorInformado = v.numero('valor_pago', { min: 0.01, max: 1_000_000, rotulo: 'valor pago' });
  v.verificar();
  const valor_pago = valorInformado !== null ? arredondar(valorInformado) : calcularEncargos(atual, data).valor_atualizado;
  db.run(
    `UPDATE mensalidades SET status = 'paga', valor_pago = :valor_pago, data_pagamento = :data, forma_pagamento = :forma
     WHERE id = :id`, { valor_pago, data, forma, id });
  return buscarMensalidade(db, id, hojeRef);
}

export function estornarMensalidade(db: Db, id: number, hojeRef: string): Mensalidade {
  const atual = buscarMensalidade(db, id, hojeRef);
  if (atual.status !== 'paga') throw new HttpError(422, 'Só é possível estornar uma mensalidade paga');
  db.run(`UPDATE mensalidades SET status = 'pendente', valor_pago = NULL, data_pagamento = NULL, forma_pagamento = NULL WHERE id = ?`, [id]);
  return buscarMensalidade(db, id, hojeRef);
}

/** Alunos com ao menos uma mensalidade atrasada (opcionalmente só as competências de um ano). */
export function listarInadimplentes(db: Db, hojeRef: string, ano?: number): Inadimplente[] {
  const atrasadas = listarMensalidades(db, { status: 'atrasada', ano }, hojeRef);
  const porAluno = new Map<number, Inadimplente>();
  for (const m of atrasadas) {
    let i = porAluno.get(m.aluno_id);
    if (!i) {
      const contato = db.get<{ email: string | null; telefone: string | null }>('SELECT email, telefone FROM alunos WHERE id = ?', [m.aluno_id])!;
      i = {
        aluno_id: m.aluno_id, aluno_nome: m.aluno_nome ?? '', email: contato.email, telefone: contato.telefone,
        qtd: 0, total: 0, total_atualizado: 0, vencimento_mais_antigo: m.vencimento, dias_max_atraso: 0, acima_90_dias: false,
      };
      porAluno.set(m.aluno_id, i);
    }
    i.qtd++;
    i.total = arredondar(i.total + m.valor);
    i.total_atualizado = arredondar(i.total_atualizado + m.valor_atualizado);
    if (m.vencimento < i.vencimento_mais_antigo) i.vencimento_mais_antigo = m.vencimento;
    i.dias_max_atraso = Math.max(i.dias_max_atraso, m.dias_atraso);
    i.acima_90_dias = i.dias_max_atraso > DIAS_COBRANCA;
  }
  return [...porAluno.values()].sort((a, b) => b.total - a.total || a.aluno_nome.localeCompare(b.aluno_nome, 'pt-BR'));
}

export function resumoFinanceiro(db: Db, ano: number, hojeRef: string): ResumoFinanceiro {
  const ms = listarMensalidades(db, { ano }, hojeRef);
  let recebido = 0, a_receber = 0, em_atraso = 0;
  const porMes = new Map(competenciasDoAno(ano).map((c) => [c, { competencia: c, previsto: 0, recebido: 0 }]));
  for (const m of ms) {
    const mes = porMes.get(m.competencia)!;
    if (m.status === 'cancelada') continue;
    mes.previsto += m.valor;
    if (m.status === 'paga') {
      recebido += m.valor_pago ?? 0;
      mes.recebido += m.valor_pago ?? 0;
    } else if (m.atrasada) em_atraso += m.valor;
    else a_receber += m.valor;
  }
  return {
    ano,
    recebido: arredondar(recebido),
    a_receber: arredondar(a_receber),
    em_atraso: arredondar(em_atraso),
    alunos_inadimplentes: listarInadimplentes(db, hojeRef, ano).map(({ aluno_id, aluno_nome, qtd, total }) => ({ aluno_id, aluno_nome, qtd, total })),
    por_mes: [...porMes.values()].map((x) => ({ ...x, previsto: arredondar(x.previsto), recebido: arredondar(x.recebido) })),
  };
}

function lerFiltros(query: Record<string, string>): FiltrosMensalidade {
  const erros: string[] = [];
  const status = query.status?.trim() || undefined;
  if (status && !(FILTROS_STATUS as readonly string[]).includes(status)) erros.push(`Filtro status inválido: "${status}" (use ${FILTROS_STATUS.join(', ')})`);
  const competencia = query.competencia?.trim() || undefined;
  if (competencia && !COMPETENCIA_RE.test(competencia)) erros.push(`Filtro competencia inválido: "${competencia}" (use AAAA-MM)`);
  if (erros.length) throw new ValidationError(erros, 'Filtro inválido');
  return {
    status: status as FiltroStatus | undefined,
    competencia,
    aluno_id: queryInt(query, 'aluno_id', { min: 1 }),
    matricula_id: queryInt(query, 'matricula_id', { min: 1 }),
    ano: queryInt(query, 'ano', { min: 2000, max: 2100 }),
  };
}

export function register(router: Router, db: Db): void {
  router.get('/mensalidades', ({ query }) => listarMensalidades(db, lerFiltros(query), hoje()));

  router.get('/mensalidades/:id', ({ params }) => buscarMensalidade(db, parseId(params.id, 'Mensalidade')));

  router.post('/mensalidades/:id/pagar', ({ params, body }) =>
    pagarMensalidade(db, parseId(params.id, 'Mensalidade'), exigirCorpo(body ?? {}), hoje()));

  router.post('/mensalidades/:id/estornar', ({ params }) => estornarMensalidade(db, parseId(params.id, 'Mensalidade'), hoje()));

  router.get('/financeiro/resumo', ({ query }) => {
    const h = hoje();
    const ano = queryInt(query, 'ano', { min: 2000, max: 2100 }) ?? Number(h.slice(0, 4));
    return resumoFinanceiro(db, ano, h);
  });

  router.get('/financeiro/inadimplentes', () => listarInadimplentes(db, hoje()));
}

