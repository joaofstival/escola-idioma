import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ServicoCotacao, lerMoedas, MOEDAS_PADRAO } from './cotacao.ts';
import { fetchFalso } from './fetch-falso.ts';
import type { Rota } from './fetch-falso.ts';
import { Router } from '../router.ts';
import { criarRotasCotacao } from '../routes/cotacao.ts';
import { openDb } from '../db.ts';

const AWESOME: Record<string, { bid: string; pctChange: string }> = {
  USD: { bid: '5.80', pctChange: '1.5' }, EUR: { bid: '6.40', pctChange: '-0.25' }, JPY: { bid: '0.0362', pctChange: '0' },
};
const ER_RATES: Record<string, number> = { BRL: 1, USD: 0.2, EUR: 0.16, JPY: 25, PYG: 1250 };

/** AwesomeAPI: lote falha inteiro (404 CoinNotExists) se algum par não existir, como a API real. */
function awesome(url: URL) {
  const pares = url.pathname.replace('/json/last/', '').split(',');
  const corpo: Record<string, unknown> = {};
  for (const p of pares) {
    const m = p.replace('-BRL', '');
    if (!AWESOME[m]) return { status: 404, body: { status: 404, code: 'CoinNotExists', message: `moeda nao encontrada ${p}` } };
    corpo[`${m}BRL`] = { code: m, codein: 'BRL', name: `Moeda ${m}/Real Brasileiro`, ...AWESOME[m], create_date: '2026-11-16 19:07:21' };
  }
  return { body: corpo };
}
const erApi = () => ({ body: { result: 'success', time_last_update_utc: 'Mon, 16 Nov 2026 00:02:31 +0000', base_code: 'BRL', rates: ER_RATES } });

function servico(rota: Rota, relogio = { t: Date.UTC(2026, 10, 16, 12) }) {
  const f = fetchFalso(rota);
  return { s: new ServicoCotacao({ fetch: f, agora: () => relogio.t, timeoutMs: 50 }), f, relogio };
}
const porHost = (a: Rota, e: Rota): Rota => (u) => (u.host.includes('awesomeapi') ? a(u) : e(u));

test('lerMoedas: padrão, normalização e 422 para código inválido', () => {
  assert.deepEqual(lerMoedas(undefined), [...MOEDAS_PADRAO]);
  assert.deepEqual(lerMoedas(' usd, eur,USD '), ['USD', 'EUR']);
  assert.throws(() => lerMoedas('US'), (e: any) => e.status === 422);
  assert.throws(() => lerMoedas('USD,EURO'), (e: any) => e.status === 422 && /EURO/.test(e.detalhes[0]));
  assert.throws(() => lerMoedas('U1D'), (e: any) => e.status === 422);
});

test('AwesomeAPI como fonte principal, com cache de 1 h', async () => {
  const { s, f, relogio } = servico(porHost(awesome, erApi));
  const r = await s.cotacoes(['USD', 'EUR', 'BRL']);
  assert.equal(r.base, 'BRL');
  assert.equal(r.fonte, 'awesomeapi');
  assert.equal(r.desatualizada, false);
  assert.equal(r.data, '2026-11-16T19:07:21-03:00');
  assert.deepEqual(Object.keys(r.cotacoes), ['BRL', 'USD', 'EUR']);
  assert.equal(r.cotacoes.USD.valor_em_brl, 5.8);
  assert.equal(r.cotacoes.USD.brl_em_moeda, 0.172414);
  assert.equal(r.cotacoes.USD.variacao_pct, 1.5);
  assert.equal(r.cotacoes.USD.nome, 'Dólar americano');
  assert.equal(r.cotacoes.BRL.valor_em_brl, 1);
  assert.equal(f.chamadas.length, 1, 'um lote só');

  await s.cotacoes(['USD', 'EUR']);
  assert.equal(f.chamadas.length, 1, 'cache dentro de 1 h');
  relogio.t += 61 * 60 * 1000;
  await s.cotacoes(['USD']);
  assert.equal(f.chamadas.length, 2, 'cache vencido: busca de novo');
});

test('moeda inválida não derruba as outras: consulta par a par e devolve invalidas', async () => {
  const { s, f } = servico(porHost(awesome, () => ({ body: { result: 'success', rates: { USD: 0.2 } } })));
  const r = await s.cotacoes(['USD', 'XYZ', 'EUR']);
  assert.deepEqual(Object.keys(r.cotacoes).sort(), ['EUR', 'USD']);
  assert.deepEqual(r.invalidas, ['XYZ']);
  assert.ok(f.chamadas.some((u) => u.endsWith('/XYZ-BRL')), 'isolou o par inválido');
  await assert.rejects(s.cotacoes(['XYZ']), (e: any) => e.status === 422 && /XYZ/.test(e.detalhes[0]));
});

