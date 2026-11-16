import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { criarApiTeste, criarBase } from '../test-helpers.ts';
import type { ApiTeste } from '../test-helpers.ts';
import { definirHoje } from '../services/financeiro.ts';

beforeEach(() => definirHoje('2026-06-15'));

async function cenario() {
  const api = await criarApiTeste();
  const base = await criarBase(api);
  const turma = (nome: string, idioma_id: number, nivel: number, ano_letivo: number, capacidade = 10) =>
    api.ok('POST', '/turmas', { nome, idioma_id, nivel, ano_letivo, capacidade });
  const aluno = (nome: string, extra: Record<string, unknown> = {}) => api.ok('POST', '/alunos', { nome, ...extra });
  return { api, ...base, turma, aluno };
}

const mensalidadesDe = (api: ApiTeste, matriculaId: number) =>
  api.db.all<any>('SELECT competencia, vencimento, valor, status FROM mensalidades WHERE matricula_id = ? ORDER BY competencia', [matriculaId]);

test('matrícula gera mensalidades proporcionais (mês da matrícula até dezembro) com o valor do idioma', async () => {
  const { api, ingles, turma, aluno } = await cenario();
  const t = await turma('EN1', ingles.id, 1, 2026);
  const a = await aluno('Alice');
  const m = await api.ok('POST', '/matriculas', { aluno_id: a.id, turma_id: t.id, ano_letivo: 2026, data: '2026-04-03' }, 201);
  assert.equal(m.tipo, 'matricula');
  assert.equal(m.status, 'ativa');
  assert.equal(m.aluno_nome, 'Alice');
  assert.equal(m.turma_nome, 'EN1');
  assert.equal(m.idioma_nome, 'Inglês');
  assert.equal(m.nivel, 1);
  assert.equal(m.mensalidades_geradas, 9);
  const ms = mensalidadesDe(api, m.id);
  assert.equal(ms.length, 9);
  assert.deepEqual(ms[0], { competencia: '2026-04', vencimento: '2026-04-10', valor: 300, status: 'pendente' });
  assert.equal(ms.at(-1).competencia, '2026-12');
  assert.ok(ms.every((x: any) => x.valor === 300 && x.vencimento.endsWith('-10')));

  // Sem data: usa hoje (15/06, depois do dia 10) → 1ª parcela vence em 20/06.
  const b = await aluno('Bruno');
  const m2 = await api.ok('POST', '/matriculas', { aluno_id: b.id, turma_id: t.id });
  assert.equal(m2.data, '2026-06-15');
  assert.equal(m2.ano_letivo, 2026);
  const ms2 = mensalidadesDe(api, m2.id);
  assert.equal(ms2.length, 7);
  assert.equal(ms2[0].vencimento, '2026-06-20');

  const lista = await api.ok('GET', `/matriculas?ano=2026&turma_id=${t.id}`);
  assert.deepEqual(lista.map((x: any) => x.aluno_nome), ['Alice', 'Bruno']);
  assert.equal((await api.ok('GET', `/matriculas?aluno_id=${a.id}`)).length, 1);
  assert.equal((await api.ok('GET', '/matriculas?status=cancelada')).length, 0);
  await api.falha('GET', '/matriculas?status=xyz', undefined, 422);
  assert.equal((await api.ok('GET', `/matriculas/${m.id}`)).id, m.id);
  await api.falha('GET', '/matriculas/999', undefined, 404);
});

