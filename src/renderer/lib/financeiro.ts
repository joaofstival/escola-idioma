// Regras de exibição do financeiro. As contas oficiais (atraso, multa, juros) vêm do main em GET /mensalidades;
// aqui só se repete o cálculo para sugerir o valor quando o usuário muda a data do pagamento.
import type { Mensalidade } from '../../shared/types.ts';
import { competencia as fmtCompetencia, data as fmtData } from './format.ts';

export const MULTA = 0.02;
export const JUROS_MES = 0.01;

export const FORMAS_PAGAMENTO = [
  { valor: 'pix', rotulo: 'PIX' },
  { valor: 'cartao', rotulo: 'Cartão' },
  { valor: 'boleto', rotulo: 'Boleto' },
  { valor: 'dinheiro', rotulo: 'Dinheiro' },
  { valor: 'transferencia', rotulo: 'Transferência' },
] as const;

const ROTULO_FORMA: Record<string, string> = {
  pix: 'PIX', cartao: 'Cartão', cartao_credito: 'Cartão de crédito', cartao_debito: 'Cartão de débito',
  boleto: 'Boleto', dinheiro: 'Dinheiro', transferencia: 'Transferência',
};
export const rotuloForma = (f: string | null | undefined): string => (f ? ROTULO_FORMA[f] ?? f : '—');

export const arredondar = (v: number): number => Math.round((v + Number.EPSILON) * 100) / 100;

export function diasEntre(de: string, ate: string): number {
  const utc = (iso: string) => {
    const [a, m, d] = iso.split('-').map(Number);
    return Date.UTC(a, m - 1, d);
  };
  return Math.round((utc(ate) - utc(de)) / 86_400_000);
}

/** Encargos de uma mensalidade pendente se fosse paga em `dataRef` (multa de 2% uma vez + juros de 1% a.m. pro rata). */
export function encargosEm(m: Pick<Mensalidade, 'valor' | 'vencimento'>, dataRef: string) {
  const dias = m.vencimento < dataRef ? diasEntre(m.vencimento, dataRef) : 0;
  if (dias <= 0) return { dias: 0, multa: 0, juros: 0, total: arredondar(m.valor) };
  const multa = arredondar(m.valor * MULTA);
  const juros = arredondar(m.valor * JUROS_MES * (dias / 30));
  return { dias, multa, juros, total: arredondar(m.valor + multa + juros) };
}

/** Data local aaaa-mm-dd (o main valida "não futura" pela data local, não UTC). */
export function hojeLocal(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const diasTxt = (n: number): string => `${n} ${n === 1 ? 'dia' : 'dias'}`;

export type StatusExibido = 'paga' | 'cancelada' | 'atrasada' | 'pendente';
export function statusExibido(m: Pick<Mensalidade, 'status' | 'atrasada'>): StatusExibido {
  if (m.status === 'paga') return 'paga';
  if (m.status === 'cancelada') return 'cancelada';
  return m.atrasada ? 'atrasada' : 'pendente';
}
export const ROTULO_STATUS: Record<StatusExibido, string> = { paga: 'Paga', cancelada: 'Cancelada', atrasada: 'Atrasada', pendente: 'Em aberto' };

// ---------- CSV ----------
function celulaCsv(v: unknown): string {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // evita fórmula ao abrir no Excel
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const numCsv = (n: number | null | undefined) => (n === null || n === undefined ? '' : n.toFixed(2).replace('.', ','));

export function gerarCsv(lista: Mensalidade[]): string {
  const cab = ['Aluno', 'Idioma', 'Turma', 'Competência', 'Vencimento', 'Valor', 'Status', 'Dias de atraso', 'Multa', 'Juros',
    'Valor atualizado', 'Data do pagamento', 'Valor pago', 'Forma de pagamento'];
  const linhas = lista.map((m) => [
    m.aluno_nome, m.idioma_nome, m.turma_nome, fmtCompetencia(m.competencia), fmtData(m.vencimento), numCsv(m.valor),
    ROTULO_STATUS[statusExibido(m)], m.atrasada ? m.dias_atraso : '', numCsv(m.multa), numCsv(m.juros),
    m.status === 'cancelada' ? '' : numCsv(m.valor_atualizado),
    m.data_pagamento ? fmtData(m.data_pagamento) : '', numCsv(m.valor_pago), m.forma_pagamento ? rotuloForma(m.forma_pagamento) : '',
  ]);
  return [cab, ...linhas].map((l) => l.map(celulaCsv).join(';')).join('\r\n') + '\r\n';
}

// ---------- Gráfico ----------
/** Escala "redonda" do eixo: 4 divisões de passo 1, 2, 2,5, 5 ou 10 × 10^n. Devolve o topo e o passo. */
export function escalaEixo(max: number): { topo: number; passo: number } {
  if (!(max > 0)) return { topo: 0, passo: 0 };
  const bruto = max / 4;
  const pot = 10 ** Math.floor(Math.log10(bruto));
  const passo = [1, 2, 2.5, 5, 10].map((f) => f * pot).find((p) => p >= bruto)!;
  return { topo: passo * 4, passo };
}
