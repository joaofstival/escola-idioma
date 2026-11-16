import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { criarApiTeste, criarBase } from '../test-helpers.ts';
import { definirHoje } from '../services/financeiro.ts';

beforeEach(() => definirHoje('2026-06-15'));

/** Inglês (300) e Espanhol (280); Alice em EN desde fevereiro, Bruno em ES desde junho (antes do dia 10). */
async function cenario() {
  const api = await criarApiTeste();
  const { ingles, espanhol } = await criarBase(api);
  const en = await api.ok('POST', '/turmas', { nome: 'EN1', idioma_id: ingles.id, nivel: 1, ano_letivo: 2026, capacidade: 10 });
  const es = await api.ok('POST', '/turmas', { nome: 'ES1', idioma_id: espanhol.id, nivel: 1, ano_letivo: 2026, capacidade: 10 });
  const alice = await api.ok('POST', '/alunos', { nome: 'Alice', email: 'alice@x.com' });
  const bruno = await api.ok('POST', '/alunos', { nome: 'Bruno' });
  const mA = await api.ok('POST', '/matriculas', { aluno_id: alice.id, turma_id: en.id, data: '2026-02-01' });
  const mB = await api.ok('POST', '/matriculas', { aluno_id: bruno.id, turma_id: es.id, data: '2026-06-01' });
  const idDe = (alunoId: number, competencia: string) =>
    api.db.get<{ id: number }>('SELECT id FROM mensalidades WHERE aluno_id = ? AND competencia = ?', [alunoId, competencia])!.id;
  return { api, alice, bruno, mA, mB, idDe, en };
}

test('GET /mensalidades: campos calculados e filtros por status, aluno, competência e ano', async () => {
  const { api, alice, idDe } = await cenario();
  const todas = await api.ok('GET', '/mensalidades');
  assert.equal(todas.length, 11 + 7);
  const fev = todas.find((m: any) => m.id === idDe(alice.id, '2026-02'));
  assert.equal(fev.aluno_nome, 'Alice');
  assert.equal(fev.idioma_nome, 'Inglês');
  assert.equal(fev.turma_nome, 'EN1');
  assert.equal(fev.atrasada, true);
  assert.equal(fev.dias_atraso, 125); // 10/02 → 15/06
  assert.equal(fev.multa, 6);
  assert.equal(fev.juros, 12.5);
  assert.equal(fev.valor_atualizado, 318.5);
  for (const k of ['data_pagamento', 'valor_pago', 'forma_pagamento']) assert.equal(fev[k], null);

  const atrasadas = await api.ok('GET', '/mensalidades?status=atrasada');
  assert.deepEqual(atrasadas.map((m: any) => m.competencia), ['2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-06']);
  assert.ok(atrasadas.every((m: any) => m.atrasada));
  assert.equal((await api.ok('GET', '/mensalidades?status=pendente')).length, 18, 'pendente inclui as atrasadas');
  assert.equal((await api.ok('GET', `/mensalidades?aluno_id=${alice.id}&competencia=2026-07`)).length, 1);
  assert.equal((await api.ok('GET', '/mensalidades?ano=2026')).length, 18);
  assert.equal((await api.ok('GET', '/mensalidades?ano=2025')).length, 0);
  await api.falha('GET', '/mensalidades?status=vencida', undefined, 422);
  await api.falha('GET', '/mensalidades?competencia=2026-13', undefined, 422);
  await api.falha('GET', '/mensalidades/999', undefined, 404);
});

