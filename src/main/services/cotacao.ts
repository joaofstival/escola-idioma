// Cotação de moedas em BRL (docs/pesquisa.md, "Cotação").
// Principal: AwesomeAPI; fallback: open.er-api.com (valor = 1 / rates.X); por fim, cache vencido (até 72 h).
// Cache em memória por moeda com TTL de 1 h. Timeout de 5 s por chamada. `fetch` e relógio injetáveis.
import { HttpError, ValidationError } from '../router.ts';
import { TIMEOUT_PADRAO_MS, ehObjeto, fetchPadrao, obterJson } from './http.ts';
import type { FetchFn } from './http.ts';
import type { Conversao, Cotacao, CotacaoResposta } from '../../shared/types.ts';

export const MOEDAS_PADRAO = ['USD', 'EUR', 'GBP', 'ARS', 'CLP', 'JPY', 'CAD', 'CHF', 'CNY', 'PYG'] as const;
export const TTL_MS = 60 * 60 * 1000;
export const LIMITE_VENCIDO_MS = 72 * 60 * 60 * 1000;
export const MAX_MOEDAS = 30;
export const MSG_INDISPONIVEL = 'Serviço de cotação indisponível no momento. Tente novamente mais tarde.';

export const URL_AWESOME = 'https://economia.awesomeapi.com.br/json/last/';
export const URL_ER_API = 'https://open.er-api.com/v6/latest/BRL';

export const NOMES_MOEDAS: Record<string, string> = {
  BRL: 'Real brasileiro',
  USD: 'Dólar americano',
  EUR: 'Euro',
  GBP: 'Libra esterlina',
  ARS: 'Peso argentino',
  CLP: 'Peso chileno',
  JPY: 'Iene japonês',
  CAD: 'Dólar canadense',
  CHF: 'Franco suíço',
  CNY: 'Yuan chinês',
  PYG: 'Guarani paraguaio',
  UYU: 'Peso uruguaio',
  BOB: 'Boliviano',
  PEN: 'Sol peruano',
  COP: 'Peso colombiano',
  MXN: 'Peso mexicano',
  AUD: 'Dólar australiano',
};

const MOEDA_RE = /^[A-Z]{3}$/;

export interface CotacaoOpcoes {
  fetch?: FetchFn;
  agora?: () => number;
  timeoutMs?: number;
}

interface EntradaCache {
  cotacao: Cotacao;
  obtidoEm: number;
}
type Resultado = { tipo: 'ok'; cotacao: Cotacao } | { tipo: 'inexistente' } | { tipo: 'falha' };

/** Normaliza e valida códigos ISO 4217 (422 se algum for inválido). Lista vazia → moedas padrão. */
export function lerMoedas(v: string | undefined | null, padrao: readonly string[] = MOEDAS_PADRAO): string[] {
  const lista = (v ?? '')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  if (!lista.length) return [...padrao];
  const invalidas = lista.filter((m) => !MOEDA_RE.test(m));
  if (invalidas.length) {
    throw new ValidationError(
      invalidas.map((m) => `Código de moeda inválido: "${m}" (use 3 letras, ex.: USD)`),
      'Moeda inválida',
    );
  }
  const unicas = [...new Set(lista)];
  if (unicas.length > MAX_MOEDAS) throw new ValidationError([`Informe no máximo ${MAX_MOEDAS} moedas`], 'Moeda inválida');
  return unicas;
}

function arred(v: number, casas: number): number {
  const f = 10 ** casas;
  return Math.round((v + Number.EPSILON) * f) / f;
}

function montar(
  moeda: string,
  valorEmBrl: number,
  atualizado_em: string,
  fonte: string,
  variacao_pct: number | null,
  nomeApi?: string,
): Cotacao {
  return {
    moeda,
    nome: NOMES_MOEDAS[moeda] ?? nomeApi ?? moeda,
    valor_em_brl: arred(valorEmBrl, 6),
    brl_em_moeda: arred(1 / valorEmBrl, 6),
    atualizado_em,
    variacao_pct,
    fonte,
    desatualizada: false,
  };
}

