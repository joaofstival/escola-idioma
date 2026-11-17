import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarApiTeste, criarBase } from '../test-helpers.ts';

test('CRUD de professores com idiomas', async () => {
  const api = await criarApiTeste();
  const { ingles, espanhol } = await criarBase(api);
  const p = await api.ok('POST', '/professores', { nome: 'Carlos', email: 'carlos@escola.com', idiomas: [espanhol.id, ingles.id] }, 201);
  assert.deepEqual(p.idiomas, [
    { id: espanhol.id, nome: 'Espanhol' },
    { id: ingles.id, nome: 'Inglês' },
  ]);
  assert.equal(p.ativo, true);
  const upd = await api.ok('PUT', `/professores/${p.id}`, { idiomas: [espanhol.id], telefone: '123' });
  assert.deepEqual(upd.idiomas, [{ id: espanhol.id, nome: 'Espanhol' }]);
  assert.equal(upd.email, 'carlos@escola.com');
  const semMudar = await api.ok('PUT', `/professores/${p.id}`, { nome: 'Carlos Alberto' });
  assert.deepEqual(semMudar.idiomas, [{ id: espanhol.id, nome: 'Espanhol' }], 'PUT sem idiomas mantém habilitações');
  const lista = await api.ok('GET', '/professores');
  assert.equal(lista.length, 2);
  assert.ok(lista.every((x: any) => Array.isArray(x.idiomas)));
  await api.ok('DELETE', `/professores/${p.id}`);
  await api.falha('GET', `/professores/${p.id}`, undefined, 404);
  assert.equal(api.db.get<{ n: number }>('SELECT count(*) AS n FROM professor_idiomas WHERE professor_id = ?', [p.id])!.n, 0);
});

test('professores: filtros idioma_id e ativo', async () => {
  const api = await criarApiTeste();
  const { ingles, espanhol } = await criarBase(api);
  await api.ok('POST', '/professores', { nome: 'Bia', idiomas: [espanhol.id], ativo: false });
  assert.deepEqual(
    (await api.ok('GET', `/professores?idioma_id=${espanhol.id}`)).map((p: any) => p.nome),
    ['Bia'],
  );
  assert.deepEqual(
    (await api.ok('GET', `/professores?idioma_id=${ingles.id}`)).map((p: any) => p.nome),
    ['Ana Prof'],
  );
  assert.deepEqual(
    (await api.ok('GET', '/professores?ativo=false')).map((p: any) => p.nome),
    ['Bia'],
  );
});

test('professores: validações 422 e 404', async () => {
  const api = await criarApiTeste();
  const r = await api.falha('POST', '/professores', { nome: 'X', email: 'x@', idiomas: [999] }, 422);
  assert.equal(r.detalhes!.length, 2);
  await api.falha('POST', '/professores', { nome: 'X', idiomas: 'en' }, 422);
  await api.falha('GET', '/professores/5', undefined, 404);
  await api.falha('DELETE', '/professores/5', undefined, 404);
});

test('professor alocado em turma: não exclui nem remove habilitação do idioma', async () => {
  const api = await criarApiTeste();
  const { ingles, espanhol, prof } = await criarBase(api);
  await api.ok('POST', '/turmas', {
    nome: 'Inglês 1',
    idioma_id: ingles.id,
    nivel: 1,
    ano_letivo: 2026,
    professor_id: prof.id,
    capacidade: 10,
  });
  const del = await api.falha('DELETE', `/professores/${prof.id}`, undefined, 422);
  assert.match(del.erro, /inative/);
  const rem = await api.falha('PUT', `/professores/${prof.id}`, { idiomas: [espanhol.id] }, 422);
  assert.match(rem.detalhes![0], /Inglês/);
  await api.ok('PUT', `/professores/${prof.id}`, { ativo: false });
});
