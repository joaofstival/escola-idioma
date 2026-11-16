// Utilitários dos testes: API sobre banco em memória.
import assert from 'node:assert/strict';
import { openDb } from './db.ts';
import type { Db } from './db.ts';
import { createApi } from './app.ts';
import type { ApiResponse, HttpMethod } from '../shared/types.ts';

export interface ApiTeste {
  db: Db;
  req<T = any>(method: HttpMethod, path: string, body?: unknown): Promise<ApiResponse<T>>;
  /** Faz a requisição e exige sucesso, devolvendo data. */
  ok<T = any>(method: HttpMethod, path: string, body?: unknown, status?: number): Promise<T>;
  /** Faz a requisição e exige erro com o status indicado. */
  falha(method: HttpMethod, path: string, body: unknown, status: number): Promise<{ erro: string; detalhes?: string[] }>;
}

export async function criarApiTeste(): Promise<ApiTeste> {
  const db = await openDb();
  const router = createApi(db);
  router.logger = () => {};
  const req = <T>(method: HttpMethod, path: string, body?: unknown) => router.handle({ method, path, body }) as Promise<ApiResponse<T>>;
  return {
    db,
    req,
    async ok(method, path, body, status) {
      const r = await req<any>(method, path, body);
      assert.ok(r.ok, `esperava sucesso em ${method} ${path}, veio ${JSON.stringify(r)}`);
      if (status !== undefined) assert.equal(r.status, status);
      return r.data;
    },
    async falha(method, path, body, status) {
      const r = await req(method, path, body);
      assert.equal(r.ok, false, `esperava erro em ${method} ${path}, veio ${JSON.stringify(r)}`);
      if (r.ok) throw new Error('inalcançável');
      assert.equal(r.status, status, `status inesperado: ${JSON.stringify(r)}`);
      return { erro: r.erro, detalhes: r.detalhes };
    },
  };
}

/** Cria idioma, professor habilitado e turma básica para os testes. */
export async function criarBase(api: ApiTeste) {
  const ingles = await api.ok('POST', '/idiomas', { nome: 'Inglês', codigo: 'en', mensalidade: 300 });
  const espanhol = await api.ok('POST', '/idiomas', { nome: 'Espanhol', codigo: 'es', mensalidade: 280 });
  const prof = await api.ok('POST', '/professores', { nome: 'Ana Prof', email: 'ana@escola.com', idiomas: [ingles.id] });
  return { ingles, espanhol, prof };
}