test('pagar (valor atualizado por padrão, ou valor informado) e estornar', async () => {
  const { api, alice, idDe } = await cenario();
  const fev = idDe(alice.id, '2026-02');
  const p = await api.ok('POST', `/mensalidades/${fev}/pagar`, { forma_pagamento: 'pix' });
  assert.equal(p.status, 'paga');
  assert.equal(p.data_pagamento, '2026-06-15');
  assert.equal(p.valor_pago, 318.5, 'sem valor_pago usa o valor atualizado');
  assert.equal(p.forma_pagamento, 'pix');
  assert.equal(p.atrasada, false);
  assert.equal(p.valor, 300, 'o valor original não muda');

  const mar = idDe(alice.id, '2026-03');
  const p2 = await api.ok('POST', `/mensalidades/${mar}/pagar`, { forma_pagamento: 'boleto', data_pagamento: '2026-03-10' });
  assert.equal(p2.valor_pago, 300, 'pago no vencimento: sem encargos');
  const abr = idDe(alice.id, '2026-04');
  const p3 = await api.ok('POST', `/mensalidades/${abr}/pagar`, { forma_pagamento: 'dinheiro', valor_pago: '250,50', data_pagamento: '2026-04-20' });
  assert.equal(p3.valor_pago, 250.5);

  const ja = await api.falha('POST', `/mensalidades/${fev}/pagar`, { forma_pagamento: 'pix' }, 422);
  assert.match(ja.erro, /já está paga/);
  const mai = idDe(alice.id, '2026-05');
  assert.match((await api.falha('POST', `/mensalidades/${mai}/pagar`, {}, 422)).detalhes!.join(), /forma de pagamento/);
  assert.match((await api.falha('POST', `/mensalidades/${mai}/pagar`, { forma_pagamento: 'pix', data_pagamento: '2026-06-16' }, 422)).detalhes!.join(), /futura/);
  await api.falha('POST', `/mensalidades/${mai}/pagar`, { forma_pagamento: 'pix', valor_pago: 0 }, 422);
  await api.falha('POST', '/mensalidades/999/pagar', { forma_pagamento: 'pix' }, 404);

  const e = await api.ok('POST', `/mensalidades/${fev}/estornar`);
  assert.equal(e.status, 'pendente');
  assert.equal(e.valor_pago, null);
  assert.equal(e.data_pagamento, null);
  assert.equal(e.forma_pagamento, null);
  assert.equal(e.atrasada, true);
  await api.falha('POST', `/mensalidades/${fev}/estornar`, undefined, 422);

  api.db.run("UPDATE mensalidades SET status = 'cancelada' WHERE id = ?", [mai]);
  assert.match((await api.falha('POST', `/mensalidades/${mai}/pagar`, { forma_pagamento: 'pix' }, 422)).erro, /cancelada/);
});

test('resumo financeiro do ano, inadimplentes, histórico do aluno e painel', async () => {
  const { api, alice, bruno, idDe, mB } = await cenario();
  for (const c of ['2026-02', '2026-03', '2026-04', '2026-05']) {
    await api.ok('POST', `/mensalidades/${idDe(alice.id, c)}/pagar`, { forma_pagamento: 'pix', data_pagamento: `${c}-10` });
  }
  await api.ok('POST', `/mensalidades/${idDe(bruno.id, '2026-06')}/pagar`, { forma_pagamento: 'pix', valor_pago: 280, data_pagamento: '2026-06-12' });
  await api.ok('PUT', `/matriculas/${mB.id}/cancelar`); // jul–dez do Bruno canceladas

  const r = await api.ok('GET', '/financeiro/resumo?ano=2026');
  assert.equal(r.ano, 2026);
  assert.equal(r.recebido, 4 * 300 + 280);
  assert.equal(r.em_atraso, 300, 'só junho da Alice');
  assert.equal(r.a_receber, 6 * 300, 'jul–dez da Alice');
  assert.deepEqual(r.alunos_inadimplentes, [{ aluno_id: alice.id, aluno_nome: 'Alice', qtd: 1, total: 300 }]);
  assert.equal(r.por_mes.length, 12);
  assert.deepEqual(r.por_mes[0], { competencia: '2026-01', previsto: 0, recebido: 0 });
  assert.deepEqual(r.por_mes[5], { competencia: '2026-06', previsto: 580, recebido: 280 });
  assert.deepEqual(r.por_mes[6], { competencia: '2026-07', previsto: 300, recebido: 0 }, 'canceladas fora do previsto');
  assert.deepEqual(await api.ok('GET', '/financeiro/resumo'), r, 'padrão: ano de hoje');
  await api.falha('GET', '/financeiro/resumo?ano=abc', undefined, 422);

  const inad = await api.ok('GET', '/financeiro/inadimplentes');
  assert.equal(inad.length, 1);
  assert.equal(inad[0].aluno_nome, 'Alice');
  assert.equal(inad[0].email, 'alice@x.com');
  assert.equal(inad[0].dias_max_atraso, 5);
  assert.equal(inad[0].total_atualizado, 306.5);
  assert.equal(inad[0].acima_90_dias, false);

  const h = await api.ok('GET', `/alunos/${alice.id}/historico`);
  assert.equal(h.aluno.nome, 'Alice');
  assert.equal(h.matriculas.length, 1);
  assert.equal(h.mensalidades.length, 11);
  assert.deepEqual(h.resumo, { pago: 1200, pendente: 1800, atrasado: 300 });
  const hb = await api.ok('GET', `/alunos/${bruno.id}/historico`);
  assert.equal(hb.matriculas[0].status, 'cancelada');
  assert.deepEqual(hb.resumo, { pago: 280, pendente: 0, atrasado: 0 });
  await api.falha('GET', '/alunos/999/historico', undefined, 404);

  const d = await api.ok('GET', '/dashboard');
  assert.deepEqual(d, {
    alunos_ativos: 2, professores_ativos: 1, turmas_ano: 2, matriculas_ano: 1,
    receita_mes: 280, a_receber_mes: 300, inadimplentes: 1, ano: 2026,
  });
});