test('matrícula: capacidade, aluno inativo, ano diferente da turma e dados inválidos → 422', async () => {
  const { api, ingles, turma, aluno } = await cenario();
  const t = await turma('EN1', ingles.id, 1, 2026, 1);
  const a = await aluno('Alice');
  const b = await aluno('Bruno');
  await api.ok('POST', '/matriculas', { aluno_id: a.id, turma_id: t.id });
  const lotada = await api.falha('POST', '/matriculas', { aluno_id: b.id, turma_id: t.id }, 422);
  assert.match(lotada.detalhes!.join(), /lotada/);

  const t2 = await turma('EN1-B', ingles.id, 1, 2026);
  const inativo = await aluno('Inativo', { ativo: false });
  assert.match((await api.falha('POST', '/matriculas', { aluno_id: inativo.id, turma_id: t2.id }, 422)).detalhes!.join(), /inativo/);
  assert.match((await api.falha('POST', '/matriculas', { aluno_id: b.id, turma_id: t2.id, ano_letivo: 2025 }, 422)).detalhes!.join(), /diferente do ano da turma/);
  assert.match((await api.falha('POST', '/matriculas', { aluno_id: b.id, turma_id: t2.id, data: '2027-01-01' }, 422)).detalhes!.join(), /posterior/);
  assert.match((await api.falha('POST', '/matriculas', { aluno_id: 999, turma_id: t2.id }, 422)).detalhes!.join(), /Aluno 999/);
  assert.match((await api.falha('POST', '/matriculas', { aluno_id: b.id, turma_id: 999 }, 422)).detalhes!.join(), /Turma 999/);
  assert.equal((await api.falha('POST', '/matriculas', {}, 422)).detalhes!.length, 2);
  assert.equal(api.db.get<any>('SELECT count(*) AS n FROM mensalidades')!.n, 7, 'falhas não geram mensalidades');
});

test('matrícula: duplicidade no mesmo idioma e ano → 422; outro idioma ou outro ano pode', async () => {
  const { api, ingles, espanhol, turma, aluno } = await cenario();
  const en1 = await turma('EN1', ingles.id, 1, 2026);
  const en2 = await turma('EN2', ingles.id, 2, 2026);
  const es1 = await turma('ES1', espanhol.id, 1, 2026);
  const en27 = await turma('EN2-27', ingles.id, 2, 2027);
  const a = await aluno('Alice');
  await api.ok('POST', '/matriculas', { aluno_id: a.id, turma_id: en1.id });
  const dup = await api.falha('POST', '/matriculas', { aluno_id: a.id, turma_id: en2.id }, 422);
  assert.match(dup.detalhes![0], /já tem matrícula ativa em Inglês em 2026/);
  await api.falha('POST', '/matriculas', { aluno_id: a.id, turma_id: en1.id }, 422);
  const es = await api.ok('POST', '/matriculas', { aluno_id: a.id, turma_id: es1.id });
  assert.equal(mensalidadesDe(api, es.id)[0].valor, 280, 'valor do idioma da turma');
  await api.ok('POST', '/matriculas', { aluno_id: a.id, turma_id: en27.id });
});

test('cancelamento: cancela as pendentes futuras, mantém vencidas e pagas; permite rematricular na mesma turma', async () => {
  const { api, ingles, turma, aluno } = await cenario();
  const t = await turma('EN1', ingles.id, 1, 2026);
  const a = await aluno('Alice');
  const m = await api.ok('POST', '/matriculas', { aluno_id: a.id, turma_id: t.id, data: '2026-02-01' });
  const ids = api.db.all<any>('SELECT id, competencia FROM mensalidades WHERE matricula_id = ? ORDER BY competencia', [m.id]);
  await api.ok('POST', `/mensalidades/${ids[0].id}/pagar`, { forma_pagamento: 'pix', data_pagamento: '2026-02-10' });

  const c = await api.ok('PUT', `/matriculas/${m.id}/cancelar`);
  assert.equal(c.status, 'cancelada');
  assert.equal(c.mensalidades_canceladas, 6, 'jul a dez');
  const st = Object.fromEntries(mensalidadesDe(api, m.id).map((x: any) => [x.competencia, x.status]));
  assert.equal(st['2026-02'], 'paga');
  assert.equal(st['2026-03'], 'pendente', 'vencida continua devida');
  assert.equal(st['2026-06'], 'pendente', 'vencimento 10/06 já passou');
  assert.equal(st['2026-07'], 'cancelada');
  assert.equal(st['2026-12'], 'cancelada');
  assert.equal((await api.ok('GET', `/turmas/${t.id}`)).ocupacao, 0);
  await api.falha('PUT', `/matriculas/${m.id}/cancelar`, undefined, 422);
  await api.falha('PUT', '/matriculas/999/cancelar', undefined, 404);

  // Voltar para a mesma turma reativa a matrícula e as mensalidades canceladas.
  const volta = await api.ok('POST', '/matriculas', { aluno_id: a.id, turma_id: t.id, data: '2026-06-15' });
  assert.equal(volta.id, m.id);
  assert.equal(volta.status, 'ativa');
  assert.equal(api.db.get<any>("SELECT count(*) AS n FROM mensalidades WHERE matricula_id = ? AND status = 'cancelada'", [m.id])!.n, 0);
});

