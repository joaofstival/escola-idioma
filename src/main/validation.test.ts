import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Validador, dataIsoValida, parseId, queryBool, queryInt } from './validation.ts';
import { ValidationError, NotFoundError } from './router.ts';

test('Validador acumula todos os problemas num único 422', () => {
  const v = new Validador({ email: 'x@', nivel: 13, valor: '-1', data: '2026-02-30', tipo: 'z' });
  v.texto('nome', { obrigatorio: true });
  v.email('email');
  v.inteiro('nivel', { min: 1, max: 12 });
  v.numero('valor', { min: 0 });
  v.data('data');
  v.enumeracao('tipo', ['a', 'b'] as const);
  assert.throws(() => v.verificar(), (e: unknown) => e instanceof ValidationError && e.status === 422 && e.detalhes!.length === 6);
});

test('conversões: número com vírgula, boolean em texto, e-mail em minúsculas', () => {
  const v = new Validador({ valor: '12,5', ativo: 'false', email: 'A@B.COM', ids: [1, '2', { id: 2 }] });
  assert.equal(v.numero('valor'), 12.5);
  assert.equal(v.booleano('ativo'), false);
  assert.equal(v.email('email'), 'a@b.com');
  assert.deepEqual(v.listaIds('ids'), [1, 2]);
  assert.ok(v.valido);
});

test('datas, ids e filtros', () => {
  assert.ok(dataIsoValida('2024-02-29'));
  assert.ok(!dataIsoValida('2023-02-29'));
  assert.equal(parseId('15'), 15);
  assert.throws(() => parseId('abc'), NotFoundError);
  assert.equal(queryInt({ ano: '2026' }, 'ano'), 2026);
  assert.equal(queryInt({}, 'ano'), undefined);
  assert.throws(() => queryInt({ ano: 'x' }, 'ano'), ValidationError);
  assert.equal(queryBool({ ativo: '1' }, 'ativo'), true);
  assert.throws(() => queryBool({ ativo: 'talvez' }, 'ativo'), ValidationError);
});
