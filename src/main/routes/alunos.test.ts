import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarApiTeste } from '../test-helpers.ts';

const base = { nome: 'Maria da Silva', email: 'maria@email.com', data_nascimento: '2000-05-10', documento: '111' };

test('CRUD de alunos com padrões (BRL, ativo)', async () => {
  const api = await criarApiTeste();
  const a = await api.ok('POST', '/alunos', base, 201);
  assert.equal(a.moeda_origem, 'BRL');
  assert.equal(a.ativo, true);
  assert.equal(a.pais_origem, null);
  assert.match(a.criado_em, /^\d{4}-\d{2}-\d{2} /);
  const est = await api.ok('POST', '/alunos', { nome: 'John Smith', pais_origem: 'Estados Unidos', moeda_origem: 'usd' });
  assert.equal(est.moeda_origem, 'USD');
  const upd = await api.ok('PUT', `/alunos/${a.id}`, { telefone: '(11) 9999-0000', ativo: false });
  assert.equal(upd.telefone, '(11) 9999-0000');
  assert.equal(upd.ativo, false);
  assert.equal(upd.email, 'maria@email.com');
  assert.equal((await api.ok('GET', `/alunos/${a.id}`)).ativo, false);
  await api.ok('DELETE', `/alunos/${est.id}`);
  await api.falha('GET', `/alunos/${est.id}`, undefined, 404);
});

test('alunos: filtros busca (sem acento) e ativo', async () => {
  const api = await criarApiTeste();
  await api.ok('POST', '/alunos', { nome: 'João Ávila', email: 'joao@x.com' });
  await api.ok('POST', '/alunos', { nome: 'Joana Lima', ativo: false });
  await api.ok('POST', '/alunos', { nome: 'Carlos', documento: '123.456', email: 'carlos@x.com' });
  assert.equal((await api.ok('GET', '/alunos')).length, 3);
  assert.deepEqual(
    (await api.ok('GET', '/alunos?busca=joao')).map((a: any) => a.nome),
    ['João Ávila'],
  );
  assert.deepEqual(
    (await api.ok('GET', '/alunos?busca=JO')).map((a: any) => a.nome),
    ['Joana Lima', 'João Ávila'],
  );
  assert.deepEqual(
    (await api.ok('GET', '/alunos?busca=123.4')).map((a: any) => a.nome),
    ['Carlos'],
  );
  assert.deepEqual(
    (await api.ok('GET', '/alunos?ativo=false')).map((a: any) => a.nome),
    ['Joana Lima'],
  );
  assert.equal((await api.ok('GET', '/alunos?ativo=true&busca=jo')).length, 1);
  await api.falha('GET', '/alunos?ativo=talvez', undefined, 422);
});

test('alunos: validações 422', async () => {
  const api = await criarApiTeste();
  const r = await api.falha('POST', '/alunos', { nome: '', email: 'invalido@', data_nascimento: '2099-01-01', moeda_origem: 'REAL' }, 422);
  assert.ok(r.detalhes!.some((d) => /e-mail inválido/.test(d)));
  assert.ok(r.detalhes!.some((d) => /nome é obrigatório/.test(d)));
  assert.ok(r.detalhes!.some((d) => /futura/.test(d)));
  assert.ok(r.detalhes!.some((d) => /moeda/.test(d)));
  await api.ok('POST', '/alunos', base);
  await api.falha('POST', '/alunos', { ...base, email: 'outra@x.com' }, 422); // documento duplicado
  await api.falha('PUT', '/alunos/1', { email: 'nao-e-email' }, 422);
  await api.falha('PUT', '/alunos/42', { nome: 'X' }, 404);
});

test('não exclui aluno com matrículas e sugere inativar', async () => {
  const api = await criarApiTeste();
  const a = await api.ok('POST', '/alunos', base);
  const i = api.db.run("INSERT INTO idiomas (nome, codigo, mensalidade) VALUES ('Inglês', 'en', 300)").lastInsertRowid;
  const t = api.db.run("INSERT INTO turmas (nome, idioma_id, nivel, ano_letivo, capacidade) VALUES ('T1', ?, 1, 2026, 10)", [
    i,
  ]).lastInsertRowid;
  api.db.run('INSERT INTO matriculas (aluno_id, turma_id, ano_letivo) VALUES (?, ?, 2026)', [a.id, t]);
  const r = await api.falha('DELETE', `/alunos/${a.id}`, undefined, 422);
  assert.match(r.erro, /inative/);
  assert.ok(await api.ok('GET', `/alunos/${a.id}`));
});
