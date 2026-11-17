import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarApiTeste, criarBase } from '../test-helpers.ts';

test('CRUD de turmas com idioma, professor, ocupação e alunos', async () => {
  const api = await criarApiTeste();
  const { ingles, prof } = await criarBase(api);
  const t = await api.ok(
    'POST',
    '/turmas',
    { nome: 'Inglês 1 - Manhã', idioma_id: ingles.id, nivel: 1, ano_letivo: 2026, professor_id: prof.id, horario: 'Seg 8h', capacidade: 2 },
    201,
  );
  assert.equal(t.idioma_nome, 'Inglês');
  assert.equal(t.professor_nome, 'Ana Prof');
  assert.equal(t.ocupacao, 0);
  assert.deepEqual(t.alunos, []);

  const a1 = await api.ok('POST', '/alunos', { nome: 'Zeca' });
  const a2 = await api.ok('POST', '/alunos', { nome: 'Alice' });
  const a3 = await api.ok('POST', '/alunos', { nome: 'Bruno' });
  api.db.run('INSERT INTO matriculas (aluno_id, turma_id, ano_letivo) VALUES (?, ?, 2026)', [a1.id, t.id]);
  api.db.run('INSERT INTO matriculas (aluno_id, turma_id, ano_letivo) VALUES (?, ?, 2026)', [a2.id, t.id]);
  api.db.run("INSERT INTO matriculas (aluno_id, turma_id, ano_letivo, status) VALUES (?, ?, 2026, 'cancelada')", [a3.id, t.id]);
  const det = await api.ok('GET', `/turmas/${t.id}`);
  assert.equal(det.ocupacao, 2, 'conta só matrículas ativas');
  assert.deepEqual(det.alunos, [
    { id: a2.id, nome: 'Alice' },
    { id: a1.id, nome: 'Zeca' },
  ]);

  const upd = await api.ok('PUT', `/turmas/${t.id}`, { horario: 'Ter 9h', nivel: 2 });
  assert.equal(upd.horario, 'Ter 9h');
  assert.equal(upd.nivel, 2);
  const cap = await api.falha('PUT', `/turmas/${t.id}`, { capacidade: 1 }, 422);
  assert.match(cap.detalhes![0], /ocupação/);
  await api.falha('PUT', `/turmas/${t.id}`, { ano_letivo: 2027 }, 422);
  const del = await api.falha('DELETE', `/turmas/${t.id}`, undefined, 422);
  assert.match(del.erro, /matrícula/);

  const vazia = await api.ok('POST', '/turmas', { nome: 'Sem prof', idioma_id: ingles.id, nivel: 1, ano_letivo: 2026, capacidade: 5 });
  assert.equal(vazia.professor_id, null);
  await api.ok('DELETE', `/turmas/${vazia.id}`);
  await api.falha('GET', `/turmas/${vazia.id}`, undefined, 404);
});

test('turmas: filtros ano, idioma_id e nivel', async () => {
  const api = await criarApiTeste();
  const { ingles, espanhol } = await criarBase(api);
  const nova = (nome: string, idioma_id: number, nivel: number, ano_letivo: number) =>
    api.ok('POST', '/turmas', { nome, idioma_id, nivel, ano_letivo, capacidade: 10 });
  await nova('EN1-25', ingles.id, 1, 2025);
  await nova('EN2-26', ingles.id, 2, 2026);
  await nova('EN1-26', ingles.id, 1, 2026);
  await nova('ES1-26', espanhol.id, 1, 2026);
  assert.equal((await api.ok('GET', '/turmas')).length, 4);
  assert.deepEqual(
    (await api.ok('GET', '/turmas?ano=2026')).map((t: any) => t.nome),
    ['ES1-26', 'EN1-26', 'EN2-26'],
  );
  assert.deepEqual(
    (await api.ok('GET', `/turmas?ano=2026&idioma_id=${ingles.id}&nivel=1`)).map((t: any) => t.nome),
    ['EN1-26'],
  );
  assert.deepEqual((await api.ok('GET', '/turmas?nivel=1&ano=')).map((t: any) => t.nome).sort(), ['EN1-25', 'EN1-26', 'ES1-26']);
  await api.falha('GET', '/turmas?nivel=13', undefined, 422);
  await api.falha('GET', '/turmas?ano=abc', undefined, 422);
});

test('turmas: validações 422 (professor não habilitado, nível fora da faixa, capacidade)', async () => {
  const api = await criarApiTeste();
  const { ingles, espanhol, prof } = await criarBase(api);
  const ok = { nome: 'T', idioma_id: ingles.id, nivel: 1, ano_letivo: 2026, capacidade: 10 };

  const naoHab = await api.falha('POST', '/turmas', { ...ok, idioma_id: espanhol.id, professor_id: prof.id }, 422);
  assert.match(naoHab.detalhes![0], /não está habilitado em Espanhol/);

  for (const nivel of [0, 13, 1.5, 'abc']) {
    const r = await api.falha('POST', '/turmas', { ...ok, nivel }, 422);
    assert.ok(
      r.detalhes!.some((d) => /nível/.test(d)),
      `nivel ${nivel}`,
    );
  }
  assert.ok((await api.falha('POST', '/turmas', { ...ok, capacidade: 0 }, 422)).detalhes!.some((d) => /capacidade/.test(d)));
  assert.ok((await api.falha('POST', '/turmas', { ...ok, idioma_id: 99 }, 422)).detalhes!.some((d) => /Idioma 99/.test(d)));
  assert.ok((await api.falha('POST', '/turmas', { ...ok, professor_id: 99 }, 422)).detalhes!.some((d) => /Professor 99/.test(d)));
  const vazio = await api.falha('POST', '/turmas', {}, 422);
  assert.equal(vazio.detalhes!.length, 5);

  const t = await api.ok('POST', '/turmas', { ...ok, professor_id: prof.id });
  await api.falha('POST', '/turmas', ok, 422); // mesmo nome no mesmo ano
  await api.ok('POST', '/turmas', { ...ok, ano_letivo: 2027 }); // outro ano pode
  const troca = await api.falha('PUT', `/turmas/${t.id}`, { idioma_id: espanhol.id }, 422);
  assert.match(troca.detalhes![0], /habilitado/);
  await api.ok('PUT', `/turmas/${t.id}`, { idioma_id: espanhol.id, professor_id: null });

  const inativo = await api.ok('POST', '/professores', { nome: 'Inativo', idiomas: [ingles.id], ativo: false });
  await api.falha('POST', '/turmas', { ...ok, nome: 'T2', professor_id: inativo.id }, 422);
  await api.falha('PUT', '/turmas/999', { nome: 'X' }, 404);
});
