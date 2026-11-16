// Acesso HTTP dos serviços externos com timeout. O `fetch` é injetável para os testes não usarem a rede.

/** Subconjunto do fetch usado pelos serviços (o fetch global é compatível; os testes passam um falso). */
export type FetchFn = (url: string, init?: { signal?: AbortSignal; headers?: Record<string, string> }) =>
  Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export const TIMEOUT_PADRAO_MS = 5000;

/** Falha de rede, timeout, HTTP != 2xx ou JSON inválido. */
export class FalhaExterna extends Error {
  status: number | null;
  corpo: unknown;
  constructor(msg: string, status: number | null = null, corpo: unknown = null) {
    super(msg);
    this.name = 'FalhaExterna';
    this.status = status;
    this.corpo = corpo;
  }
}

export function fetchPadrao(): FetchFn {
  return (url, init) => globalThis.fetch(url, init);
}

/**
 * GET com timeout (aborta a requisição e rejeita mesmo que o fetch ignore o sinal).
 * Devolve { status, corpo }; não lança em HTTP 4xx/5xx para o chamador poder ler o corpo de erro.
 */
export async function obterJson(fetchFn: FetchFn, url: string, timeoutMs = TIMEOUT_PADRAO_MS): Promise<{ status: number; ok: boolean; corpo: unknown }> {
  const ctrl = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limite = new Promise<never>((_, rej) => {
    timer = setTimeout(() => {
      ctrl.abort();
      rej(new FalhaExterna(`Tempo esgotado (${timeoutMs} ms) em ${new URL(url).host}`));
    }, timeoutMs);
  });
  try {
    const resp = await Promise.race([fetchFn(url, { signal: ctrl.signal, headers: { accept: 'application/json' } }), limite]);
    let corpo: unknown = null;
    try {
      corpo = await Promise.race([resp.json(), limite]);
    } catch (err) {
      if (err instanceof FalhaExterna) throw err;
      if (resp.ok) throw new FalhaExterna(`Resposta inválida de ${new URL(url).host}`, resp.status);
    }
    return { status: resp.status, ok: resp.ok, corpo };
  } catch (err) {
    if (err instanceof FalhaExterna) throw err;
    throw new FalhaExterna(`Falha ao acessar ${new URL(url).host}: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    clearTimeout(timer);
  }
}

export function ehObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
