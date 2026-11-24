import type { ApiRequest, ApiResponse } from '../shared/types.ts';

export class ClienteCentral {
  private readonly base: URL;
  private token: string | undefined;
  constructor(endereco: string) {
    this.base = new URL(endereco);
    const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(this.base.hostname);
    if (
      this.base.username ||
      this.base.password ||
      this.base.search ||
      this.base.hash ||
      !['http:', 'https:'].includes(this.base.protocol) ||
      (this.base.protocol !== 'https:' && !loopback)
    ) {
      throw new Error('A API precisa usar HTTPS; HTTP é permitido somente no computador local.');
    }
  }
  async request<T = unknown>(req: ApiRequest): Promise<ApiResponse<T>> {
    if (!req.path.startsWith('/') || req.path.startsWith('//')) return { ok: false, status: 400, erro: 'Caminho inválido' };
    try {
      const url = new URL(this.base.href);
      url.pathname = '/api/v1' + req.path.split('?')[0];
      url.search = req.path.includes('?') ? req.path.slice(req.path.indexOf('?')) : '';
      const r = await fetch(url, {
        method: req.method,
        redirect: 'error',
        signal: AbortSignal.timeout(15_000),
        headers: { 'Content-Type': 'application/json', ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}) },
        body: req.method === 'GET' ? undefined : JSON.stringify(req.body ?? {}),
      });
      const resultado = (await r.json()) as ApiResponse<T>;
      if (!resultado || typeof resultado.ok !== 'boolean' || typeof resultado.status !== 'number') throw new Error('Resposta inválida');
      if (req.path === '/auth/login' && resultado.ok) {
        const dados = resultado.data as { token?: string };
        this.token = dados.token;
        delete dados.token;
      }
      if (req.path === '/auth/logout' || r.status === 401) this.token = undefined;
      return resultado;
    } catch {
      return { ok: false, status: 503, erro: 'Não foi possível conectar à escola. Verifique a conexão e tente novamente.' };
    }
  }
}
