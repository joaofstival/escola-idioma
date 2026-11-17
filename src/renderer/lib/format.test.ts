import { test } from 'node:test';
import assert from 'node:assert/strict';
import { brl, dinheiro, taxa, cefr, data, nivel, ou, competencia } from './format.ts';

test('data converte aaaa-mm-dd sem deslocar por fuso e usa "—" para vazio', () => {
  assert.equal(data('2026-11-16'), '16/11/2026');
  assert.equal(data(null), '—');
  assert.equal(data('lixo'), '—');
});

test('brl formata em reais e nunca mostra NaN/null', () => {
  assert.equal(brl(1234.5).replace(/\s/g, ' '), 'R$ 1.234,50');
  assert.equal(brl(null), '—');
  assert.equal(brl(Number.NaN), '—');
});

test('ou troca vazio por "—"', () => {
  assert.equal(ou(''), '—');
  assert.equal(ou('  '), '—');
  assert.equal(ou(null), '—');
  assert.equal(ou(0), '0');
});

test('nível numérico mapeia para a faixa QECR', () => {
  assert.equal(cefr(1), 'A1');
  assert.equal(cefr(2), 'A1');
  assert.equal(cefr(3), 'A2');
  assert.equal(cefr(12), 'C2');
  assert.equal(nivel(3), 'Nível 3 (A2)');
});

test('competência aaaa-mm vira mm/aaaa', () => {
  assert.equal(competencia('2026-03'), '03/2026');
  assert.equal(competencia(undefined), '—');
});

test('dinheiro não arredonda para R$ 0,00 um valor entre 0 e 1 centavo', () => {
  assert.equal(dinheiro(0.0037).replace(/\s/g, ' '), 'R$ 0,0037');
  assert.equal(dinheiro(0.00003).replace(/\s/g, ' '), 'R$ 0,00003');
  assert.equal(dinheiro(0).replace(/\s/g, ' '), 'R$ 0,00');
  assert.equal(dinheiro(5.5).replace(/\s/g, ' '), 'R$ 5,50');
});

test('taxa mantém a precisão de moedas muito baixas', () => {
  assert.equal(taxa(0.00069), '0,00069'); // antes: "0,0007" (1,4% de erro)
  assert.equal(taxa(5.7833), '5,7833');
  assert.equal(taxa(1450.5), '1.450,50');
});
