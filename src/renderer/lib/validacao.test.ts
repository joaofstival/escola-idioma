import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paraNumero } from './validacao.ts';

test('paraNumero lê o formato pt-BR e recusa o ambíguo', () => {
  assert.equal(paraNumero('1.500'), 1500); // era 1,5 (R$ 1,50 salvo no lugar de R$ 1.500)
  assert.equal(paraNumero('1.500,50'), 1500.5);
  assert.equal(paraNumero('1500'), 1500);
  assert.equal(paraNumero('1,5'), 1.5);
  assert.equal(paraNumero('2026'), 2026);
  assert.equal(paraNumero('20'), 20);
  assert.ok(Number.isNaN(paraNumero('1,250.50')));
  assert.ok(Number.isNaN(paraNumero('')));
  assert.ok(Number.isNaN(paraNumero('abc')));
});
