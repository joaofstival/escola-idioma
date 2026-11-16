// Cliente da API usado por todas as telas. Fala com o processo principal via window.escola (IPC).
import type { EscolaBridge, HttpMethod } from '../shared/types.ts';

declare global { interface Window { escola: EscolaBridge } }

export class ApiError extends Error {
  status: number;
  detalhes: string[];
  constructor(status: number, erro: string, detalhes: string[] = []) {
    super(erro);
    this.status = status;
    this.detalhes = detalhes;
  }
}

type Params = Record<string, string | number | boolean | null | undefined>;

/** Monta query string ignorando valores vazios. */
export function qs(params: Params = {}): string {
  const p = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '');
  return p.length ? '?' + new URLSearchParams(p.map(([k, v]) => [k, String(v)])).toString() : '';
}

async function request<T>(method: HttpMethod, path: string, body?: unknown): Promise<T> {
  const res = await window.escola.request<T>({ method, path, body });
  if (!res.ok) throw new ApiError(res.status, res.erro, res.detalhes);
  return res.data;
}

export const api = {
  get: <T>(path: string, params?: Params) => request<T>('GET', path + qs(params)),
  post: <T>(path: string, body: unknown = {}) => request<T>('POST', path, body),
  put: <T>(path: string, body: unknown = {}) => request<T>('PUT', path, body),
  del: <T = { ok: true }>(path: string) => request<T>('DELETE', path),
  /** Salva um arquivo (ex.: CSV) com diálogo nativo. */
  saveFile: (name: string, content: string) => window.escola.saveFile(name, content),
};
