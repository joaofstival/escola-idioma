import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarApiTeste, criarBase } from '../test-helpers.ts';
import { MSG_TRAVADA } from '../services/avaliacao.ts';

const FORM = {
  questions: [
    { id: 'nota', type: 'rating', title: 'Nota geral', required: true, countsInScore: true, scale: { style: 'numbers', min: 1, max: 10 } },
    { id: 'coment', type: 'open', title: 'Comentário', required: false },
  ],
};

async function cenario() {
  const api = await criarApiTeste();
  const { ingles } = await criarBase(api);
  const turma = await api.ok('POST', '/turmas', { nome: 'EN1', idioma_id: ingles.id, nivel: 1, ano_letivo: 2026, capacidade: 10 });
  const outra = await api.ok('POST', '/turmas', { nome: 'EN2', idioma_id: ingles.id, nivel: 2, ano_letivo: 2026, capacidade: 10 });
  const alunos = [];
  for (const nome of ['Ana', 'Bruno', 'Carla']) {
    const a = await api.ok('POST', '/alunos', { nome });
    await api.ok('POST', '/matriculas', { aluno_id: a.id, turma_id: turma.id, data: '2026-02-01' });
    alunos.push(a);
  }
  return { api, turma, outra, alunos };
}

test('CRUD de avaliações, modelos prontos e criação a partir de modelo', async () => {
  const { api, turma, outra } = await cenario();
  const modelos = await api.ok('GET', '/avaliacoes/modelos');
  assert.deepEqual(
    modelos.map((m: any) => m.id),
    ['padrao', 'nivel', 'feedback', 'autoavaliacao'],
  );

  const a = await api.ok('POST', '/avaliacoes', { turma_id: turma.id, titulo: 'Avaliação 1', form: FORM }, 201);
  assert.equal(a.turma_nome, 'EN1');
  assert.equal(a.travada, false);
  assert.equal(a.total_respostas, 0);
  assert.equal(a.descricao, null);
  assert.equal(a.form.questions[1].length, 'short', 'form normalizado');
  const m = await api.ok('POST', '/avaliacoes', { turma_id: outra.id, titulo: 'Nível', modelo_id: 'nivel' }, 201);
  assert.equal(m.form.questions[0].type, 'grid');
  assert.equal(m.form.questions[0].rows.length, 6);

  assert.equal((await api.ok('GET', '/avaliacoes')).length, 2);
  assert.deepEqual(
    (await api.ok('GET', `/avaliacoes?turma_id=${turma.id}`)).map((x: any) => x.id),
    [a.id],
  );
  const u = await api.ok('PUT', `/avaliacoes/${a.id}`, { descricao: 'Fim de semestre', form: { questions: [FORM.questions[0]] } });
  assert.equal(u.descricao, 'Fim de semestre');
  assert.equal(u.form.questions.length, 1, 'sem respostas o form pode mudar');

  const v = await api.falha('POST', '/avaliacoes', { turma_id: 999, titulo: '', form: { questions: [] } }, 422);
  assert.ok(v.detalhes!.some((d) => /Turma 999/.test(d)));
  assert.ok(v.detalhes!.some((d) => /título/.test(d)));
  assert.ok(v.detalhes!.some((d) => /pelo menos 1 pergunta/.test(d)));
  await api.falha('POST', '/avaliacoes', { turma_id: turma.id, titulo: 'X' }, 422);
  await api.falha('POST', '/avaliacoes', { turma_id: turma.id, titulo: 'X', modelo_id: 'nao-existe' }, 422);
  await api.falha('GET', '/avaliacoes/999', undefined, 404);
  assert.deepEqual(await api.ok('DELETE', `/avaliacoes/${m.id}`), { ok: true });
  await api.falha('DELETE', `/turmas/${turma.id}`, undefined, 422);
});

