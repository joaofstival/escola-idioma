import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarApiTeste, criarBase } from '../test-helpers.ts';

test('CRUD de materiais com filtros e validações', async () => {
  const api = await criarApiTeste();
  const { ingles, espanhol } = await criarBase(api);
  const m = await api.ok(
    'POST',
    '/materiais',
    { titulo: 'English File Beginner', tipo: 'livro', idioma_id: ingles.id, nivel: 1, autor: 'Oxenden' },
    201,
  );
  assert.equal(m.idioma_nome, 'Inglês');
  assert.equal(m.referencia, null);
  await api.ok('POST', '/materiais', {
    titulo: 'Podcast básico',
    tipo: 'audio',
    idioma_id: ingles.id,
    nivel: 2,
    descricao: 'Exercícios de áudio',
  });
  await api.ok('POST', '/materiais', { titulo: 'Gramática', tipo: 'apostila', idioma_id: espanhol.id, nivel: 1 });
  await api.ok('POST', '/materiais', { titulo: 'Site', tipo: 'link', idioma_id: espanhol.id, nivel: 3, referencia: 'https://rae.es' });

  assert.equal((await api.ok('GET', '/materiais')).length, 4);
  assert.deepEqual(
    (await api.ok('GET', `/materiais?idioma_id=${ingles.id}`)).map((x: any) => x.titulo),
    ['English File Beginner', 'Podcast básico'],
  );
  assert.deepEqual(
    (await api.ok('GET', '/materiais?nivel=1')).map((x: any) => x.titulo),
    ['Gramática', 'English File Beginner'],
  );
  assert.deepEqual(
    (await api.ok('GET', '/materiais?tipo=audio')).map((x: any) => x.titulo),
    ['Podcast básico'],
  );
  assert.deepEqual(
    (await api.ok('GET', '/materiais?busca=GRAMATICA')).map((x: any) => x.titulo),
    ['Gramática'],
    'sem acento',
  );
  assert.deepEqual(
    (await api.ok('GET', '/materiais?busca=audio')).map((x: any) => x.titulo),
    ['Podcast básico'],
    'busca na descrição',
  );
  assert.deepEqual(
    (await api.ok('GET', '/materiais?busca=oxenden')).map((x: any) => x.titulo),
    ['English File Beginner'],
    'busca no autor',
  );
  await api.falha('GET', '/materiais?tipo=revista', undefined, 422);
  await api.falha('GET', '/materiais?nivel=13', undefined, 422);

  const u = await api.ok('PUT', `/materiais/${m.id}`, { nivel: 2 });
  assert.equal(u.nivel, 2);
  assert.equal(u.titulo, 'English File Beginner');
  assert.equal((await api.ok('GET', `/materiais/${m.id}`)).nivel, 2);

  const ok = { titulo: 'X', tipo: 'livro', idioma_id: ingles.id, nivel: 1 };
  assert.match((await api.falha('POST', '/materiais', { ...ok, tipo: 'revista' }, 422)).detalhes!.join(), /tipo deve ser um destes/);
  for (const nivel of [0, 13, 2.5, 'x'])
    assert.match((await api.falha('POST', '/materiais', { ...ok, nivel }, 422)).detalhes!.join(), /nível/);
  assert.match((await api.falha('POST', '/materiais', { ...ok, idioma_id: 99 }, 422)).detalhes!.join(), /Idioma 99/);
  assert.match((await api.falha('POST', '/materiais', { ...ok, tipo: 'link', referencia: 'rae.es' }, 422)).detalhes!.join(), /http/);
  assert.equal((await api.falha('POST', '/materiais', {}, 422)).detalhes!.length, 4);

  // O idioma com material não pode ser excluído (regra da parte 2).
  await api.falha('DELETE', `/idiomas/${espanhol.id}`, undefined, 422);
  assert.deepEqual(await api.ok('DELETE', `/materiais/${m.id}`), { ok: true });
  await api.falha('GET', `/materiais/${m.id}`, undefined, 404);
  await api.falha('DELETE', `/materiais/${m.id}`, undefined, 404);
});

test('GET /turmas/:id/materiais devolve os materiais do mesmo idioma e nível', async () => {
  const api = await criarApiTeste();
  const { ingles, espanhol } = await criarBase(api);
  const t = await api.ok('POST', '/turmas', { nome: 'EN2', idioma_id: ingles.id, nivel: 2, ano_letivo: 2026, capacidade: 10 });
  const novo = (titulo: string, idioma_id: number, nivel: number) =>
    api.ok('POST', '/materiais', { titulo, tipo: 'livro', idioma_id, nivel });
  await novo('EN2 livro', ingles.id, 2);
  await novo('EN2 apostila', ingles.id, 2);
  await novo('EN1 livro', ingles.id, 1);
  await novo('ES2 livro', espanhol.id, 2);
  assert.deepEqual(
    (await api.ok('GET', `/turmas/${t.id}/materiais`)).map((x: any) => x.titulo),
    ['EN2 apostila', 'EN2 livro'],
  );
  await api.falha('GET', '/turmas/999/materiais', undefined, 404);
});
