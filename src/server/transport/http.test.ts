import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarServidorHttp } from './http.ts';
import { ClienteCentral } from '../../main/cliente-central.ts';

test('transporte central valida autenticação, JSON e origem sem expor o banco', async () => {
  const server = criarServidorHttp({
    async handle(req, token) {
      return token === 'permitido'
        ? { ok: true, status: 200, data: { caminho: req.path } }
        : { ok: false, status: 401, erro: 'Não autenticado' };
    },
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  try {
    assert.equal((await fetch(base + '/health')).status, 200);
    assert.equal((await fetch(base + '/api/v1/alunos')).status, 401);
    assert.equal((await fetch(base + '/api/v1/alunos', { headers: { Authorization: 'Bearer permitido' } })).status, 200);
    assert.equal((await fetch(base + '/api/v1/alunos', { headers: { Origin: 'https://intruso.example' } })).status, 403);
    assert.equal((await fetch(base + '/api/v1/alunos', { method: 'POST', body: '{' })).status, 400);
    assert.throws(() => new ClienteCentral('http://servidor-publico.example'), /HTTPS/);
    const cliente = new ClienteCentral(base);
    assert.equal((await cliente.request({ method: 'GET', path: '/alunos' })).status, 401);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  }
});