/** "2026-11-16 19:07:21" (horário de Brasília) → "2026-11-16T19:07:21-03:00". */
function dataAwesome(v: unknown, agora: number): string {
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(v)) return v.replace(' ', 'T') + '-03:00';
  return new Date(agora).toISOString();
}

export class ServicoCotacao {
  private readonly fetchFn: FetchFn;
  private readonly agora: () => number;
  private readonly timeoutMs: number;
  private readonly cache = new Map<string, EntradaCache>();

  constructor(op: CotacaoOpcoes = {}) {
    this.fetchFn = op.fetch ?? fetchPadrao();
    this.agora = op.agora ?? Date.now;
    this.timeoutMs = op.timeoutMs ?? TIMEOUT_PADRAO_MS;
  }

  limparCache(): void {
    this.cache.clear();
  }

  /** Interpreta um objeto da AwesomeAPI ({ USDBRL: { bid, pctChange, create_date, name } }). */
  private lerAwesome(corpo: Record<string, unknown>, moeda: string): Resultado {
    const item = corpo[`${moeda}BRL`];
    if (!ehObjeto(item)) return { tipo: 'falha' };
    const bid = Number(item.bid);
    if (!Number.isFinite(bid) || bid <= 0) return { tipo: 'falha' };
    const pct = Number(item.pctChange);
    const nome = typeof item.name === 'string' ? item.name.split('/')[0] : undefined;
    return {
      tipo: 'ok',
      cotacao: montar(
        moeda,
        bid,
        dataAwesome(item.create_date, this.agora()),
        'awesomeapi',
        Number.isFinite(pct) ? arred(pct, 2) : null,
        nome,
      ),
    };
  }

  private async awesomePar(moeda: string): Promise<Resultado> {
    try {
      const r = await obterJson(this.fetchFn, `${URL_AWESOME}${moeda}-BRL`, this.timeoutMs);
      if (r.status === 404 && ehObjeto(r.corpo) && r.corpo.code === 'CoinNotExists') return { tipo: 'inexistente' };
      if (!r.ok || !ehObjeto(r.corpo)) return { tipo: 'falha' };
      return this.lerAwesome(r.corpo, moeda);
    } catch {
      return { tipo: 'falha' };
    }
  }

  /** Um lote só; se a API disser que alguma moeda não existe (o lote inteiro falha), consulta par a par. */
  private async awesome(moedas: string[]): Promise<Map<string, Resultado>> {
    const out = new Map<string, Resultado>();
    try {
      const r = await obterJson(this.fetchFn, `${URL_AWESOME}${moedas.map((m) => `${m}-BRL`).join(',')}`, this.timeoutMs);
      if (r.ok && ehObjeto(r.corpo)) {
        for (const m of moedas) out.set(m, this.lerAwesome(r.corpo, m));
        return out;
      }
      if (r.status === 404 && ehObjeto(r.corpo) && r.corpo.code === 'CoinNotExists') {
        if (moedas.length === 1) return new Map([[moedas[0], { tipo: 'inexistente' }]]);
        const res = await Promise.all(moedas.map((m) => this.awesomePar(m)));
        moedas.forEach((m, i) => out.set(m, res[i]));
        return out;
      }
    } catch {
      // segue para a falha abaixo
    }
    for (const m of moedas) out.set(m, { tipo: 'falha' });
    return out;
  }

  /** Fallback: open.er-api.com com base BRL (rates.X = quanto 1 BRL vale em X). null = fonte fora do ar. */
  private async erApi(moedas: string[]): Promise<Map<string, Resultado> | null> {
    try {
      const r = await obterJson(this.fetchFn, URL_ER_API, this.timeoutMs);
      if (!r.ok || !ehObjeto(r.corpo) || r.corpo.result !== 'success' || !ehObjeto(r.corpo.rates)) return null;
      const rates = r.corpo.rates;
      const data =
        typeof r.corpo.time_last_update_utc === 'string' && !Number.isNaN(Date.parse(r.corpo.time_last_update_utc))
          ? new Date(r.corpo.time_last_update_utc).toISOString()
          : new Date(this.agora()).toISOString();
      const out = new Map<string, Resultado>();
      for (const m of moedas) {
        const taxa = Number(rates[m]);
        out.set(
          m,
          Number.isFinite(taxa) && taxa > 0
            ? { tipo: 'ok', cotacao: montar(m, 1 / taxa, data, 'exchangerate-api', null) }
            : { tipo: 'inexistente' },
        );
      }
      return out;
    } catch {
      return null;
    }
  }

