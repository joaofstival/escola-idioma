import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularResultados, celulaCsv, gerarCsv, montarAnswers, nomeArquivoCsv, validarForm, validarRespostas } from './avaliacao.ts';
import { MODELOS_AVALIACAO } from '../data/modelos-avaliacao.ts';
import type { EvaluationForm, Question } from '../../shared/types.ts';

const ops = (n: number, pontos = false) =>
  Array.from({ length: n }, (_, i) => ({ id: `o${i + 1}`, label: `Opção ${i + 1}`, ...(pontos ? { points: 10 - i * 2.5 } : {}) }));
const aberta = (id = 'q1', extra: Partial<Question> = {}) => ({ id, type: 'open', title: `Pergunta ${id}`, required: true, ...extra });
const erros = (questions: unknown[]) => validarForm({ questions }).detalhes;
const temErro = (questions: unknown[], re: RegExp) =>
  assert.ok(
    erros(questions).some((d) => re.test(d)),
    `esperava ${re}, veio ${JSON.stringify(erros(questions))}`,
  );

test('form: de 1 a 20 perguntas e pelo menos 1 obrigatória', () => {
  assert.deepEqual(erros([aberta()]), []);
  temErro([], /pelo menos 1 pergunta/);
  temErro(
    Array.from({ length: 21 }, (_, i) => aberta(`q${i}`)),
    /no máximo 20/,
  );
  assert.deepEqual(erros(Array.from({ length: 20 }, (_, i) => aberta(`q${i}`))), []);
  temErro([aberta('q1', { required: false })], /Pelo menos 1 pergunta deve ser obrigatória/);
  assert.match(validarForm(null).detalhes[0], /questions/);
  assert.match(validarForm('{x').detalhes[0], /JSON/);
  assert.deepEqual(validarForm(JSON.stringify({ questions: [aberta()] })).detalhes, [], 'aceita JSON em texto');
});

test('form: ids únicos, tipo, título e campos básicos', () => {
  temErro([aberta('q1'), aberta('q1')], /id "q1" repetido/);
  temErro([aberta('')], /id é obrigatório/);
  temErro([{ ...aberta(), type: 'escala' }], /tipo deve ser/);
  temErro([{ ...aberta(), title: '  ' }], /título é obrigatório/);
  temErro(
    [
      {
        id: 's',
        type: 'single',
        title: 'S',
        required: true,
        options: [
          { id: 'a', label: 'A' },
          { id: 'a', label: 'B' },
        ],
      },
    ],
    /opção "a" repetido/,
  );
  temErro(
    [
      {
        id: 'g',
        type: 'grid',
        title: 'G',
        required: true,
        options: ops(2),
        rows: [
          { id: 'r', label: 'R' },
          { id: 'r', label: 'R2' },
        ],
      },
    ],
    /linha "r" repetido/,
  );
  temErro(
    [
      {
        id: 's',
        type: 'single',
        title: 'S',
        required: true,
        options: [
          { id: 'a', label: '' },
          { id: 'b', label: 'B' },
        ],
      },
    ],
    /texto é obrigatório/,
  );
});

test('form: de 2 a 10 opções (single/multiple/grid) e de 1 a 10 linhas na grade', () => {
  for (const type of ['single', 'multiple', 'grid']) {
    const base = { id: 'x', type, title: 'X', required: true, rows: [{ id: 'r1', label: 'R1' }] };
    temErro([{ ...base, options: ops(1) }], /de 2 a 10 opções/);
    temErro([{ ...base, options: ops(11) }], /de 2 a 10 opções/);
    temErro([{ ...base }], /opções são obrigatórias/);
    assert.deepEqual(erros([{ ...base, options: ops(10) }]), []);
  }
  const g = { id: 'g', type: 'grid', title: 'G', required: true, options: ops(3) };
  temErro([{ ...g, rows: [] }], /de 1 a 10 linhas/);
  temErro([{ ...g, rows: Array.from({ length: 11 }, (_, i) => ({ id: `r${i}`, label: `R${i}` })) }], /de 1 a 10 linhas/);
  temErro([g], /precisa de linhas/);
});

