// Tradução de palavras e frases curtas (docs/pesquisa.md, "Tradução").
// Ordem: cache (30 dias) → MyMemory → Google gtx → dicionário offline → 503. Timeout de 5 s por fonte.
import { HttpError, ValidationError } from '../router.ts';
import { TIMEOUT_PADRAO_MS, ehObjeto, fetchPadrao, obterJson } from './http.ts';
import type { FetchFn } from './http.ts';
import { consultarDicionario } from '../data/dicionario.ts';
import type { Traducao } from '../../shared/types.ts';

export const IDIOMAS_TRADUCAO = ['pt', 'en', 'es', 'fr', 'it', 'de', 'ja', 'zh'] as const;
export const MAX_BYTES = 500;
export const TTL_CACHE_MS = 30 * 24 * 60 * 60 * 1000;
export const MAX_CACHE = 5000;
export const MSG_INDISPONIVEL = 'Tradução indisponível no momento (serviços externos fora do ar). Tente novamente mais tarde.';
export const URL_MYMEMORY = 'https://api.mymemory.translated.net/get';
export const URL_GOOGLE = 'https://translate.googleapis.com/translate_a/single';

export interface TraducaoOpcoes {
  fetch?: FetchFn; agora?: () => number; timeoutMs?: number;
  /** E-mail opcional do MyMemory (sobe a cota); padrão: variável de ambiente MYMEMORY_EMAIL. */
  email?: string | null;
}

interface PedidoTraducao { texto: string; de: string; para: string }

/** Valida texto (obrigatório, até 500 bytes) e idiomas (ISO 639-1 suportados). 422 com os detalhes. */
export function validarPedido(texto: unknown, de: unknown, para: unknown): PedidoTraducao {
  const detalhes: string[] = [];
  const t = typeof texto === 'string' ? texto.trim() : '';
  if (!t) detalhes.push('texto é obrigatório');
  else if (Buffer.byteLength(t, 'utf8') > MAX_BYTES) detalhes.push(`texto deve ter no máximo ${MAX_BYTES} bytes (tem ${Buffer.byteLength(t, 'utf8')})`);
  const norm = (v: unknown) => (typeof v === 'string' ? v.trim().toLowerCase() : '');
  const d = norm(de);
  const p = norm(para);
  const lista = IDIOMAS_TRADUCAO.join(', ');
  if (!(IDIOMAS_TRADUCAO as readonly string[]).includes(d)) detalhes.push(`de deve ser um destes idiomas: ${lista}`);
  if (!(IDIOMAS_TRADUCAO as readonly string[]).includes(p)) detalhes.push(`para deve ser um destes idiomas: ${lista}`);
  if (detalhes.length) throw new ValidationError(detalhes, 'Parâmetros inválidos');
  return { texto: t, de: d, para: p };
}

interface EntradaCache { traducao: string; alternativas: string[]; criadoEm: number }

export class ServicoTraducao {
  private readonly fetchFn: FetchFn;
  private readonly agora: () => number;
  private readonly timeoutMs: number;
  private readonly email: string | null;
  private readonly cache = new Map<string, EntradaCache>();

  constructor(op: TraducaoOpcoes = {}) {
    this.fetchFn = op.fetch ?? fetchPadrao();
    this.agora = op.agora ?? Date.now;
    this.timeoutMs = op.timeoutMs ?? TIMEOUT_PADRAO_MS;
    this.email = op.email !== undefined ? op.email : (process.env.MYMEMORY_EMAIL?.trim() || null);
  }

  limparCache(): void {
    this.cache.clear();
  }

  private chave(p: PedidoTraducao): string {
    return `${p.de}|${p.para}|${p.texto.toLowerCase()}`;
  }

