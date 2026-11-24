import { randomUUID } from 'node:crypto';
import { HttpError } from '../../main/router.ts';
import { createServer } from 'node:http';
import type { IncomingMessage } from 'node:http';
import type { ApiRequest, ApiResponse, HttpMethod } from '../../shared/types.ts';

export interface Aplicacao {
  autorizar?(token?: string): void;
  handle(request: ApiRequest, token?: string): Promise<ApiResponse>;
}

async function corpo(req: IncomingMessage, limite = 1_048_576): Promise<unknown> {
  let tamanho = 0;
  const partes: Buffer[] = [];
  for await (const parte of req) {
    const buffer = Buffer.from(parte);
    tamanho += buffer.length;
    if (tamanho > limite) throw new Error('LIMITE');
    partes.push(buffer);
  }
  return partes.length ? JSON.parse(Buffer.concat(partes).toString('utf8')) : undefined;
}

export function criarServidorHttp(aplicacao: Aplicacao) {
  const limites = new Map<string, { n: number; ate: number }>();
  const server = createServer(async (req, res) => {
    const requestId = randomUUID(),
      inicio = Date.now();
    res.setHeader('X-Request-Id', requestId);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    const enviar = (r: ApiResponse) => {
      if (req.url !== '/health')
        console.log(JSON.stringify({ evento: 'http', requestId, metodo: req.method, status: r.status, duracaoMs: Date.now() - inicio }));
      res.statusCode = r.status;
      res.end(JSON.stringify(r));
    };
    try {
      if (req.headers.origin) return enviar({ ok: false, status: 403, erro: 'Origem não autorizada' });
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (req.method === 'GET' && url.pathname === '/health') return enviar({ ok: true, status: 200, data: { status: 'ok', versao: 1 } });
      if (!url.pathname.startsWith('/api/v1/')) return enviar({ ok: false, status: 404, erro: 'Rota não encontrada' });
      const methods = ['GET', 'POST', 'PUT', 'DELETE'];
      if (!methods.includes(req.method ?? '')) return enviar({ ok: false, status: 405, erro: 'Método não permitido' });
      const authorization = req.headers.authorization;
      const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : undefined;
      const aberta = ['/api/v1/auth/login', '/api/v1/auth/ativar'].includes(url.pathname);
      const chave = (req.socket.remoteAddress ?? 'local') + (aberta ? ':auth' : ':api'),
        agora = Date.now();
      let limite = limites.get(chave);
      if (!limite || limite.ate < agora) {
        limite = { n: 0, ate: agora + 60000 };
        if (limites.size > 10000) limites.delete(limites.keys().next().value!);
        limites.set(chave, limite);
      }
      if (++limite.n > (aberta ? 15 : 240)) return enviar({ ok: false, status: 429, erro: 'Muitas requisições. Aguarde um minuto.' });
      if (!aberta) aplicacao.autorizar?.(token);
      const r = await aplicacao.handle(
        {
          method: req.method as HttpMethod,
          path: url.pathname.slice(7) + url.search,
          body: await corpo(
            req,
            url.pathname.startsWith('/api/v1/biblioteca') || url.pathname.includes('/entregas') ? 10_000_000 : 1_048_576,
          ),
        },
        token,
      );
      enviar(r);
    } catch (err) {
      if (err instanceof HttpError) return enviar({ ok: false, status: err.status, erro: err.erro });
      const limite = err instanceof Error && err.message === 'LIMITE';
      enviar({
        ok: false,
        status: limite ? 413 : 400,
        erro: limite ? 'Arquivo/requisição excede o limite permitido' : 'Requisição inválida',
      });
    }
  });
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  server.maxHeadersCount = 40;
  return server;
}