test('form: escala válida (1–5, 1–10, 0–10)', () => {
  const r = (scale: unknown) => [{ id: 'r', type: 'rating', title: 'R', required: true, scale }];
  for (const [min, max] of [
    [1, 5],
    [1, 10],
    [0, 10],
  ])
    assert.deepEqual(erros(r({ style: 'stars', min, max })), []);
  for (const [min, max] of [
    [0, 5],
    [2, 10],
    [1, 7],
    [1, 1],
  ])
    temErro(r({ style: 'numbers', min, max }), /escala inválida/);
  temErro(r(undefined), /escala é obrigatória/);
  temErro(r({ style: 'emoji', min: 1, max: 5 }), /estilo/);
});

test('form: countsInScore só em single/rating/grid; askReason só em single/rating; maxChoices de 1 ao nº de opções', () => {
  temErro([aberta('q1', { countsInScore: true })], /conta na nota/);
  temErro([{ id: 'm', type: 'multiple', title: 'M', required: true, options: ops(3), countsInScore: true }], /conta na nota/);
  temErro([aberta('q1', { askReason: true })], /pedir o porquê/);
  temErro(
    [{ id: 'g', type: 'grid', title: 'G', required: true, options: ops(2), rows: [{ id: 'r', label: 'R' }], askReason: true }],
    /pedir o porquê/,
  );
  const m = (maxChoices: unknown) => [{ id: 'm', type: 'multiple', title: 'M', required: true, options: ops(3), maxChoices }];
  temErro(m(0), /maxChoices/);
  temErro(m(4), /maxChoices/);
  temErro(m(1.5), /maxChoices/);
  assert.deepEqual(erros(m(3)), []);
  assert.deepEqual(erros(m(null)), []);
  // Conta na nota exige pontos nas opções; reasonOn só com opções existentes; "other" é reservado.
  temErro([{ id: 's', type: 'single', title: 'S', required: true, countsInScore: true, options: ops(2) }], /informe os pontos/);
  temErro([{ id: 's', type: 'single', title: 'S', required: true, askReason: true, reasonOn: ['zz'], options: ops(2) }], /reasonOn/);
  temErro(
    [
      {
        id: 'm',
        type: 'multiple',
        title: 'M',
        required: true,
        options: [
          { id: 'other', label: 'O' },
          { id: 'a', label: 'A' },
        ],
      },
    ],
    /reservado/,
  );
  temErro([aberta('q1', { maxChars: 0 })], /limite de caracteres/);
});

test('form: normaliza (descarta campos que não se aplicam) e todos os modelos prontos são válidos', () => {
  const { form } = validarForm({ questions: [{ ...aberta(), options: ops(2), scale: { min: 1, max: 5 }, extra: 1 }] });
  assert.deepEqual(form.questions[0], { id: 'q1', type: 'open', title: 'Pergunta q1', required: true, length: 'short', maxChars: null });
  assert.ok(MODELOS_AVALIACAO.length >= 4);
  for (const m of MODELOS_AVALIACAO) assert.deepEqual(validarForm(m.form).detalhes, [], m.id);
  const nivel = MODELOS_AVALIACAO.find((m) => m.id === 'nivel')!;
  const grade = nivel.form.questions[0];
  assert.deepEqual(
    grade.rows!.map((r) => r.label),
    ['Compreensão oral', 'Expressão oral', 'Leitura', 'Escrita', 'Gramática', 'Vocabulário'],
  );
  assert.deepEqual(
    grade.options!.map((o) => [o.label, o.points]),
    [
      ['Excelente', 10],
      ['Bom', 7.5],
      ['Regular', 5],
      ['Precisa melhorar', 2.5],
    ],
  );
});

