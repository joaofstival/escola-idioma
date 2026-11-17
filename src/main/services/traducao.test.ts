import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ServicoTraducao, validarPedido, MSG_INDISPONIVEL } from './traducao.ts';
import { fetchFalso } from './fetch-falso.ts';
import type { Rota } from './fetch-falso.ts';
import { consultarDicionario, DICIONARIO } from '../data/dicionario.ts';
import { Router } from '../router.ts';
import { criarRotasTraducao } from '../routes/traducao.ts';
import { openDb } from '../db.ts';

const mm = (traducao: string, extra: Record<string, unknown> = {}) => ({
  body: {
    responseData: { translatedText: traducao, match: 1 },
    quotaFinished: false,
    responseStatus: 200,
    matches: [{ translation: traducao }, { translation: 'volume' }, { translation: 'Book' }],
    ...extra,
  },
});
const google = (t: string) => ({ body: [[[t, 'x', null, null, 10]], null, 'pt'] });
const porHost =
  (m: Rota, g: Rota): Rota =>
  (u) =>
    u.host.includes('mymemory') ? m(u) : g(u);

function servico(rota: Rota, opts: { email?: string | null } = {}, relogio = { t: 0 }) {
  const f = fetchFalso(rota);
  return { s: new ServicoTraducao({ fetch: f, agora: () => relogio.t, timeoutMs: 50, email: opts.email ?? null }), f, relogio };
}

test('validação: texto obrigatório, até 500 bytes e idiomas suportados (422)', () => {
  assert.deepEqual(validarPedido('  livro ', 'PT', 'en'), { texto: 'livro', de: 'pt', para: 'en' });
  assert.throws(
    () => validarPedido('', 'pt', 'en'),
    (e: any) => e.status === 422 && /obrigatório/.test(e.detalhes[0]),
  );
  assert.throws(
    () => validarPedido('   ', 'pt', 'en'),
    (e: any) => e.status === 422,
  );
  assert.doesNotThrow(() => validarPedido('a'.repeat(500), 'pt', 'en'));
  assert.throws(
    () => validarPedido('a'.repeat(501), 'pt', 'en'),
    (e: any) => /500 bytes/.test(e.detalhes[0]),
  );
  assert.throws(
    () => validarPedido('ç'.repeat(251), 'pt', 'en'),
    (e: any) => /502/.test(e.detalhes[0]),
    'conta bytes, não caracteres',
  );
  assert.throws(
    () => validarPedido('livro', 'xx', 'en'),
    (e: any) => e.status === 422,
  );
  assert.throws(
    () => validarPedido('livro', 'pt', undefined),
    (e: any) => e.status === 422,
  );
});

test('MyMemory é a fonte principal (com e-mail opcional) e o resultado vai para o cache por 30 dias', async () => {
  const { s, f, relogio } = servico(
    porHost(
      () => mm('book'),
      () => google('X'),
    ),
    { email: 'escola@exemplo.com' },
  );
  const r = await s.traduzir('Livro', 'pt', 'en');
  assert.deepEqual(r, { texto: 'Livro', traducao: 'book', de: 'pt', para: 'en', fonte: 'mymemory', alternativas: ['volume'] });
  const u = new URL(f.chamadas[0]);
  assert.equal(u.searchParams.get('q'), 'Livro');
  assert.equal(u.searchParams.get('langpair'), 'pt|en');
  assert.equal(u.searchParams.get('de'), 'escola@exemplo.com');

  const c = await s.traduzir('livro', 'pt', 'en');
  assert.equal(c.fonte, 'cache');
  assert.equal(c.traducao, 'book');
  assert.equal(f.chamadas.length, 1);
  relogio.t += 31 * 24 * 60 * 60 * 1000;
  assert.equal((await s.traduzir('livro', 'pt', 'en')).fonte, 'mymemory', 'cache venceu');
  assert.equal(f.chamadas.length, 2);
});

