import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encargosEm, escalaEixo, gerarCsv, hojeLocal, statusExibido } from './financeiro.ts';
import type { Mensalidade } from '../../shared/types.ts';

const base: Mensalidade = {
  id: 1,
  matricula_id: 1,
  aluno_id: 1,
  aluno_nome: 'Maria',
  idioma_nome: 'Inglês',
  turma_nome: 'T1',
  competencia: '2026-03',
  valor: 300,
  vencimento: '2026-03-10',
  status: 'pendente',
  atrasada: false,
  dias_atraso: 0,
  multa: 0,
  juros: 0,
  valor_atualizado: 300,
  data_pagamento: null,
  valor_pago: null,
  forma_pagamento: null,
};

test('encargosEm: até o vencimento não cobra multa nem juros', () => {
  assert.deepEqual(encargosEm(base, '2026-03-10'), { dias: 0, multa: 0, juros: 0, total: 300 });
  assert.deepEqual(encargosEm(base, '2026-03-01'), { dias: 0, multa: 0, juros: 0, total: 300 });
});

test('encargosEm: 30 dias de atraso = multa de 2% + 1% de juros', () => {
  assert.deepEqual(encargosEm(base, '2026-04-09'), { dias: 30, multa: 6, juros: 3, total: 309 });
});

test('encargosEm: 1 dia de atraso cobra a multa inteira e juros pro rata', () => {
  assert.deepEqual(encargosEm(base, '2026-03-11'), { dias: 1, multa: 6, juros: 0.1, total: 306.1 });
});

test('statusExibido separa pendente de atrasada e usa o texto "Em aberto"', () => {
  assert.equal(statusExibido(base), 'pendente');
  assert.equal(statusExibido({ ...base, atrasada: true }), 'atrasada');
  assert.equal(statusExibido({ ...base, status: 'paga' }), 'paga');
});

test('gerarCsv: separador ;, vírgula decimal e neutraliza fórmula do Excel', () => {
  const csv = gerarCsv([{ ...base, aluno_nome: '=CMD()', valor: 1234.5, valor_atualizado: 1234.5 }]);
  const [cab, linha] = csv.split('\r\n');
  assert.ok(cab.startsWith('Aluno;Idioma;Turma;Competência'));
  assert.ok(linha.startsWith("'=CMD();Inglês;T1;03/2026;10/03/2026;1234,50;Em aberto"));
});

test('escalaEixo: topo redondo cobre o máximo', () => {
  assert.deepEqual(escalaEixo(0), { topo: 0, passo: 0 });
  assert.deepEqual(escalaEixo(9300), { topo: 10000, passo: 2500 });
  assert.deepEqual(escalaEixo(100), { topo: 100, passo: 25 });
});

test('hojeLocal usa a data local, não UTC', () => {
  assert.equal(hojeLocal(new Date(2026, 10, 17, 23, 59)), '2026-11-17');
});