// Formulário com todos os tipos para os testes de respostas.
const FORM: EvaluationForm = validarForm({
  questions: [
    {
      id: 'nota',
      type: 'rating',
      title: 'Nota',
      required: true,
      countsInScore: true,
      askReason: true,
      reasonOnMax: 2,
      scale: { style: 'stars', min: 1, max: 5 },
    },
    {
      id: 'nivel',
      type: 'single',
      title: 'Nível',
      required: true,
      countsInScore: true,
      askReason: true,
      reasonOn: ['ruim'],
      options: [
        { id: 'bom', label: 'Bom', points: 10 },
        { id: 'ruim', label: 'Ruim; "fraco"', points: 0 },
      ],
    },
    { id: 'temas', type: 'multiple', title: 'Temas', required: false, maxChoices: 2, allowOther: true, options: ops(3) },
    {
      id: 'grade',
      type: 'grid',
      title: 'Grade',
      required: true,
      countsInScore: true,
      options: ops(4, true),
      rows: [
        { id: 'r1', label: 'Fala' },
        { id: 'r2', label: 'Escrita' },
      ],
    },
    { id: 'texto', type: 'open', title: 'Comentário', required: false, maxChars: 10 },
    { id: 'zero', type: 'rating', title: 'Zero a dez', required: false, scale: { style: 'numbers', min: 0, max: 10 } },
  ],
}).form;

const validas = () => [
  { question_id: 'nota', value_number: 4 },
  { question_id: 'nivel', option_id: 'bom', reason: 'ignorado' },
  { question_id: 'temas', option_ids: ['o1', 'other'], value_text: 'Música' },
  { question_id: 'grade', row_id: 'r1', option_id: 'o1' },
  { question_id: 'grade', row_id: 'r2', option_id: 'o3' },
  { question_id: 'texto', value_text: 'ok' },
];
const errosResp = (answers: unknown) => validarRespostas(FORM, answers).detalhes;
const comTroca = (qid: string, nova: Record<string, unknown> | null) => {
  const l = validas().filter((a) => a.question_id !== qid);
  return nova ? [...l, { question_id: qid, ...nova }] : l;
};

test('respostas válidas: itens (uma linha por valor), porquê descartado quando não pedido e nota 0–10', () => {
  const r = validarRespostas(FORM, validas());
  assert.deepEqual(r.detalhes, []);
  // nota 4 em 1–5 → 7,5; single "bom" → 10; grade (10 + 5)/2 = 7,5 → média 8,33
  assert.equal(r.score, 8.33);
  assert.equal(r.itens.length, 7);
  assert.equal(r.itens.find((i) => i.question_id === 'nivel')!.reason, null, 'porquê não pedido é descartado');
  assert.deepEqual(
    r.itens.filter((i) => i.question_id === 'temas').map((i) => [i.option_id, i.value_text]),
    [
      ['o1', null],
      ['other', 'Música'],
    ],
  );
  assert.deepEqual(
    montarAnswers(FORM, r.itens).find((a) => a.question_id === 'temas'),
    { question_id: 'temas', option_ids: ['o1', 'other'], value_text: 'Música' },
  );
  assert.equal(montarAnswers(FORM, r.itens).filter((a) => a.question_id === 'grade').length, 2);
});

