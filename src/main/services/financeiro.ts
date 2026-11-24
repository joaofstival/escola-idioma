// Regras financeiras (docs/pesquisa.md, seção 4). Funções puras: o "hoje" é sempre recebido por parâmetro.
// As rotas obtêm o hoje por `hoje()`, que os testes podem fixar com `definirHoje()`.
import { hojeIso } from '../validation.ts';
import type { MensalidadeStatus } from '../../shared/types.ts';

/** Dia de vencimento padrão das mensalidades. */
export const DIA_VENCIMENTO = 10;
/** Multa moratória (CDC art. 52 §1º): 2% sobre o valor, uma vez. */
export const MULTA = 0.02;
/** Juros de mora: 1% ao mês, pro rata die (mês de 30 dias). */
export const JUROS_MES = 0.01;
/** Dias de tolerância para a 1ª parcela quando a matrícula é feita depois do dia de vencimento. */
export const PRAZO_PRIMEIRA_PARCELA = 5;
/** A partir deste atraso a Lei 9.870/99 admite medidas de cobrança. */
export const DIAS_COBRANCA = 90;

// ---------- Relógio injetável ----------
let fonteHoje: () => string = hojeIso;

/** Data de hoje (YYYY-MM-DD) usada pelas rotas. */
export function hoje(): string {
  return fonteHoje();
}

/** Fixa o "hoje" (testes). Aceita uma data ISO, uma função ou null para voltar ao relógio real. */
export function definirHoje(v: string | (() => string) | null): void {
  fonteHoje = v === null ? hojeIso : typeof v === 'string' ? () => v : v;
}

// ---------- Datas e valores ----------
export function arredondar(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

function paraUtc(iso: string): number {
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number);
  return Date.UTC(a, m - 1, d);
}

function deUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Dias corridos de `de` até `ate` (negativo se `ate` vem antes). */
export function diasEntre(de: string, ate: string): number {
  return Math.round((paraUtc(ate) - paraUtc(de)) / 86_400_000);
}

export function somarDias(iso: string, dias: number): string {
  return deUtc(paraUtc(iso) + dias * 86_400_000);
}

/** 'YYYY-MM' + dia → 'YYYY-MM-DD'. */
export function dataNoMes(competencia: string, dia: number): string {
  return `${competencia}-${String(dia).padStart(2, '0')}`;
}

// ---------- Encargos ----------
export interface MensalidadeBase {
  status: MensalidadeStatus;
  vencimento: string;
  valor: number;
}
export interface Encargos {
  atrasada: boolean;
  dias_atraso: number;
  multa: number;
  juros: number;
  valor_atualizado: number;
}

/** Atrasada = pendente e vencimento < hoje (pagar no próprio dia do vencimento não é atraso). */
export function estaAtrasada(m: Pick<MensalidadeBase, 'status' | 'vencimento'>, hojeRef: string): boolean {
  return m.status === 'pendente' && m.vencimento < hojeRef;
}

export function diasAtraso(m: Pick<MensalidadeBase, 'status' | 'vencimento'>, hojeRef: string): number {
  return estaAtrasada(m, hojeRef) ? diasEntre(m.vencimento, hojeRef) : 0;
}

/**
 * Multa de 2% + juros de 1% a.m. pro rata die sobre o valor original.
 * Só para exibição (valor_atualizado) ou sugestão no pagamento: nunca é gravado.
 */
export function calcularEncargos(m: MensalidadeBase, hojeRef: string): Encargos {
  const dias = diasAtraso(m, hojeRef);
  if (dias <= 0) return { atrasada: false, dias_atraso: 0, multa: 0, juros: 0, valor_atualizado: arredondar(m.valor) };
  const multa = arredondar(m.valor * MULTA);
  const juros = arredondar(m.valor * JUROS_MES * (dias / 30));
  return { atrasada: true, dias_atraso: dias, multa, juros, valor_atualizado: arredondar(m.valor + multa + juros) };
}

// ---------- Geração de parcelas ----------
export interface Parcela {
  competencia: string;
  vencimento: string;
  valor: number;
}

/**
 * Parcelas de uma matrícula: uma por mês, do mês da matrícula até dezembro do ano letivo, com o valor do idioma
 * e vencimento no dia 10. Se o ano letivo é posterior ao da matrícula (rematrícula antecipada), começa em janeiro.
 * Se a matrícula é feita depois do dia 10, a 1ª parcela vence em data + 5 dias, para não nascer atrasada.
 */
export function gerarParcelas(
  anoLetivo: number,
  valor: number,
  dataMatricula: string,
  politica?: { dia_vencimento: number; prazo_inicial: number },
): Parcela[] {
  const anoData = Number(dataMatricula.slice(0, 4));
  if (anoData > anoLetivo) throw new RangeError('A data da matrícula é posterior ao ano letivo');
  const mesInicio = anoData < anoLetivo ? 1 : Number(dataMatricula.slice(5, 7));
  const parcelas: Parcela[] = [];
  for (let mes = mesInicio; mes <= 12; mes++) {
    const competencia = `${anoLetivo}-${String(mes).padStart(2, '0')}`;
    let vencimento = dataNoMes(competencia, politica?.dia_vencimento ?? DIA_VENCIMENTO);
    if (mes === mesInicio && dataMatricula > vencimento)
      vencimento = somarDias(dataMatricula, politica?.prazo_inicial ?? PRAZO_PRIMEIRA_PARCELA);
    parcelas.push({ competencia, vencimento, valor: arredondar(valor) });
  }
  return parcelas;
}

/** Competências (YYYY-MM) de janeiro a dezembro do ano. */
export function competenciasDoAno(ano: number): string[] {
  return Array.from({ length: 12 }, (_, i) => `${ano}-${String(i + 1).padStart(2, '0')}`);
}

export const COMPETENCIA_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