test('rematrícula: conclui a matrícula do ano anterior, gera 12 parcelas e exige vínculo anterior', async () => {
  const { api, ingles, espanhol, turma, aluno } = await cenario();
  const en1 = await turma('EN1-25', ingles.id, 1, 2025);
  const en2 = await turma('EN2-26', ingles.id, 2, 2026);
  const es2 = await turma('ES2-26', espanhol.id, 2, 2026);
  const a = await aluno('Alice');
  definirHoje('2025-02-01');
  const ant = await api.ok('POST', '/matriculas', { aluno_id: a.id, turma_id: en1.id });
  api.db.run("UPDATE mensalidades SET status = 'paga', valor_pago = valor, data_pagamento = vencimento, forma_pagamento = 'pix'");
  definirHoje('2025-12-01');

  const nova = await api.ok('POST', '/matriculas/rematricula', { aluno_id: a.id, turma_id_destino: en2.id, ano_letivo: 2026 }, 201);
  assert.equal(nova.tipo, 'rematricula');
  assert.equal(nova.ano_letivo, 2026);
  assert.equal(nova.matricula_anterior_id, ant.id);
  assert.equal(nova.mensalidades_geradas, 12, 'rematrícula antecipada: jan a dez');
  assert.equal((await api.ok('GET', `/matriculas/${ant.id}`)).status, 'concluida');

  await api.falha('POST', '/matriculas/rematricula', { aluno_id: a.id, turma_id_destino: en2.id, ano_letivo: 2026 }, 422);
  const semVinculo = await api.falha('POST', '/matriculas/rematricula', { aluno_id: a.id, turma_id_destino: es2.id, ano_letivo: 2026 }, 422);
  assert.match(semVinculo.detalhes![0], /não tem matrícula .* Espanhol em 2025/);
  await api.falha('POST', '/matriculas/rematricula', { aluno_id: a.id, turma_id_destino: en2.id, ano_letivo: 2027 }, 422);
  await api.falha('POST', '/matriculas/rematricula', { aluno_id: a.id }, 422);
});

test('rematrícula bloqueada para aluno com mensalidade em atraso (Lei 9.870/99)', async () => {
  const { api, ingles, turma, aluno } = await cenario();
  const en1 = await turma('EN1-25', ingles.id, 1, 2025);
  const en2 = await turma('EN2-26', ingles.id, 2, 2026);
  const a = await aluno('Alice');
  definirHoje('2025-02-01');
  const ant = await api.ok('POST', '/matriculas', { aluno_id: a.id, turma_id: en1.id });
  api.db.run("UPDATE mensalidades SET status = 'paga', valor_pago = valor, data_pagamento = vencimento, forma_pagamento = 'pix' WHERE competencia < '2025-11'");
  definirHoje('2025-12-15'); // novembro e dezembro vencidos
  const r = await api.falha('POST', '/matriculas/rematricula', { aluno_id: a.id, turma_id_destino: en2.id, ano_letivo: 2026 }, 422);
  assert.match(r.erro, /Rematrícula bloqueada.*2 mensalidade/);
  assert.equal(r.detalhes!.length, 2);
  assert.equal((await api.ok('GET', `/matriculas/${ant.id}`)).status, 'ativa', 'nada muda');

  for (const m of api.db.all<any>("SELECT id FROM mensalidades WHERE status = 'pendente'")) {
    await api.ok('POST', `/mensalidades/${m.id}/pagar`, { forma_pagamento: 'pix' });
  }
  await api.ok('POST', '/matriculas/rematricula', { aluno_id: a.id, turma_id_destino: en2.id, ano_letivo: 2026 });
});

