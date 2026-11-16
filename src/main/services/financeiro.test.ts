import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularEncargos, definirHoje, diasEntre, estaAtrasada, gerarParcelas, hoje, somarDias } from './financeiro.ts';

test('datas: diasEntre e somarDias (inclusive virada de mês e ano bissexto)', () => {
  assert.equal(diasEntre('2026-01-10', '2026-02-09'), 30);
  assert.equal(diasEntre('2026-03-10', '2026-03-01'), -9);
  assert.equal(somarDias('2024-02-27', 3), '2024-03-01');
  assert.equal(somarDias('2026-12-30', 5), '2027-01-04');
});

test('atraso: pendente com vencimento antes de hoje; pagar no dia do vencimento não é atraso', () => {
  assert.equal(estaAtrasada({ status: 'pendente', vencimento: '2026-06-10' }, '2026-06-10'), false);
  assert.equal(estaAtrasada({ status: 'pendente', vencimento: '2026-06-10' }, '2026-06-11'), true);
  assert.equal(estaAtrasada({ status: 'paga', vencimento: '2026-01-10' }, '2026-06-11'), false);
  assert.equal(estaAtrasada({ status: 'cancelada', vencimento: '2026-01-10' }, '2026-06-11'), false);
});

test('multa de 2% e juros de 1% a.m. pro rata die', () => {
  const emDia = calcularEncargos({ status: 'pendente', vencimento: '2026-06-10', valor: 300 }, '2026-06-10');
  assert.deepEqual(emDia, { atrasada: false, dias_atraso: 0, multa: 0, juros: 0, valor_atualizado: 300 });

  const trinta = calcularEncargos({ status: 'pendente', vencimento: '2026-06-10', valor: 300 }, '2026-07-10');
  assert.deepEqual(trinta, { atrasada: true, dias_atraso: 30, multa: 6, juros: 3, valor_atualizado: 309 });

  const quinze = calcularEncargos({ status: 'pendente', vencimento: '2026-06-10', valor: 290 }, '2026-06-25');
  assert.equal(quinze.multa, 5.8);
  assert.equal(quinze.juros, 1.45);
  assert.equal(quinze.valor_atualizado, 297.25);

  const umDia = calcularEncargos({ status: 'pendente', vencimento: '2026-06-10', valor: 320 }, '2026-06-11');
  assert.equal(umDia.juros, 0.11); // 320 × 1% / 30
  assert.equal(umDia.valor_atualizado, 326.51);

  const paga = calcularEncargos({ status: 'paga', vencimento: '2026-01-10', valor: 300 }, '2026-07-10');
  assert.equal(paga.valor_atualizado, 300);
  assert.equal(paga.atrasada, false);
});

test('parcelas: do mês da matrícula até dezembro, dia 10, valor do idioma', () => {
  const p = gerarParcelas(2026, 320, '2026-03-05');
  assert.equal(p.length, 10);
  assert.deepEqual(p[0], { competencia: '2026-03', vencimento: '2026-03-10', valor: 320 });
  assert.deepEqual(p.at(-1), { competencia: '2026-12', vencimento: '2026-12-10', valor: 320 });

  assert.equal(gerarParcelas(2026, 300, '2026-01-02').length, 12);
  assert.equal(gerarParcelas(2026, 300, '2026-12-01').length, 1);

  // Depois do dia 10: a 1ª parcela vence 5 dias após a matrícula (não nasce atrasada).
  const tarde = gerarParcelas(2026, 300, '2026-08-20');
  assert.equal(tarde.length, 5);
  assert.deepEqual(tarde[0], { competencia: '2026-08', vencimento: '2026-08-25', valor: 300 });
  assert.equal(tarde[1].vencimento, '2026-09-10');

  // Rematrícula antecipada (ano seguinte): janeiro a dezembro.
  const prox = gerarParcelas(2027, 300, '2026-11-16');
  assert.equal(prox.length, 12);
  assert.equal(prox[0].vencimento, '2027-01-10');

  assert.throws(() => gerarParcelas(2025, 300, '2026-01-01'), RangeError);
});

test('relógio injetável', () => {
  definirHoje('2030-05-05');
  assert.equal(hoje(), '2030-05-05');
  definirHoje(() => '2031-01-01');
  assert.equal(hoje(), '2031-01-01');
  definirHoje(null);
  assert.match(hoje(), /^\d{4}-\d{2}-\d{2}$/);
});
