import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CalculadoraSaldo } from './saldo.ts';
test('juros incidem sobre o principal restante e estorno preserva o pagamento original', () => {
  const c = new CalculadoraSaldo();
  const m = { id: 1, valor_centavos: 30000, vencimento: '2026-01-10', multa_bp: 200, juros_bp: 100, status: 'pendente' };
  const pagamento = { id: 'p', tipo: 'pagamento', valor_centavos: 10000, data: '2026-01-10', estorno_de: null };
  assert.equal(c.calcular(m, [pagamento], '2026-02-09').saldo_centavos, 20600);
  const estorno = { id: 'e', tipo: 'estorno', valor_centavos: 10000, data: '2026-02-09', estorno_de: 'p' };
  assert.equal(c.calcular(m, [pagamento, estorno], '2026-02-09').saldo_centavos, 30900);
  assert.equal(pagamento.valor_centavos, 10000);
});