test('sugestões de rematrícula: nível + 1 (máx. 12), turmas com vaga e alunos ainda sem matrícula', async () => {
  const { api, ingles, espanhol, turma, aluno } = await cenario();
  const en1 = await turma('EN1-25', ingles.id, 1, 2025);
  const en12 = await turma('EN12-25', ingles.id, 12, 2025);
  const es1 = await turma('ES1-25', espanhol.id, 1, 2025);
  const en2a = await turma('EN2-A-26', ingles.id, 2, 2026, 1);
  const en2b = await turma('EN2-B-26', ingles.id, 2, 2026);
  await turma('EN3-26', ingles.id, 3, 2026);
  const en12n = await turma('EN12-26', ingles.id, 12, 2026);
  const [ana, bia, caio, davi, inativo] = await Promise.all(['Ana', 'Bia', 'Caio', 'Davi', 'Eva'].map((n) => aluno(n)));
  definirHoje('2025-02-01');
  for (const [al, t] of [[ana, en1], [bia, en1], [caio, en12], [davi, es1], [inativo, en1]] as const) {
    await api.ok('POST', '/matriculas', { aluno_id: al.id, turma_id: t.id });
  }
  await api.ok('PUT', `/alunos/${inativo.id}`, { ativo: false });
  const mDavi = api.db.get<any>('SELECT id FROM matriculas WHERE aluno_id = ?', [davi.id])!;
  await api.ok('PUT', `/matriculas/${mDavi.id}/cancelar`); // cancelada não entra
  api.db.run("UPDATE mensalidades SET status = 'paga', valor_pago = valor, data_pagamento = vencimento, forma_pagamento = 'pix' WHERE aluno_id <> ?", [bia.id]);
  definirHoje('2026-01-20');
  await api.ok('POST', '/matriculas', { aluno_id: ana.id, turma_id: en2a.id }); // Ana já matriculada em 2026: sai; EN2-A lota

  const sug = await api.ok('GET', '/matriculas/sugestoes-rematricula?ano=2026');
  assert.deepEqual(sug.map((s: any) => s.aluno_nome), ['Bia', 'Caio']);
  const [b, c] = sug;
  assert.equal(b.nivel_atual, 1);
  assert.equal(b.nivel_sugerido, 2);
  assert.equal(b.idioma_nome, 'Inglês');
  assert.deepEqual(b.turmas_sugeridas.map((t: any) => t.id), [en2b.id], 'EN2-A está lotada');
  assert.equal(b.inadimplente, true);
  assert.equal(c.nivel_sugerido, 12, 'não passa de 12');
  assert.deepEqual(c.turmas_sugeridas.map((t: any) => t.id), [en12n.id]);
  assert.equal(c.inadimplente, false);
  assert.equal(c.matricula_anterior_id, api.db.get<any>('SELECT id FROM matriculas WHERE aluno_id = ?', [caio.id])!.id);

  assert.equal((await api.ok('GET', '/matriculas/sugestoes-rematricula')).length, 2, 'padrão: ano de hoje');
  assert.deepEqual(await api.ok('GET', '/matriculas/sugestoes-rematricula?ano=2025'), []);
  await api.falha('GET', '/matriculas/sugestoes-rematricula?ano=x', undefined, 422);
});