test('respostas: obrigatórias, opção existente, maxChoices, Outro, escala, maxChars, porquê e linhas da grade', () => {
  assert.match(errosResp(comTroca('nota', null)).join(), /"Nota": resposta obrigatória/);
  assert.match(errosResp(comTroca('nivel', { option_id: 'zz' })).join(), /opção "zz" não existe/);
  assert.match(errosResp(comTroca('temas', { option_ids: ['o1', 'o2', 'o3'] })).join(), /no máximo 2/);
  assert.match(errosResp(comTroca('temas', { option_ids: ['o9'] })).join(), /não existe/);
  assert.match(errosResp(comTroca('temas', { option_ids: ['other'] })).join(), /descreva a opção "Outro"/);
  assert.match(errosResp(comTroca('nota', { value_number: 6 })).join(), /de 1 a 5/);
  assert.match(errosResp(comTroca('nota', { value_number: 0 })).join(), /de 1 a 5/);
  assert.match(errosResp(comTroca('nota', { value_number: 3.5 })).join(), /inteiro/);
  assert.deepEqual(errosResp(comTroca('zero', { value_number: 0 })), [], '0 vale na escala 0–10');
  assert.match(errosResp(comTroca('texto', { value_text: 'texto longo demais' })).join(), /no máximo 10 caracteres/);
  // Porquê obrigatório quando pedido em pergunta obrigatória: nota <= 2 e opção "ruim".
  assert.match(errosResp(comTroca('nota', { value_number: 2 })).join(), /"Nota": informe o porquê/);
  assert.deepEqual(errosResp(comTroca('nota', { value_number: 2, reason: 'Aulas cansativas' })), []);
  assert.match(errosResp(comTroca('nivel', { option_id: 'ruim' })).join(), /"Nível": informe o porquê/);
  const comPorque = validarRespostas(FORM, comTroca('nivel', { option_id: 'ruim', reason: 'Pouca prática' }));
  assert.equal(comPorque.itens.find((i) => i.question_id === 'nivel')!.reason, 'Pouca prática');
  // Grade obrigatória: todas as linhas; linha inexistente; linha repetida.
  const semGrade = validas().filter((a) => a.question_id !== 'grade');
  assert.match(errosResp([...semGrade, { question_id: 'grade', row_id: 'r1', option_id: 'o1' }]).join(), /faltam: Escrita/);
  assert.match(errosResp([...validas(), { question_id: 'grade', row_id: 'r9', option_id: 'o1' }]).join(), /linha "r9" não existe/);
  assert.match(errosResp([...validas(), { question_id: 'grade', row_id: 'r1', option_id: 'o2' }]).join(), /mais de uma vez/);
  assert.match(errosResp([...validas(), { question_id: 'nota', value_number: 3 }]).join(), /mais de uma vez/);
  assert.match(errosResp([...validas(), { question_id: 'qq', value_text: 'x' }]).join(), /"qq" não existe/);
  assert.match(errosResp('x').join(), /lista/);
});

test('nota: null quando nenhuma pergunta conta; normalização (v-min)/(max-min)*10', () => {
  const f = validarForm({
    questions: [aberta(), { id: 'r', type: 'rating', title: 'R', required: false, scale: { style: 'numbers', min: 0, max: 10 } }],
  }).form;
  assert.equal(
    validarRespostas(f, [
      { question_id: 'q1', value_text: 'oi' },
      { question_id: 'r', value_number: 7 },
    ]).score,
    null,
  );
  const g = validarForm({
    questions: [{ id: 'r', type: 'rating', title: 'R', required: true, countsInScore: true, scale: { style: 'numbers', min: 1, max: 10 } }],
  }).form;
  assert.equal(validarRespostas(g, [{ question_id: 'r', value_number: 1 }]).score, 0);
  assert.equal(validarRespostas(g, [{ question_id: 'r', value_number: 10 }]).score, 10);
  assert.equal(validarRespostas(g, [{ question_id: 'r', value_number: 4 }]).score, 3.33);
});

