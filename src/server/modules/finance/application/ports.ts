import type { Movimento, Obrigacao } from '../domain/saldo.ts';
export interface MensalidadeCentral extends Obrigacao {
  aluno_id: number;
  matricula_id: number;
  competencia: string;
  aluno_nome: string;
  idioma_nome: string;
  turma_nome: string;
  email: string | null;
  telefone: string | null;
  valor: number;
  data_pagamento: string | null;
  forma_pagamento: string | null;
  valor_pago: number | null;
}
export interface Lancamento extends Movimento {
  operacao_id: string;
  mensalidade_id: number;
  usuario_id: number | null;
  forma: string | null;
  motivo: string | null;
}
export interface Politica {
  id: number;
  dia_vencimento: number;
  prazo_inicial: number;
  multa_bp: number;
  juros_bp: number;
}
export interface PortaFinanceira {
  referencias(): { id: number; aluno_id: number; aluno_nome: string; turma_nome: string; ano_letivo: number }[];
  nova(matricula: number, aluno: number, competencia: string, valor: number, vencimento: string): number;
  vencimento(id: number, data: string): void;
  transacao<T>(fn: () => T): T;
  listar(): MensalidadeCentral[];
  movimentos(id: number): Lancamento[];
  porOperacao(id: string): Lancamento | undefined;
  gravar(m: Lancamento): void;
  sincronizar(id: number, saldo: number, pago: number, data: string, forma: string | null): void;
  cancelar(id: number): void;
  auditar(usuario: number, acao: string, recurso: string, motivo?: string): void;
  politica(): Politica;
  configurar(p: Omit<Politica, 'id'>): void;
}