test('respostas: matrícula ativa, uma por aluno, validação 422, itens gravados e nota', async () => {
  const {
    api,
    turma,
    alunos: [ana, bruno, carla],
  } = await cenario();
  const a = await api.ok('POST', '/avaliacoes', { turma_id: turma.id, titulo: 'Avaliação', form: FORM });
  const r = await api.ok(
    'POST',
    `/avaliacoes/${a.id}/respostas`,
    {
      aluno_id: ana.id,
      answers: [
        { question_id: 'nota', value_number: 10 },
        { question_id: 'coment', value_text: 'Ótimo' },
      ],
    },
    201,
  );
  assert.equal(r.aluno_nome, 'Ana');
  assert.equal(r.score, 10);
  assert.deepEqual(r.answers, [
    { question_id: 'nota', value_number: 10, reason: null },
    { question_id: 'coment', value_text: 'Ótimo' },
  ]);
  assert.equal(api.db.get<any>('SELECT count(*) AS n FROM avaliacao_resposta_itens').n, 2);

  assert.match(
    (
      await api.falha(
        'POST',
        `/avaliacoes/${a.id}/respostas`,
        { aluno_id: ana.id, answers: [{ question_id: 'nota', value_number: 5 }] },
        422,
      )
    ).erro,
    /já respondeu/,
  );
  const inv = await api.falha(
    'POST',
    `/avaliacoes/${a.id}/respostas`,
    { aluno_id: bruno.id, answers: [{ question_id: 'nota', value_number: 11 }] },
    422,
  );
  assert.equal(inv.erro, 'Respostas inválidas');
  assert.match(inv.detalhes![0], /de 1 a 10/);
  await api.falha('POST', `/avaliacoes/${a.id}/respostas`, { aluno_id: bruno.id, answers: [] }, 422);

  const fora = await api.ok('POST', '/alunos', { nome: 'Fora' });
  assert.match(
    (
      await api.falha(
        'POST',
        `/avaliacoes/${a.id}/respostas`,
        { aluno_id: fora.id, answers: [{ question_id: 'nota', value_number: 5 }] },
        422,
      )
    ).detalhes![0],
    /matrícula ativa/,
  );
  const mCarla = api.db.get<any>('SELECT id FROM matriculas WHERE aluno_id = ?', [carla.id]);
  await api.ok('PUT', `/matriculas/${mCarla.id}/cancelar`);
  await api.falha(
    'POST',
    `/avaliacoes/${a.id}/respostas`,
    { aluno_id: carla.id, answers: [{ question_id: 'nota', value_number: 5 }] },
    422,
  );
  await api.falha('POST', `/avaliacoes/${a.id}/respostas`, { answers: [] }, 422);
  await api.falha('POST', '/avaliacoes/999/respostas', { aluno_id: ana.id, answers: [] }, 404);

  await api.ok('POST', `/avaliacoes/${a.id}/respostas`, { aluno_id: bruno.id, answers: [{ question_id: 'nota', value_number: 4 }] });
  const lista = await api.ok('GET', `/avaliacoes/${a.id}/respostas`);
  assert.deepEqual(
    lista.map((x: any) => [x.aluno_nome, x.score]),
    [
      ['Ana', 10],
      ['Bruno', 3.33],
    ],
  );
});

test('trava após a 1ª resposta: form e turma não mudam (422), título/descrição sim; DELETE 422; duplicar libera', async () => {
  const {
    api,
    turma,
    outra,
    alunos: [ana],
  } = await cenario();
  const a = await api.ok('POST', '/avaliacoes', { turma_id: turma.id, titulo: 'Original', form: FORM });
  await api.ok('POST', `/avaliacoes/${a.id}/respostas`, { aluno_id: ana.id, answers: [{ question_id: 'nota', value_number: 8 }] });
  const travada = await api.ok('GET', `/avaliacoes/${a.id}`);
  assert.equal(travada.travada, true);
  assert.equal(travada.total_respostas, 1);

  const novoForm = { questions: [{ ...FORM.questions[0], title: 'Outra' }] };
  assert.equal((await api.falha('PUT', `/avaliacoes/${a.id}`, { form: novoForm }, 422)).erro, MSG_TRAVADA);
  assert.equal((await api.falha('PUT', `/avaliacoes/${a.id}`, { turma_id: outra.id }, 422)).erro, MSG_TRAVADA);
  const t = await api.ok('PUT', `/avaliacoes/${a.id}`, { titulo: 'Renomeada', descricao: 'Nova descrição', form: travada.form });
  assert.equal(t.titulo, 'Renomeada');
  assert.equal(t.descricao, 'Nova descrição');
  assert.match((await api.falha('DELETE', `/avaliacoes/${a.id}`, undefined, 422)).erro, /1 resposta/);

  const c = await api.ok('POST', `/avaliacoes/${a.id}/duplicar`, undefined, 201);
  assert.equal(c.titulo, 'Cópia de Renomeada');
  assert.equal(c.travada, false);
  assert.equal(c.total_respostas, 0);
  assert.deepEqual(c.form, travada.form);
  assert.equal((await api.ok('PUT', `/avaliacoes/${c.id}`, { form: novoForm })).form.questions[0].title, 'Outra');
  const c2 = await api.ok('POST', `/avaliacoes/${a.id}/duplicar`, { turma_id: outra.id });
  assert.equal(c2.turma_id, outra.id);
  await api.falha('POST', '/avaliacoes/999/duplicar', {}, 404);
});

