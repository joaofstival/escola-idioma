import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cenarioCentral, dados } from './test-helpers.ts';
import { ServicoFerramentas } from './modules/ferramentas.ts';
import { ServicoCotacao } from '../main/services/cotacao.ts';
test('avisos e pedidos respeitam destino, autoria, leitura e versão de atendimento', async () => {
  const { app, db, tokens: t } = await cenarioCentral();
  try {
    const body = { titulo: 'Aula de revisão', texto: 'Traga seu caderno', turma_id: 1, expira_em: '2026-12-31' };
    assert.equal((await app.handle({ method: 'POST', path: '/avisos', body }, t.alunoA)).status, 403);
    assert.equal((await app.handle({ method: 'POST', path: '/avisos', body: { ...body, turma_id: null } }, t.profA)).status, 403);
    const a = dados<any>(await app.handle({ method: 'POST', path: '/avisos', body }, t.profA));
    assert.equal(dados<any[]>(await app.handle({ method: 'GET', path: '/avisos' }, t.alunoA)).length, 1);
    assert.equal(dados<any[]>(await app.handle({ method: 'GET', path: '/avisos' }, t.alunoB)).length, 0);
    assert.equal((await app.handle({ method: 'POST', path: `/avisos/${a.id}/ler` }, t.alunoB)).status, 404);
    dados(await app.handle({ method: 'POST', path: `/avisos/${a.id}/ler` }, t.alunoA));
    assert.equal(dados<any[]>(await app.handle({ method: 'GET', path: '/avisos' }, t.alunoA))[0].lido, 1);
    const p = dados<any>(
      await app.handle(
        { method: 'POST', path: '/solicitacoes', body: { assunto: 'Declaração', texto: 'Preciso de declaração de matrícula' } },
        t.alunoA,
      ),
    );
    assert.equal((await app.handle({ method: 'GET', path: `/solicitacoes/${p.id}/historico` }, t.alunoB)).status, 404);
    assert.equal((await app.handle({ method: 'PUT', path: `/solicitacoes/${p.id}`, body: {} }, t.profA)).status, 403);
    const resposta = { status: 'resolvida', resposta: 'Disponível na secretaria', versao: 1 };
    dados(await app.handle({ method: 'PUT', path: `/solicitacoes/${p.id}`, body: resposta }, t.admin));
    assert.equal((await app.handle({ method: 'PUT', path: `/solicitacoes/${p.id}`, body: resposta }, t.admin)).status, 409);
    assert.equal(dados<any[]>(await app.handle({ method: 'GET', path: `/solicitacoes/${p.id}/historico` }, t.alunoA)).length, 1);
  } finally {
    db.close();
  }
});
test('ferramentas usam URLs fixas e validam CEP, calendário e falhas externas', async () => {
  const urls: string[] = [];
  const s = new ServicoFerramentas(async (input) => {
    urls.push(String(input));
    return new Response(
      JSON.stringify(
        String(input).includes('viacep')
          ? { logradouro: 'Praça da Sé', localidade: 'São Paulo', uf: 'SP' }
          : [{ date: '2026-12-25', name: 'Natal', type: 'national' }],
      ),
      { status: 200 },
    );
  });
  assert.equal((await s.cep('01001-000')).cidade, 'São Paulo');
  assert.equal((await s.feriados('2026')).feriados.length, 1);
  assert.equal(urls[0], 'https://viacep.com.br/ws/01001000/json/');
  assert.equal(urls[1], 'https://brasilapi.com.br/api/feriados/v1/2026');
  await assert.rejects(() => s.cep('../segredo'));
  await assert.rejects(() => s.feriados('9999'));
  await assert.rejects(
    () =>
      new ServicoFerramentas(async () => {
        throw new Error('rede');
      }).cep('01001000'),
    { status: 503 },
  );
});
test('cotação persistida sobrevive à recriação do serviço e identifica cache vencido', async () => {
  const dados = new Map<string, any>();
  let agora = 100000000;
  const persistencia = {
    carregar: () => [...dados.entries()],
    salvar: (m: string, v: any) => {
      dados.set(m, v);
    },
  };
  const primeira = new ServicoCotacao({
    agora: () => agora,
    persistencia,
    fetch: async () =>
      new Response(JSON.stringify({ USDBRL: { bid: '5.5', pctChange: '0', create_date: '2026-11-24 10:00:00' } }), { status: 200 }),
  });
  await primeira.cotacoes(['USD']);
  agora += 2 * 3600000;
  const reiniciado = new ServicoCotacao({
    agora: () => agora,
    persistencia,
    fetch: async () => {
      throw new Error('offline');
    },
  });
  const r = await reiniciado.cotacoes(['USD']);
  assert.equal(r.cotacoes.USD.valor_em_brl, 5.5);
  assert.equal(r.desatualizada, true);
  agora += 73 * 3600000;
  await assert.rejects(() => reiniciado.cotacoes(['USD']), { status: 503 });
});
