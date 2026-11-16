// Fetch falso para os testes (nenhum teste acessa a internet).
import type { FetchFn } from './http.ts';

export type Rota = (url: URL) => { status?: number; body: unknown } | 'erro' | 'trava';

/** Cria um fetch que responde pelo `rota` e registra as URLs chamadas. 'erro' = falha de rede; 'trava' = nunca responde. */
export function fetchFalso(rota: Rota): FetchFn & { chamadas: string[] } {
  const chamadas: string[] = [];
  const fn = (async (url: string, init?: { signal?: AbortSignal }) => {
    chamadas.push(url);
    const r = rota(new URL(url));
    if (r === 'erro') throw new TypeError('fetch failed');
    if (r === 'trava') {
      return new Promise((_, rej) => init?.signal?.addEventListener('abort', () => rej(new Error('aborted'))));
    }
    const status = r.status ?? 200;
    return { ok: status >= 200 && status < 300, status, json: async () => r.body };
  }) as FetchFn & { chamadas: string[] };
  fn.chamadas = chamadas;
  return fn;
}