test('resultados e exportação CSV com o modelo de nível (grade de competências)', async () => {
  const {
    api,
    turma,
    alunos: [ana, bruno],
  } = await cenario();
  const a = await api.ok('POST', '/avaliacoes', { turma_id: turma.id, titulo: 'Nível; 2026', modelo_id: 'nivel' });
  const competencias = a.form.questions[0].rows.map((r: any) => r.id);
  const resp = (nota: string, recomendacao: string, extra: any[] = []) => [
    ...competencias.map((row_id: string) => ({ question_id: 'competencias', row_id, option_id: nota })),
    { question_id: 'recomendacao', option_id: recomendacao, reason: 'Precisa revisar "past tense"' },
    ...extra,
  ];
  const r1 = await api.ok('POST', `/avaliacoes/${a.id}/respostas`, {
    aluno_id: ana.id,
    answers: resp('excelente', 'avancar', [{ question_id: 'observacoes', value_text: 'Ótima\naluna' }]),
  });
  assert.equal(r1.score, 10);
  assert.equal(r1.answers.find((x: any) => x.question_id === 'recomendacao').reason, null, 'porquê só quando pedido (repetir)');
  const r2 = await api.ok('POST', `/avaliacoes/${a.id}/respostas`, { aluno_id: bruno.id, answers: resp('regular', 'repetir') });
  assert.equal(r2.score, 5);
  const semPorque = resp('bom', 'repetir').map((x: any) => (x.question_id === 'recomendacao' ? { ...x, reason: '' } : x));
  const c = await api.ok('POST', '/alunos', { nome: 'Caio' });
  await api.ok('POST', '/matriculas', { aluno_id: c.id, turma_id: turma.id, data: '2026-02-01' });
  assert.match(
    (await api.falha('POST', `/avaliacoes/${a.id}/respostas`, { aluno_id: c.id, answers: semPorque }, 422)).detalhes!.join(),
    /porquê/,
  );

  const res = await api.ok('GET', `/avaliacoes/${a.id}/resultados`);
  assert.equal(res.total_respostas, 2);
  assert.equal(res.nota_media, 7.5);
  const grade = res.perguntas[0];
  assert.equal(grade.linhas.length, 6);
  assert.deepEqual(
    grade.linhas[0].opcoes.map((o: any) => [o.option_id, o.count, o.percent]),
    [
      ['excelente', 1, 50],
      ['bom', 0, 0],
      ['regular', 1, 50],
      ['precisa_melhorar', 0, 0],
    ],
  );
  assert.equal(grade.linhas[0].media, 7.5);
  const rec = res.perguntas[1];
  assert.equal(rec.com_porque, 1);
  assert.deepEqual(rec.textos, [{ aluno_nome: 'Bruno', texto: 'Precisa revisar "past tense"' }]);

  const exp = await api.ok('GET', `/avaliacoes/${a.id}/exportar`);
  assert.equal(exp.nome_arquivo, `avaliacao-${a.id}-nivel-2026.csv`);
  const linhas = exp.csv.split('\r\n');
  const cab = linhas[0].split(';');
  assert.deepEqual(cab.slice(0, 4), ['Aluno', 'Data', 'Nota', 'Desempenho por competência - Compreensão oral']);
  assert.equal(cab.length, 3 + 6 + 2 + 1, '6 linhas da grade + recomendação + porquê + observações');
  assert.ok(cab.includes('Recomendação para o próximo ano (porquê)'));
  assert.ok(linhas[1].startsWith('Ana;'));
  assert.ok(exp.csv.includes('"Ótima\naluna"'), 'quebra de linha entre aspas');
  assert.ok(exp.csv.includes('"Precisa revisar ""past tense"""'), 'aspas duplicadas');
  assert.ok(linhas[2].startsWith('Bruno;') && linhas[2].includes(';5;'));
  await api.falha('GET', '/avaliacoes/999/exportar', undefined, 404);
});