test('resultados: contagem e % por opção, média e distribuição, linhas da grade, textos e com_porque', () => {
  const r1 = validarRespostas(FORM, validas());
  const r2 = validarRespostas(FORM, [
    { question_id: 'nota', value_number: 1, reason: 'Difícil' },
    { question_id: 'nivel', option_id: 'ruim', reason: 'Pouca prática' },
    { question_id: 'grade', row_id: 'r1', option_id: 'o4' },
    { question_id: 'grade', row_id: 'r2', option_id: 'o3' },
  ]);
  const res = calcularResultados(7, FORM, [
    { aluno_nome: 'Ana', criado_em: '2026-11-10 10:00:00', score: r1.score, itens: r1.itens },
    { aluno_nome: 'Bia', criado_em: '2026-11-11 10:00:00', score: r2.score, itens: r2.itens },
  ]);
  assert.equal(res.avaliacao_id, 7);
  assert.equal(res.total_respostas, 2);
  assert.equal(res.nota_media, (r1.score! + r2.score!) / 2);
  const p = Object.fromEntries(res.perguntas.map((q) => [q.question_id, q]));
  assert.equal(p.nota.media, 2.5);
  assert.deepEqual(p.nota.distribuicao, [
    { valor: 1, count: 1 },
    { valor: 2, count: 0 },
    { valor: 3, count: 0 },
    { valor: 4, count: 1 },
    { valor: 5, count: 0 },
  ]);
  assert.equal(p.nota.com_porque, 1);
  assert.deepEqual(p.nota.textos, [{ aluno_nome: 'Bia', texto: 'Difícil' }]);
  assert.deepEqual(
    p.nivel.opcoes!.map((o) => [o.option_id, o.count, o.percent]),
    [
      ['bom', 1, 50],
      ['ruim', 1, 50],
    ],
  );
  assert.equal(p.temas.respostas, 1);
  assert.deepEqual(
    p.temas.opcoes!.map((o) => [o.option_id, o.count, o.percent]),
    [
      ['o1', 1, 100],
      ['o2', 0, 0],
      ['o3', 0, 0],
      ['other', 1, 100],
    ],
  );
  assert.deepEqual(p.temas.textos, [{ aluno_nome: 'Ana', texto: 'Música' }]);
  assert.deepEqual(
    p.grade.linhas!.map((l) => [l.label, l.opcoes.map((o) => o.count), l.media]),
    [
      ['Fala', [1, 0, 0, 1], 6.25],
      ['Escrita', [0, 0, 2, 0], 5],
    ],
  );
  assert.deepEqual(p.texto.textos, [{ aluno_nome: 'Ana', texto: 'ok' }]);
  assert.equal(p.zero.respostas, 0);
  assert.equal(calcularResultados(1, FORM, []).nota_media, null);
});

test('CSV: separador ;, escape correto, uma coluna por pergunta, por linha da grade e por porquê', () => {
  assert.equal(celulaCsv('simples'), 'simples');
  assert.equal(celulaCsv('a;b'), '"a;b"');
  assert.equal(celulaCsv('diz "oi"'), '"diz ""oi"""');
  assert.equal(celulaCsv('linha1\nlinha2'), '"linha1\nlinha2"');
  assert.equal(celulaCsv('=1+1'), "'=1+1", 'evita fórmula');
  assert.equal(celulaCsv(8.33), '8,33');
  assert.equal(celulaCsv(null), '');

  const r = validarRespostas(FORM, comTroca('nivel', { option_id: 'ruim', reason: 'Falta; "prática"' }));
  const csv = gerarCsv(FORM, [{ aluno_nome: 'Ana Souza', criado_em: '2026-11-10 14:30:00', score: r.score, itens: r.itens }]);
  const [cab, linha, fim] = csv.split('\r\n');
  assert.equal(fim, '');
  assert.equal(cab, 'Aluno;Data;Nota;Nota;Nota (porquê);Nível;Nível (porquê);Temas;Grade - Fala;Grade - Escrita;Comentário;Zero a dez');
  assert.equal(
    linha,
    `Ana Souza;10/11/2026 14:30;${String(r.score).replace('.', ',')};4;;"Ruim; ""fraco""";"Falta; ""prática""";Opção 1, Outro: Música;Opção 1;Opção 3;ok;`,
  );
  assert.equal(nomeArquivoCsv(3, 'Avaliação de nível: Inglês 1!'), 'avaliacao-3-avaliacao-de-nivel-ingles-1.csv');
});
