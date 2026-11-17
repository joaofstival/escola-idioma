// Mini-roteador REST usado pelo IPC 'api:request'. Não depende do Electron (testável com node --test).
import type { ApiRequest, ApiResponse, HttpMethod } from '../shared/types.ts';

/** Erro com status HTTP e mensagem para o usuário. */
export class HttpError extends Error {
  status: number;
  erro: string;
  detalhes?: string[];
  constructor(status: number, erro: string, detalhes?: string[]) {
    super(erro);
    this.name = 'HttpError';
    this.status = status;
    this.erro = erro;
    this.detalhes = detalhes;
  }
}

/** Falha de validação dos dados enviados (422). */
export class ValidationError extends HttpError {
  constructor(detalhes: string[], erro = 'Dados inválidos') {
    super(422, erro, detalhes);
    this.name = 'ValidationError';
  }
}

/** Atalho para 404 com mensagem padronizada. */
export class NotFoundError extends HttpError {
  constructor(erro = 'Registro não encontrado') {
    super(404, erro);
    this.name = 'NotFoundError';
  }
}

export interface RequestContext {
  method: HttpMethod;
  path: string;
  params: Record<string, string>;
  query: Record<string, string>;
  body: unknown;
}

export type Handler = (ctx: RequestContext) => unknown | Promise<unknown>;

export interface RouteOptions {
  /** Status de sucesso (padrão 200; use 201 em criações). */
  status?: number;
}

interface Route {
  method: HttpMethod;
  pattern: string;
  segments: string[];
  literais: number;
  handler: Handler;
  status: number;
}

const METODOS: readonly HttpMethod[] = ['GET', 'POST', 'PUT', 'DELETE'];

function dividir(path: string): string[] {
  return path.split('/').filter((s) => s.length > 0);
}

/** Traduz erros do SQLite (restrições) em mensagens 422 compreensíveis. */
function erroDeRestricao(err: unknown): HttpError | null {
  const msg = err instanceof Error ? err.message : String(err);
  if (/UNIQUE constraint failed/i.test(msg)) return new HttpError(422, 'Já existe um registro com esses dados', [msg]);
  if (/FOREIGN KEY constraint failed/i.test(msg)) {
    return new HttpError(422, 'Operação viola um vínculo entre registros (referência inexistente ou registros dependentes)', [msg]);
  }
  if (/CHECK constraint failed/i.test(msg)) return new HttpError(422, 'Valor fora das regras do cadastro', [msg]);
  if (/NOT NULL constraint failed/i.test(msg)) return new HttpError(422, 'Campo obrigatório não informado', [msg]);
  return null;
}

export class Router {
  private routes: Route[] = [];
  /** Função de log para erros inesperados (substituível nos testes). */
  logger: (msg: string, err: unknown) => void = (msg, err) => console.error(msg, err);

  add(method: HttpMethod, pattern: string, handler: Handler, opts: RouteOptions = {}): this {
    const segments = dividir(pattern);
    this.routes.push({
      method,
      pattern,
      segments,
      handler,
      literais: segments.filter((s) => !s.startsWith(':')).length,
      status: opts.status ?? 200,
    });
    return this;
  }

  get(pattern: string, h: Handler, o?: RouteOptions) {
    return this.add('GET', pattern, h, o);
  }
  post(pattern: string, h: Handler, o?: RouteOptions) {
    return this.add('POST', pattern, h, o);
  }
  put(pattern: string, h: Handler, o?: RouteOptions) {
    return this.add('PUT', pattern, h, o);
  }
  delete(pattern: string, h: Handler, o?: RouteOptions) {
    return this.add('DELETE', pattern, h, o);
  }

  /** Lista as rotas registradas (útil para depuração e testes). */
  list(): string[] {
    return this.routes.map((r) => `${r.method} ${r.pattern}`);
  }

  private casar(route: Route, partes: string[]): Record<string, string> | null {
    if (route.segments.length !== partes.length) return null;
    const params: Record<string, string> = {};
    for (let i = 0; i < partes.length; i++) {
      const seg = route.segments[i];
      if (seg.startsWith(':')) params[seg.slice(1)] = partes[i];
      else if (seg !== partes[i]) return null;
    }
    return params;
  }

  async handle(req: ApiRequest): Promise<ApiResponse> {
    try {
      if (!req || typeof req !== 'object' || typeof req.path !== 'string') {
        throw new HttpError(400, 'Requisição inválida');
      }
      const method = String(req.method ?? '').toUpperCase() as HttpMethod;
      if (!METODOS.includes(method)) throw new HttpError(405, `Método não suportado: ${req.method}`);

      const [caminho, qs = ''] = req.path.split('?', 2);
      let partes: string[];
      try {
        partes = dividir(caminho).map((p) => decodeURIComponent(p));
      } catch {
        throw new HttpError(400, 'Caminho inválido');
      }
      const query: Record<string, string> = {};
      for (const [k, v] of new URLSearchParams(qs)) query[k] = v;

      // Entre as rotas que casam, prefere a com mais segmentos literais (ex.: /matriculas/sugestoes antes de /matriculas/:id).
      let melhor: { route: Route; params: Record<string, string> } | null = null;
      let caminhoExiste = false;
      for (const route of this.routes) {
        const params = this.casar(route, partes);
        if (!params) continue;
        caminhoExiste = true;
        if (route.method !== method) continue;
        if (!melhor || route.literais > melhor.route.literais) melhor = { route, params };
      }
      if (!melhor) {
        if (caminhoExiste) throw new HttpError(405, `Método ${method} não permitido em ${caminho}`);
        throw new HttpError(404, `Rota não encontrada: ${method} ${caminho}`);
      }

      const data = await melhor.route.handler({ method, path: caminho, params: melhor.params, query, body: req.body });
      return { ok: true, status: melhor.route.status, data: data === undefined ? null : data };
    } catch (err) {
      if (err instanceof HttpError) {
        return err.detalhes && err.detalhes.length
          ? { ok: false, status: err.status, erro: err.erro, detalhes: err.detalhes }
          : { ok: false, status: err.status, erro: err.erro };
      }
      const restricao = erroDeRestricao(err);
      if (restricao) return { ok: false, status: restricao.status, erro: restricao.erro, detalhes: restricao.detalhes };
      this.logger(`[api] erro inesperado em ${req?.method} ${req?.path}:`, err);
      return { ok: false, status: 500, erro: 'Erro interno ao processar a requisição' };
    }
  }
}

export function createRouter(): Router {
  return new Router();
}
