import { createServer } from 'node:http';
import type { IncomingMessage } from 'node:http';
import type { ApiRequest, ApiResponse, HttpMethod } from '../../shared/types.ts';

export interface Aplicacao {
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
  const server = createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    const enviar = (r: ApiResponse) => {
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
