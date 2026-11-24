import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { HttpError } from '../../../../main/router.ts';
import { hojeIso, dataIsoValida } from '../../../../main/validation.ts';
import type { UsuarioSessao } from '../../../../shared/contracts/identidade.ts';
import type { PortaFinanceira, Lancamento } from './ports.ts';
import { CalculadoraSaldo } from '../domain/saldo.ts';
const dataSchema = z.string().refine(dataIsoValida, 'Data inválida');
const idOperacao = z.string().uuid();
export class ServicoFinanceiro {
  private readonly repo: PortaFinanceira;
  private readonly hoje: () => string;
  private readonly calculadora = new CalculadoraSaldo();
  constructor(repo: PortaFinanceira, hoje: () => string = hojeIso) {
    this.repo = repo;
    this.hoje = hoje;
  }
  private exigirFinanceiro(u: UsuarioSessao) {
    if (!['admin', 'financeiro'].includes(u.papel)) throw new HttpError(403, 'Acesso financeiro não permitido');
  }
  listar(u: UsuarioSessao, query: URLSearchParams = new URLSearchParams()) {
    if (!['admin', 'financeiro', 'aluno'].includes(u.papel)) throw new HttpError(403, 'Acesso financeiro não permitido');
    return this.repo
      .listar()
      .filter((m) => u.papel !== 'aluno' || m.aluno_id === u.aluno_id)
      .map((m) => {
        const s = this.calculadora.calcular(m, this.repo.movimentos(m.id), this.hoje());
        const status = m.status === 'cancelada' ? 'cancelada' : s.saldo_centavos === 0 ? 'paga' : 'pendente';
        return {
          ...m,
          ...s,
          status,
          atrasada: status === 'pendente' && m.vencimento < this.hoje(),
          dias_atraso: Math.max(0, Math.round((Date.parse(this.hoje()) - Date.parse(m.vencimento)) / 86400000)),
          multa: s.multa_centavos / 100,
          juros: s.juros_centavos / 100,
          valor_atualizado: s.saldo_centavos / 100,
        };
      })
      .filter(
        (m) =>
          (!query.get('aluno_id') || u.papel === 'aluno' || m.aluno_id === Number(query.get('aluno_id'))) &&
          (!query.get('competencia') || m.competencia === query.get('competencia')) &&
          (!query.get('ano') || m.competencia.startsWith(query.get('ano')! + '-')) &&
          (!query.get('status') || (query.get('status') === 'atrasada' ? m.atrasada : m.status === query.get('status'))),
      );
  }
  extrato(u: UsuarioSessao, id: number) {
    const mensalidade = this.listar(u).find((m) => m.id === id);
    if (!mensalidade) throw new HttpError(404, 'Mensalidade não encontrada');
    return {
      mensalidade,
      movimentos: this.repo.movimentos(id).map((m) => ({
        id: m.id,
        tipo: m.tipo,
        valor_centavos: m.valor_centavos,
        data: m.data,
        forma: m.forma,
        motivo: m.motivo,
        estorno_de: m.estorno_de,
      })),
    };
  }
  referencias(u: UsuarioSessao) {
    this.exigirFinanceiro(u);
    return this.repo.referencias();
  }
  criar(u: UsuarioSessao, body: unknown) {
    this.exigirFinanceiro(u);
    const v = z
      .object({
        matricula_id: z.number().int().positive(),
        competencia: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
        valor: z.number().positive().max(1000000),
        vencimento: dataSchema,
        motivo: z.string().trim().min(5).max(500),
      })
      .strict()
      .parse(body);
    return this.repo.transacao(() => {
      const m = this.repo.referencias().find((m) => m.id === v.matricula_id);
      if (!m || Number(v.competencia.slice(0, 4)) !== m.ano_letivo) throw new HttpError(422, 'Matrícula ou competência incompatível');
      const id = this.repo.nova(m.id, m.aluno_id, v.competencia, Math.round(v.valor * 100), v.vencimento);
      this.repo.auditar(u.id, 'CRIAR_COBRANCA', String(id), v.motivo);
      return this.extrato(u, id).mensalidade;
    });
  }
  corrigir(u: UsuarioSessao, id: number, body: unknown) {
    this.exigirFinanceiro(u);
    const v = z
      .object({ vencimento: dataSchema, motivo: z.string().trim().min(5).max(500) })
      .strict()
      .parse(body);
    return this.repo.transacao(() => {
      const { mensalidade: m, movimentos } = this.extrato(u, id);
      const estornados = new Set(movimentos.filter((x) => x.tipo === 'estorno').map((x) => x.estorno_de));
      if (m.status === 'cancelada' || movimentos.some((x) => x.tipo === 'pagamento' && !estornados.has(x.id)))
        throw new HttpError(422, 'Estorne os pagamentos antes de corrigir vencimento');
      this.repo.vencimento(id, v.vencimento);
      this.repo.auditar(u.id, 'CORRIGIR_VENCIMENTO', String(id), `${v.motivo}; anterior: ${m.vencimento}`);
      return this.extrato(u, id).mensalidade;
    });
  }
  cancelar(u: UsuarioSessao, id: number, body: unknown) {
    this.exigirFinanceiro(u);
    const v = z
      .object({ motivo: z.string().trim().min(5).max(500) })
      .strict()
      .parse(body);
    return this.repo.transacao(() => {
      const { mensalidade: m, movimentos } = this.extrato(u, id);
      const estornados = new Set(movimentos.filter((x) => x.tipo === 'estorno').map((x) => x.estorno_de));
      if (movimentos.some((x) => x.tipo === 'pagamento' && !estornados.has(x.id)))
        throw new HttpError(422, 'Estorne os pagamentos antes de cancelar a cobrança');
      if (m.status === 'cancelada') return m;
      this.repo.cancelar(id);
      this.repo.gravar({
        id: randomUUID(),
        operacao_id: randomUUID(),
        mensalidade_id: id,
        usuario_id: u.id,
        tipo: 'cancelamento',
        valor_centavos: 0,
        data: this.hoje(),
        forma: null,
        motivo: v.motivo,
        estorno_de: null,
      });
      this.repo.auditar(u.id, 'CANCELAR_COBRANCA', String(id), v.motivo);
      return this.extrato(u, id).mensalidade;
    });
  }
  simular(u: UsuarioSessao, id: number, data: string) {
    dataSchema.parse(data);
    const { mensalidade: m } = this.extrato(u, id);
    return this.calculadora.calcular(m, this.repo.movimentos(id), data);
  }
  pagar(u: UsuarioSessao, id: number, body: unknown) {
    this.exigirFinanceiro(u);
    const v = z
      .object({
        valor_pago: z.number().finite().positive().max(1_000_000),
        data_pagamento: dataSchema,
        forma_pagamento: z.enum(['pix', 'cartao', 'boleto', 'dinheiro', 'transferencia']),
        operacao_id: idOperacao,
      })
      .strict()
      .parse(body);
    if (v.data_pagamento > this.hoje()) throw new HttpError(422, 'Data do pagamento não pode ser futura');
    const centavos = Math.round(v.valor_pago * 100);
    if (centavos < 1) throw new HttpError(422, 'Informe ao menos um centavo');
    return this.repo.transacao(() => {
      const anterior = this.repo.porOperacao(v.operacao_id);
      if (anterior) {
        if (
          anterior.usuario_id !== u.id ||
          anterior.mensalidade_id !== id ||
          anterior.valor_centavos !== centavos ||
          anterior.data !== v.data_pagamento ||
          anterior.forma !== v.forma_pagamento ||
          anterior.tipo !== 'pagamento'
        )
          throw new HttpError(409, 'Identificador já usado em outra operação');
        return this.extrato(u, id).mensalidade;
      }
      const m = this.repo.listar().find((m) => m.id === id);
      if (!m) throw new HttpError(404, 'Mensalidade não encontrada');
      if (m.status === 'cancelada') throw new HttpError(422, 'Mensalidade cancelada');
      const movimentos = this.repo.movimentos(id);
      if (movimentos.some((x) => x.data > v.data_pagamento)) throw new HttpError(422, 'Use data igual ou posterior ao último lançamento');
      const saldo = this.calculadora.calcular(m, movimentos, v.data_pagamento);
      if (centavos > saldo.saldo_centavos)
        throw new HttpError(422, 'Pagamento excede o saldo atualizado; crédito excedente não está habilitado');
      const novo: Lancamento = {
        id: randomUUID(),
        operacao_id: v.operacao_id,
        mensalidade_id: id,
        usuario_id: u.id,
        tipo: 'pagamento',
        valor_centavos: centavos,
        data: v.data_pagamento,
        forma: v.forma_pagamento,
        motivo: null,
        estorno_de: null,
      };
      this.repo.gravar(novo);
      const final = this.calculadora.calcular(m, [...movimentos, novo], v.data_pagamento);
      this.repo.sincronizar(id, final.saldo_centavos, final.pago_centavos, v.data_pagamento, v.forma_pagamento);
      this.repo.auditar(u.id, 'PAGAMENTO', String(id));
      return this.extrato(u, id).mensalidade;
    });
  }
  estornar(u: UsuarioSessao, id: number, body: unknown) {
    this.exigirFinanceiro(u);
    const v = z
      .object({ pagamento_id: z.string().optional(), motivo: z.string().trim().min(5).max(500), operacao_id: idOperacao })
      .strict()
      .parse(body);
    return this.repo.transacao(() => {
      const anterior = this.repo.porOperacao(v.operacao_id);
      if (anterior) {
        if (
          anterior.tipo !== 'estorno' ||
          anterior.usuario_id !== u.id ||
          anterior.mensalidade_id !== id ||
          anterior.motivo !== v.motivo ||
          (v.pagamento_id && anterior.estorno_de !== v.pagamento_id)
        )
          throw new HttpError(409, 'Identificador já utilizado');
        return this.extrato(u, id).mensalidade;
      }
      const { mensalidade: m } = this.extrato(u, id);
      const movimentos = this.repo.movimentos(id),
        estornados = new Set(movimentos.filter((x) => x.tipo === 'estorno').map((x) => x.estorno_de));
      const pagamentos = movimentos.filter((x) => x.tipo === 'pagamento' && !estornados.has(x.id));
      const pagamento = v.pagamento_id
        ? pagamentos.find((x) => x.id === v.pagamento_id)
        : pagamentos.length === 1
          ? pagamentos[0]
          : undefined;
      if (!pagamento) throw new HttpError(422, 'Escolha um pagamento válido ainda não estornado');
      const novo: Lancamento = {
        id: randomUUID(),
        operacao_id: v.operacao_id,
        mensalidade_id: id,
        usuario_id: u.id,
        tipo: 'estorno',
        valor_centavos: pagamento.valor_centavos,
        data: this.hoje(),
        forma: pagamento.forma,
        motivo: v.motivo,
        estorno_de: pagamento.id,
      };
      this.repo.gravar(novo);
      const saldo = this.calculadora.calcular(m, [...movimentos, novo], this.hoje());
      this.repo.sincronizar(id, saldo.saldo_centavos, saldo.pago_centavos, this.hoje(), null);
      this.repo.auditar(u.id, 'ESTORNO', String(id), v.motivo);
      return this.extrato(u, id).mensalidade;
    });
  }
  ajustar(u: UsuarioSessao, id: number, body: unknown) {
    this.exigirFinanceiro(u);
    const v = z
      .object({
        tipo: z.enum(['desconto', 'ajuste']),
        valor: z.number().finite().positive().max(1_000_000),
        motivo: z.string().trim().min(5).max(500),
        operacao_id: idOperacao,
      })
      .strict()
      .parse(body);
    return this.repo.transacao(() => {
      const anterior = this.repo.porOperacao(v.operacao_id);
      if (anterior) {
        if (
          anterior.tipo !== v.tipo ||
          anterior.mensalidade_id !== id ||
          anterior.usuario_id !== u.id ||
          anterior.valor_centavos !== Math.round(v.valor * 100) ||
          anterior.motivo !== v.motivo
        )
          throw new HttpError(409, 'Operação divergente');
        return this.extrato(u, id).mensalidade;
      }
      const { mensalidade: m } = this.extrato(u, id);
      if (m.status === 'cancelada') throw new HttpError(422, 'Mensalidade cancelada');
      const centavos = Math.round(v.valor * 100);
      if (centavos < 1) throw new HttpError(422, 'Valor inválido');
      if (v.tipo === 'desconto' && centavos > m.principal_centavos) throw new HttpError(422, 'Desconto excede o principal em aberto');
      this.repo.gravar({
        id: randomUUID(),
        operacao_id: v.operacao_id,
        mensalidade_id: id,
        usuario_id: u.id,
        tipo: v.tipo,
        valor_centavos: centavos,
        data: this.hoje(),
        forma: null,
        motivo: v.motivo,
        estorno_de: null,
      });
      const saldo = this.calculadora.calcular(m, this.repo.movimentos(id), this.hoje());
      this.repo.sincronizar(id, saldo.saldo_centavos, saldo.pago_centavos, this.hoje(), null);
      this.repo.auditar(u.id, v.tipo.toUpperCase(), String(id), v.motivo);
      return this.extrato(u, id).mensalidade;
    });
  }
  configuracao(u: UsuarioSessao) {
    this.exigirFinanceiro(u);
    return this.repo.politica();
  }
  configurar(u: UsuarioSessao, body: unknown) {
    this.exigirFinanceiro(u);
    const v = z
      .object({
        dia_vencimento: z.number().int().min(1).max(28),
        prazo_inicial: z.number().int().min(1).max(30),
        multa_bp: z.number().int().min(0).max(10000),
        juros_bp: z.number().int().min(0).max(10000),
      })
      .strict()
      .parse(body);
    this.repo.transacao(() => {
      this.repo.configurar(v);
      this.repo.auditar(u.id, 'CONFIGURAR_FINANCEIRO', 'politica');
    });
    return this.repo.politica();
  }
  resumo(u: UsuarioSessao, ano: number, caixa = false) {
    this.exigirFinanceiro(u);
    if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) throw new HttpError(422, 'Ano inválido');
    const ms = this.listar(u);
    const por_mes = Array.from({ length: 12 }, (_, i) => ({
      competencia: `${ano}-${String(i + 1).padStart(2, '0')}`,
      previsto: 0,
      recebido: 0,
    }));
    let recebido = 0,
      a_receber = 0,
      em_atraso = 0;
    for (const m of ms) {
      const movimentos = this.repo.movimentos(m.id);
      const estornados = new Set(movimentos.filter((x) => x.tipo === 'estorno').map((x) => x.estorno_de));
      if (m.competencia.startsWith(ano + '-') && m.status !== 'cancelada') {
        por_mes[Number(m.competencia.slice(5)) - 1].previsto += m.valor_centavos / 100;
        if (m.atrasada) em_atraso += m.saldo_centavos / 100;
        else a_receber += m.saldo_centavos / 100;
      }
      for (const x of movimentos.filter((x) => x.tipo === 'pagamento' && !estornados.has(x.id))) {
        const referencia = caixa ? x.data.slice(0, 7) : m.competencia;
        if (referencia.startsWith(ano + '-')) {
          recebido += x.valor_centavos / 100;
          por_mes[Number(referencia.slice(5)) - 1].recebido += x.valor_centavos / 100;
        }
      }
    }
    return {
      ano,
      regime: caixa ? 'caixa' : 'competencia',
      recebido: Math.round(recebido * 100) / 100,
      a_receber: Math.round(a_receber * 100) / 100,
      em_atraso: Math.round(em_atraso * 100) / 100,
      por_mes,
      alunos_inadimplentes: this.inadimplentes(u).filter((x) =>
        ms.some((m) => m.aluno_id === x.aluno_id && m.atrasada && m.competencia.startsWith(ano + '-')),
      ),
    };
  }
  inadimplentes(u: UsuarioSessao) {
    this.exigirFinanceiro(u);
    const porAluno = new Map<
      number,
      {
        aluno_id: number;
        aluno_nome: string;
        email: string | null;
        telefone: string | null;
        qtd: number;
        total: number;
        total_atualizado: number;
        vencimento_mais_antigo: string;
        dias_max_atraso: number;
        acima_90_dias: boolean;
      }
    >();
    for (const m of this.listar(u).filter((m) => m.atrasada)) {
      const x = porAluno.get(m.aluno_id) ?? {
        aluno_id: m.aluno_id,
        aluno_nome: m.aluno_nome,
        email: m.email,
        telefone: m.telefone,
        qtd: 0,
        total: 0,
        total_atualizado: 0,
        vencimento_mais_antigo: m.vencimento,
        dias_max_atraso: 0,
        acima_90_dias: false,
      };
      x.qtd++;
      x.total += m.principal_centavos / 100;
      x.total_atualizado += m.saldo_centavos / 100;
      x.dias_max_atraso = Math.max(x.dias_max_atraso, m.dias_atraso);
      x.acima_90_dias = x.dias_max_atraso > 90;
      porAluno.set(m.aluno_id, x);
    }
    return [...porAluno.values()];
  }
}
