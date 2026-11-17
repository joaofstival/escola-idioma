import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarApiTeste } from '../test-helpers.ts';

test('CRUD de idiomas', async () => {
  const api = await criarApiTeste();
  const criado = await api.ok('POST', '/idiomas', { nome: 'Inglês', codigo: 'EN', mensalidade: '320,50' }, 201);
  assert.deepEqual(criado, { id: 1, nome: 'Inglês', codigo: 'en', mensalidade: 320.5 });
  await api.ok('POST', '/idiomas', { nome: 'Alemão', codigo: 'de', mensalidade: 360 });
  assert.deepEqual(
    (await api.ok('GET', '/idiomas')).map((i: any) => i.nome),
    ['Alemão', 'Inglês'],
  );
  assert.equal((await api.ok('GET', '/idiomas/1')).nome, 'Inglês');
  const alterado = await api.ok('PUT', '/idiomas/1', { mensalidade: 330 });
  assert.equal(alterado.mensalidade, 330);
  assert.equal(alterado.nome, 'Inglês', 'PUT parcial mantém os outros campos');
  assert.deepEqual(await api.ok('DELETE', '/idiomas/2'), { ok: true });
  await api.falha('GET', '/idiomas/2', undefined, 404);
});

test('idiomas: 404 e validações 422', async () => {
  const api = await criarApiTeste();
  await api.falha('GET', '/idiomas/99', undefined, 404);
  await api.falha('GET', '/idiomas/abc', undefined, 404);
  await api.falha('PUT', '/idiomas/99', { nome: 'X' }, 404);
  await api.falha('DELETE', '/idiomas/99', undefined, 404);
  const r = await api.falha('POST', '/idiomas', { codigo: 'english', mensalidade: -5 }, 422);
  assert.equal(r.detalhes!.length, 3);
  await api.ok('POST', '/idiomas', { nome: 'Inglês', codigo: 'en', mensalidade: 300 });
  const dup = await api.falha('POST', '/idiomas', { nome: 'inglês', codigo: 'en', mensalidade: 300 }, 422);
  assert.equal(dup.detalhes!.length, 2);
  await api.falha('POST', '/idiomas', 'texto', 422);
});

test('não exclui idioma com professores ou turmas', async () => {
  const api = await criarApiTeste();
  const i = await api.ok('POST', '/idiomas', { nome: 'Inglês', codigo: 'en', mensalidade: 300 });
  await api.ok('POST', '/professores', { nome: 'P', idiomas: [i.id] });
  const r = await api.falha('DELETE', `/idiomas/${i.id}`, undefined, 422);
  assert.match(r.erro, /professor/);
});