test('fallback para open.er-api (1/rates.X) quando a AwesomeAPI falha ou não tem a moeda', async () => {
  const { s } = servico(porHost(() => 'erro', erApi));
  const r = await s.cotacoes(['USD', 'JPY']);
  assert.equal(r.fonte, 'exchangerate-api');
  assert.equal(r.cotacoes.USD.valor_em_brl, 5);
  assert.equal(r.cotacoes.JPY.valor_em_brl, 0.04);
  assert.equal(r.cotacoes.USD.variacao_pct, null);
  assert.equal(r.data, '2026-11-16T00:02:31.000Z');

  const { s: s2 } = servico(porHost(awesome, erApi));
  const r2 = await s2.cotacoes(['USD', 'PYG']); // PYG não está na AwesomeAPI falsa
  assert.equal(r2.cotacoes.USD.fonte, 'awesomeapi');
  assert.equal(r2.cotacoes.PYG.fonte, 'exchangerate-api');
  assert.equal(r2.cotacoes.PYG.valor_em_brl, 0.0008);
  assert.equal(r2.fonte, 'awesomeapi,exchangerate-api');

  const { s: s3 } = servico(porHost(() => ({ status: 429, body: {} }), () => ({ body: { result: 'error', 'error-type': 'unsupported-code' } })));
  await assert.rejects(s3.cotacoes(['USD']), (e: any) => e.status === 503);
});

test('timeout: fonte que não responde é abandonada em timeoutMs e o fallback assume', async () => {
  const { s } = servico(porHost(() => 'trava', erApi));
  const t0 = Date.now();
  const r = await s.cotacoes(['EUR']);
  assert.ok(Date.now() - t0 < 2000);
  assert.equal(r.cotacoes.EUR.fonte, 'exchangerate-api');
  assert.equal(r.cotacoes.EUR.valor_em_brl, 6.25);
});

test('tudo fora do ar: usa o cache vencido até 72 h (desatualizada) e depois responde 503', async () => {
  let online = true;
  const { s, relogio } = servico((u) => (!online ? 'erro' : u.host.includes('awesomeapi') ? awesome(u) : erApi()));
  await s.cotacoes(['USD']);
  online = false;
  relogio.t += 5 * 60 * 60 * 1000;
  const r = await s.cotacoes(['USD', 'EUR']);
  assert.equal(r.desatualizada, true);
  assert.equal(r.cotacoes.USD.desatualizada, true);
  assert.equal(r.cotacoes.USD.valor_em_brl, 5.8);
  assert.deepEqual(r.indisponiveis, ['EUR']);
  relogio.t += 72 * 60 * 60 * 1000;
  await assert.rejects(s.cotacoes(['USD']), (e: any) => e.status === 503 && /indisponível/.test(e.erro));
});

test('rotas /cotacao e /cotacao/converter (cruzando por BRL) com 422 e 503', async () => {
  const { s } = servico(porHost(awesome, erApi));
  const router = new Router();
  criarRotasCotacao(s).register(router, await openDb());
  const get = (path: string) => router.handle({ method: 'GET', path }) as Promise<any>;

  const c = await get('/cotacao?moedas=usd,eur');
  assert.equal(c.status, 200);
  assert.deepEqual(Object.keys(c.data.cotacoes), ['USD', 'EUR']);
  const conv = await get('/cotacao/converter?valor=100&de=USD&para=EUR');
  assert.equal(conv.status, 200);
  assert.equal(conv.data.resultado, 90.625); // 100 × 5,80 / 6,40
  assert.equal(conv.data.taxa, 0.90625);
  assert.equal(conv.data.de, 'USD');
  const brl = await get('/cotacao/converter?valor=290&para=USD');
  assert.equal(brl.data.de, 'BRL');
  assert.equal(brl.data.resultado, 50);
  assert.equal((await get('/cotacao/converter?valor=10,5&de=BRL&para=BRL')).data.resultado, 10.5);

  assert.equal((await get('/cotacao?moedas=DOLAR')).status, 422);
  assert.equal((await get('/cotacao/converter?valor=abc&de=USD&para=EUR')).status, 422);
  assert.equal((await get('/cotacao/converter?valor=-1&de=USD&para=EUR')).status, 422);
  assert.equal((await get('/cotacao/converter?valor=1&de=USD')).status, 422);
  assert.equal((await get('/cotacao/converter?valor=1&de=USD&para=XYZ')).status, 422);

  const off = new Router();
  criarRotasCotacao(servico(() => 'erro').s).register(off, await openDb());
  const r503 = await off.handle({ method: 'GET', path: '/cotacao?moedas=USD' }) as any;
  assert.equal(r503.status, 503);
  assert.equal(r503.erro, 'Serviço de cotação indisponível no momento. Tente novamente mais tarde.');
});
