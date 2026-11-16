import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Router, HttpError, ValidationError } from './router.ts';

function novo() {
  const r = new Router();
  r.logger = () => {};
  return r;
}

test('casa path params, query string e devolve 200/201', async () => {
  const r = novo();
  r.get('/alunos/:id', ({ params, query }) => ({ id: params.id, busca: query.busca }));
  r.post('/alunos', ({ body }) => body, { status: 201 });
  assert.deepEqual(await r.handle({ method: 'GET', path: '/alunos/7?busca=Jo%C3%A3o&x=1' }), { ok: true, status: 200, data: { id: '7', busca: 'João' } });
  assert.deepEqual(await r.handle({ method: 'POST', path: '/alunos', body: { a: 1 } }), { ok: true, status: 201, data: { a: 1 } });
});

test('prefere rota literal à rota com parâmetro', async () => {
  const r = novo();
  r.get('/matriculas/:id', () => 'id');
  r.get('/matriculas/sugestoes-rematricula', () => 'sugestoes');
  assert.equal((await r.handle({ method: 'GET', path: '/matriculas/sugestoes-rematricula' }) as any).data, 'sugestoes');
  assert.equal((await r.handle({ method: 'GET', path: '/matriculas/3' }) as any).data, 'id');
});

test('404 para rota inexistente e 405 para método errado', async () => {
  const r = novo();
  r.get('/idiomas', () => []);
  assert.equal((await r.handle({ method: 'GET', path: '/nada' })).status, 404);
  assert.equal((await r.handle({ method: 'DELETE', path: '/idiomas' })).status, 405);
});

test('HttpError, ValidationError e erros inesperados', async () => {
  const r = novo();
  const logs: unknown[] = [];
  r.logger = (_m, e) => logs.push(e);
  r.get('/a', () => { throw new HttpError(409, 'conflito'); });
  r.get('/b', () => { throw new ValidationError(['nome é obrigatório']); });
  r.get('/c', async () => { throw new Error('bug'); });
  r.get('/d', () => { throw new Error('UNIQUE constraint failed: idiomas.nome'); });
  assert.deepEqual(await r.handle({ method: 'GET', path: '/a' }), { ok: false, status: 409, erro: 'conflito' });
  assert.deepEqual(await r.handle({ method: 'GET', path: '/b' }), { ok: false, status: 422, erro: 'Dados inválidos', detalhes: ['nome é obrigatório'] });
  assert.deepEqual(await r.handle({ method: 'GET', path: '/c' }), { ok: false, status: 500, erro: 'Erro interno ao processar a requisição' });
  assert.equal(logs.length, 1);
  assert.equal((await r.handle({ method: 'GET', path: '/d' })).status, 422);
});

test('requisição malformada', async () => {
  const r = novo();
  assert.equal((await r.handle({ method: 'PATCH' as any, path: '/x' })).status, 405);
  assert.equal((await r.handle(null as any)).status, 400);
});
