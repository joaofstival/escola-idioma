import { test } from 'node:test';
import assert from 'node:assert/strict';
import { montarRespostas, mover, novaPergunta, pedePorque, validarFormulario, validarPreenchimento } from './avaliacao.ts';
import type { EvaluationForm } from '../../shared/types.ts';

test('mover reordena e ignora limites', () => {
  assert.deepEqual(mover(['a', 'b', 'c'], 0, 2), ['b', 'c', 'a']);
  assert.deepEqual(mover(['a', 'b'], 0, -1), ['a', 'b']);
  assert.deepEqual(mover(['a', 'b'], 1, 2), ['a', 'b']);
});

test('validarFormulario exige título, pergunta, uma obrigatória e pontos quando conta na nota', () => {
  const vazio = validarFormulario('', { questions: [] });
  assert.deepEqual(vazio.geral, ['Dê um título à avaliação.', 'Adicione pelo menos uma pergunta.']);
  const q = { ...novaPergunta('single'), title: 'Como foi?', countsInScore: true };
  q.options = [
    { id: 'a', label: 'Bom', points: null },
    { id: 'b', label: 'Ruim', points: 0 },
  ];
  const r = validarFormulario('Aval', { questions: [q] });
  assert.deepEqual(r.geral, ['Marque pelo menos uma pergunta como obrigatória.']);
  assert.match(r.porPergunta[q.id][0], /pontos/);
});

test('validarFormulario recusa opção vazia e grade sem itens preenchidos', () => {
  const g = { ...novaPergunta('grid'), title: 'Itens', required: true };
  const r = validarFormulario('Aval', { questions: [g] });
  assert.deepEqual(r.porPergunta[g.id], ['Preencha o texto de todos os itens da grade.']);
});

test('pedePorque segue reasonOn e reasonOnMax e só depois da resposta', () => {
  const s = { ...novaPergunta('single'), askReason: true, reasonOn: ['ruim'] };
  assert.equal(pedePorque(s, undefined), false);
  assert.equal(pedePorque(s, 'bom'), false);
  assert.equal(pedePorque(s, 'ruim'), true);
  const n = { ...novaPergunta('rating'), askReason: true, reasonOnMax: 3 };
  assert.equal(pedePorque(n, 4), false);
  assert.equal(pedePorque(n, 3), true);
});

test('validarPreenchimento: obrigatória sem resposta, porquê e limite de escolhas', () => {
  const form: EvaluationForm = {
    questions: [
      { id: 'q1', type: 'open', title: 'A', required: true },
      {
        id: 'q2',
        type: 'single',
        title: 'B',
        required: true,
        askReason: true,
        reasonOn: ['ruim'],
        options: [
          { id: 'bom', label: 'Bom' },
          { id: 'ruim', label: 'Ruim' },
        ],
      },
      {
        id: 'q3',
        type: 'multiple',
        title: 'C',
        required: false,
        maxChoices: 1,
        options: [
          { id: 'x', label: 'X' },
          { id: 'y', label: 'Y' },
        ],
      },
    ],
  };
  assert.deepEqual(Object.keys(validarPreenchimento(form, {})), ['q1', 'q2']);
  const e = validarPreenchimento(form, { q1: { texto: 'ok' }, q2: { opcao: 'ruim' }, q3: { opcoes: ['x', 'y'] } });
  assert.equal(e.q2, 'Conte o porquê da resposta.');
  assert.equal(e.q3, 'Escolha no máximo 1.');
  assert.deepEqual(validarPreenchimento(form, { q1: { texto: 'ok' }, q2: { opcao: 'bom' } }), {});
});

test('montarRespostas descarta o porquê que não foi pedido e inclui o texto de "Outro"', () => {
  const form: EvaluationForm = {
    questions: [
      {
        id: 'q2',
        type: 'single',
        title: 'B',
        required: true,
        askReason: true,
        reasonOn: ['ruim'],
        options: [
          { id: 'bom', label: 'Bom' },
          { id: 'ruim', label: 'Ruim' },
        ],
      },
      {
        id: 'q3',
        type: 'multiple',
        title: 'C',
        required: false,
        allowOther: true,
        options: [
          { id: 'x', label: 'X' },
          { id: 'y', label: 'Y' },
        ],
      },
    ],
  };
  const a = montarRespostas(form, { q2: { opcao: 'bom', porque: 'sobrou' }, q3: { opcoes: ['x', 'other'], texto: ' algo ' } });
  assert.deepEqual(a, [
    { question_id: 'q2', option_id: 'bom', reason: null },
    { question_id: 'q3', option_ids: ['x', 'other'], value_text: 'algo' },
  ]);
});
