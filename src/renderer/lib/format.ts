// Formatação de exibição (docs/DESIGN.md): dd/mm/aaaa, R$ 1.234,56 e "—" para vazio.
export const VAZIO = '—';

export const ou = (v: string | number | null | undefined): string =>
  v === null || v === undefined || (typeof v === 'string' && v.trim() === '') || (typeof v === 'number' && Number.isNaN(v))
    ? VAZIO
    : String(v);

export const brl = (n: number | null | undefined): string =>
  n === null || n === undefined || Number.isNaN(n) ? VAZIO : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function dinheiro(n: number | null | undefined, moeda = 'BRL'): string {
  if (n === null || n === undefined || Number.isNaN(n)) return VAZIO;
  // Valor entre 0 e 1 centavo (ex.: 1 peso argentino ≈ R$ 0,0037) não pode virar "0,00": mostra até 4 casas.
  const pequeno = n !== 0 && Math.abs(n) < 0.01;
  try {
    return n.toLocaleString('pt-BR', {
      style: 'currency',
      currency: moeda,
      ...(pequeno ? { minimumFractionDigits: 2, maximumFractionDigits: 4 } : {}),
    });
  } catch {
    return `${moeda} ${n.toFixed(2)}`;
  }
}

/** 'aaaa-mm-dd' (ou data/hora ISO) → 'dd/mm/aaaa'. */
export function data(iso: string | null | undefined): string {
  if (!iso) return VAZIO;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? VAZIO : d.toLocaleDateString('pt-BR');
}

export const competencia = (ym: string | null | undefined): string => {
  if (!ym) return VAZIO;
  const [y, m] = ym.split('-');
  return `${m}/${y}`;
};

export const hoje = (): string => new Date().toISOString().slice(0, 10);
export const anoAtual = (): number => new Date().getFullYear();

/** Faixa QECR para o nível numérico (12 níveis, 2 por faixa). */
export const cefr = (n: number | string): string =>
  ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'][Math.min(5, Math.max(0, Math.ceil(Number(n) / 2) - 1))];
/** Rótulo de nível numérico (ex.: "Nível 3 (A2)"). */
export const nivel = (n: number | string): string => `Nível ${n} (${cefr(n)})`;

/** Moedas oferecidas no cadastro do aluno (as mesmas da cotação). */
export const MOEDAS = ['BRL', 'USD', 'EUR', 'GBP', 'ARS', 'CLP', 'JPY', 'CAD', 'CHF', 'CNY', 'PYG'];
export const NIVEIS = Array.from({ length: 12 }, (_, i) => i + 1);

/** Anos letivos ao redor do ano atual (inclui `extra`, se fora da faixa), do maior para o menor. */
export function anosLetivos(extra?: number): number[] {
  const a = anoAtual();
  const anos = [a + 1, a, a - 1, a - 2, a - 3];
  if (extra !== undefined && !anos.includes(extra)) anos.push(extra);
  return anos.sort((x, y) => y - x);
}