test('MyMemory com erro disfarçado (HTTP 200) cai para o Google gtx', async () => {
  const casos: Rota[] = [
    () => ({ body: { responseData: { translatedText: "'XX' IS AN INVALID TARGET LANGUAGE" }, responseStatus: 403 } }),
    () => mm('book', { quotaFinished: true }),
    () => mm('MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY'),
    () => ({ status: 429, body: {} }),
    () => 'erro',
    () => 'trava',
  ];
  for (const m of casos) {
    const { s, f } = servico(porHost(m, () => google('book')));
    const r = await s.traduzir('livro', 'pt', 'en');
    assert.equal(r.fonte, 'google');
    assert.equal(r.traducao, 'book');
    const g = new URL(f.chamadas[1]);
    assert.equal(g.searchParams.get('client'), 'gtx');
    assert.equal(g.searchParams.get('sl'), 'pt');
    assert.equal(g.searchParams.get('tl'), 'en');
  }
  const { s } = servico(
    porHost(
      () => 'erro',
      () => ({
        body: [
          [
            ['Bom ', 'Good ', null],
            ['dia', 'morning', null],
          ],
          null,
          'en',
        ],
      }),
    ),
  );
  assert.equal((await s.traduzir('Good morning', 'en', 'pt')).traducao, 'Bom dia', 'junta os segmentos');
});

test('APIs fora do ar: dicionário offline; fora do dicionário: 503', async () => {
  const { s, f } = servico(() => 'erro');
  const r = await s.traduzir('Água', 'pt', 'de');
  assert.equal(r.fonte, 'dicionario');
  assert.equal(r.traducao, 'Wasser');
  assert.equal((await s.traduzir('agua', 'pt', 'de')).fonte, 'dicionario', 'dicionário não vai para o cache');
  assert.equal(f.chamadas.length, 4);
  assert.equal((await s.traduzir('libro', 'es', 'fr')).traducao, 'livre', 'qualquer par entre os 6 idiomas');
  assert.equal((await s.traduzir('bom dia', 'pt', 'it')).traducao, 'buongiorno');
  await assert.rejects(s.traduzir('paralelepípedo', 'pt', 'en'), (e: any) => e.status === 503 && e.erro === MSG_INDISPONIVEL);
  await assert.rejects(s.traduzir('livro', 'pt', 'ja'), (e: any) => e.status === 503);
});

test('mesmo idioma devolve o próprio texto sem chamar a rede; dicionário tem ~100 entradas', async () => {
  const { s, f } = servico(() => 'erro');
  assert.deepEqual(await s.traduzir('casa', 'pt', 'pt'), { texto: 'casa', traducao: 'casa', de: 'pt', para: 'pt', fonte: 'original' });
  assert.equal(f.chamadas.length, 0);
  assert.ok(DICIONARIO.length >= 100);
  assert.deepEqual(consultarDicionario('teacher', 'en', 'pt'), { traducao: 'professor', alternativas: ['professora'] });
  assert.equal(consultarDicionario('livro', 'pt', 'ja'), null);
});

test('rota GET /traducao: 200, 422 e 503', async () => {
  const router = new Router();
  criarRotasTraducao(
    servico(
      porHost(
        () => mm('libro'),
        () => 'erro',
      ),
    ).s,
  ).register(router, await openDb());
  const ok = (await router.handle({ method: 'GET', path: '/traducao?texto=livro&de=pt&para=es' })) as any;
  assert.equal(ok.status, 200);
  assert.equal(ok.data.traducao, 'libro');
  assert.equal(((await router.handle({ method: 'GET', path: '/traducao?texto=livro&para=es' })) as any).data.de, 'pt', 'de padrão: pt');
  assert.equal(((await router.handle({ method: 'GET', path: '/traducao?de=pt&para=es' })) as any).status, 422);
  assert.equal(((await router.handle({ method: 'GET', path: '/traducao?texto=x&de=pt&para=kl' })) as any).status, 422);

  const off = new Router();
  criarRotasTraducao(servico(() => 'erro').s).register(off, await openDb());
  const r = (await off.handle({ method: 'GET', path: '/traducao?texto=xyzzy&de=pt&para=en' })) as any;
  assert.equal(r.status, 503);
  assert.match(r.erro, /Tradução indisponível/);
});