  /** MyMemory: só aceita responseStatus 200 e quotaFinished !== true (a API devolve HTTP 200 mesmo com erro). */
  private async myMemory(p: PedidoTraducao): Promise<{ traducao: string; alternativas: string[] } | null> {
    const qs = new URLSearchParams({ q: p.texto, langpair: `${p.de}|${p.para}` });
    if (this.email) qs.set('de', this.email);
    try {
      const r = await obterJson(this.fetchFn, `${URL_MYMEMORY}?${qs}`, this.timeoutMs);
      const c = r.corpo;
      if (!r.ok || !ehObjeto(c) || Number(c.responseStatus) !== 200 || c.quotaFinished === true) return null;
      const dados = c.responseData;
      const traducao = ehObjeto(dados) && typeof dados.translatedText === 'string' ? dados.translatedText.trim() : '';
      if (!traducao || /^MYMEMORY WARNING/i.test(traducao)) return null;
      const alternativas: string[] = [];
      if (Array.isArray(c.matches)) {
        for (const m of c.matches.slice(0, 5)) {
          const t = ehObjeto(m) && typeof m.translation === 'string' ? m.translation.trim() : '';
          if (t && t.toLowerCase() !== traducao.toLowerCase() && !alternativas.some((a) => a.toLowerCase() === t.toLowerCase())) alternativas.push(t);
        }
      }
      return { traducao, alternativas: alternativas.slice(0, 3) };
    } catch {
      return null;
    }
  }

  /** Google gtx (não oficial): [[["book","livro",...]], null, "pt"] → junta os segmentos. */
  private async google(p: PedidoTraducao): Promise<string | null> {
    const qs = new URLSearchParams({ client: 'gtx', sl: p.de, tl: p.para, dt: 't', q: p.texto });
    try {
      const r = await obterJson(this.fetchFn, `${URL_GOOGLE}?${qs}`, this.timeoutMs);
      if (!r.ok || !Array.isArray(r.corpo) || !Array.isArray(r.corpo[0])) return null;
      const t = (r.corpo[0] as unknown[]).map((s) => (Array.isArray(s) && typeof s[0] === 'string' ? s[0] : '')).join('').trim();
      return t || null;
    } catch {
      return null;
    }
  }

  async traduzir(texto: unknown, de: unknown, para: unknown): Promise<Traducao> {
    const p = validarPedido(texto, de, para);
    if (p.de === p.para) return { texto: p.texto, traducao: p.texto, de: p.de, para: p.para, fonte: 'original' };

    const k = this.chave(p);
    const c = this.cache.get(k);
    if (c && this.agora() - c.criadoEm < TTL_CACHE_MS) {
      return { texto: p.texto, traducao: c.traducao, de: p.de, para: p.para, fonte: 'cache', ...(c.alternativas.length ? { alternativas: c.alternativas } : {}) };
    }

    let achado: { traducao: string; alternativas: string[]; fonte: string } | null = null;
    const mm = await this.myMemory(p);
    if (mm) achado = { ...mm, fonte: 'mymemory' };
    if (!achado) {
      const g = await this.google(p);
      if (g) achado = { traducao: g, alternativas: [], fonte: 'google' };
    }
    if (!achado) {
      const d = consultarDicionario(p.texto, p.de, p.para);
      if (d) achado = { ...d, fonte: 'dicionario' };
    }
    if (!achado) throw new HttpError(503, MSG_INDISPONIVEL);

    // O dicionário é local: não precisa de cache (e assim a API volta a ser consultada quando sair do ar).
    if (achado.fonte !== 'dicionario') {
      if (this.cache.size >= MAX_CACHE) this.cache.delete(this.cache.keys().next().value!);
      this.cache.set(k, { traducao: achado.traducao, alternativas: achado.alternativas, criadoEm: this.agora() });
    }
    return {
      texto: p.texto, traducao: achado.traducao, de: p.de, para: p.para, fonte: achado.fonte,
      ...(achado.alternativas.length ? { alternativas: achado.alternativas } : {}),
    };
  }
}