  /** Cotações em BRL. Moedas inexistentes vão em `invalidas`; sem fonte e sem cache, em `indisponiveis`. */
  async cotacoes(moedasPedidas: readonly string[]): Promise<CotacaoResposta> {
    const agora = this.agora();
    const cotacoes: Record<string, Cotacao> = {};
    const invalidas: string[] = [];
    const indisponiveis: string[] = [];
    const buscar: string[] = [];

    for (const m of moedasPedidas) {
      if (m === 'BRL') {
        cotacoes.BRL = {
          moeda: 'BRL',
          nome: NOMES_MOEDAS.BRL,
          valor_em_brl: 1,
          brl_em_moeda: 1,
          atualizado_em: new Date(agora).toISOString(),
          variacao_pct: 0,
          fonte: 'fixo',
          desatualizada: false,
        };
        continue;
      }
      const c = this.cache.get(m);
      if (c && agora - c.obtidoEm < TTL_MS) cotacoes[m] = c.cotacao;
      else buscar.push(m);
    }

    if (buscar.length) {
      const principal = await this.awesome(buscar);
      const pendentes = buscar.filter((m) => principal.get(m)?.tipo !== 'ok');
      const reserva = pendentes.length ? await this.erApi(pendentes) : null;
      for (const m of buscar) {
        const p = principal.get(m)!;
        const r = reserva?.get(m);
        const ok = p.tipo === 'ok' ? p : r?.tipo === 'ok' ? r : null;
        if (ok) {
          this.cache.set(m, { cotacao: ok.cotacao, obtidoEm: agora });
          cotacoes[m] = ok.cotacao;
          continue;
        }
        const vencida = this.cache.get(m);
        if (vencida && agora - vencida.obtidoEm < LIMITE_VENCIDO_MS) {
          cotacoes[m] = { ...vencida.cotacao, desatualizada: true };
        } else if (p.tipo === 'inexistente' || r?.tipo === 'inexistente') {
          invalidas.push(m);
        } else {
          indisponiveis.push(m);
        }
      }
    }

    const lista = Object.values(cotacoes);
    if (!lista.length) {
      if (indisponiveis.length) throw new HttpError(503, MSG_INDISPONIVEL);
      throw new ValidationError(
        invalidas.map((m) => `Moeda não encontrada: ${m}`),
        'Moeda não encontrada',
      );
    }
    const fontes = [...new Set(lista.filter((c) => c.moeda !== 'BRL').map((c) => c.fonte ?? ''))];
    const resp: CotacaoResposta = {
      base: 'BRL',
      fonte: fontes.length ? fontes.join(',') : 'fixo',
      data: lista
        .map((c) => c.atualizado_em)
        .sort()
        .at(-1)!,
      desatualizada: lista.some((c) => c.desatualizada),
      cotacoes,
    };
    if (invalidas.length) resp.invalidas = invalidas;
    if (indisponiveis.length) resp.indisponiveis = indisponiveis;
    return resp;
  }

  /** Converte cruzando por BRL: valor × valor_em_brl(de) / valor_em_brl(para). */
  async converter(valor: number, de: string, para: string): Promise<Conversao> {
    const r = await this.cotacoes([...new Set([de, para])]);
    if (r.invalidas?.length)
      throw new ValidationError(
        r.invalidas.map((m) => `Moeda não encontrada: ${m}`),
        'Moeda não encontrada',
      );
    if (r.indisponiveis?.length) throw new HttpError(503, MSG_INDISPONIVEL);
    const taxa = r.cotacoes[de].valor_em_brl / r.cotacoes[para].valor_em_brl;
    return {
      valor,
      de,
      para,
      resultado: arred(valor * taxa, 4),
      taxa: arred(taxa, 8),
      fonte: r.fonte,
      data: r.data,
      desatualizada: !!r.desatualizada,
    };
  }
}
