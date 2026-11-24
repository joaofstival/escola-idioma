import { test } from 'node:test';
import assert from 'node:assert/strict';
import { brl, cefr, cotacaoEmBrl, data, nivel, ou, competencia } from './format.ts';

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

test('cotacaoEmBrl preserva taxas pequenas e trata entradas inválidas', () => {
  const f = (n: number | null | undefined) => cotacaoEmBrl(n).replace(/\s/g, ' ');
  assert.equal(f(5.86), 'R$ 5,86');
  assert.equal(f(1234.5), 'R$ 1.234,50');
  assert.equal(f(0.0037), 'R$ 0,0037');
  assert.equal(f(0.00073), 'R$ 0,00073');
  assert.equal(f(0.000001), 'R$ 0,000001');
  assert.equal(f(0.0000001), '< R$ 0,000001');
  assert.equal(f(0), 'R$ 0,00');
  for (const v of [null, undefined, Number.NaN, Infinity, -1]) assert.equal(f(v), '—');
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
