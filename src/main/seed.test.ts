import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, limparDados } from './db.ts';
import { seed, ALUNOS } from './seed.ts';
import { createApi } from './app.ts';

test('seed popula banco vazio e é idempotente', async () => {
  const db = await openDb();
  const r1 = seed(db, { anoAtual: 2026 });
  assert.equal(r1.populado, true);
  assert.deepEqual(r1.contagem, { idiomas: 5, professores: 6, alunos: ALUNOS.length, turmas: r1.contagem.turmas });
  assert.ok(ALUNOS.length >= 20);
  const r2 = seed(db, { anoAtual: 2026 });
  assert.equal(r2.populado, false);
  assert.deepEqual(r2.contagem, r1.contagem);
  limparDados(db);
  assert.equal(seed(db, { anoAtual: 2026 }).populado, true);
});

test('dados da seed respeitam as regras da API', async () => {
  const db = await openDb();
  seed(db, { anoAtual: 2026 });
  const api = createApi(db);
  const idiomas = (await api.handle({ method: 'GET', path: '/idiomas' })) as any;
  assert.equal(new Set(idiomas.data.map((i: any) => i.mensalidade)).size, 5, 'mensalidades diferentes');
  const profs = (await api.handle({ method: 'GET', path: '/professores' })) as any;
  assert.ok(profs.data.every((p: any) => p.idiomas.length >= 1 && p.idiomas.length <= 2));
  const turmas = db.all<{ n: number }>(
    `SELECT count(*) AS n FROM turmas t WHERE NOT EXISTS
       (SELECT 1 FROM professor_idiomas pi WHERE pi.professor_id = t.professor_id AND pi.idioma_id = t.idioma_id)`);
  assert.equal(turmas[0].n, 0, 'todo professor de turma está habilitado no idioma');
  const anos = db.all<{ ano_letivo: number }>('SELECT DISTINCT ano_letivo FROM turmas ORDER BY 1').map((r) => r.ano_letivo);
  assert.deepEqual(anos, [2025, 2026]);
  const moedas = new Set(db.all<{ moeda_origem: string }>('SELECT moeda_origem FROM alunos').map((r) => r.moeda_origem));
  for (const m of ['BRL', 'USD', 'EUR', 'ARS', 'CLP', 'JPY']) assert.ok(moedas.has(m), m);
});

test('seed da parte 3: matrículas, mensalidades, inadimplentes, sugestões e materiais', async () => {
  const { definirHoje } = await import('./services/financeiro.ts');
  const { MATERIAIS, MATRICULAS_ANTERIOR, MATRICULAS_ATUAL, REMATRICULAS } = await import('./seed-academico.ts');
  definirHoje('2026-06-15');
  const db = await openDb();
  seed(db, { anoAtual: 2026 });
  const api = createApi(db);
  const get = async (path: string) => ((await api.handle({ method: 'GET', path })) as any).data;

  const porAno = Object.fromEntries(db.all<any>(
    "SELECT ano_letivo || '|' || status AS k, count(*) AS n FROM matriculas GROUP BY 1").map((r) => [r.k, r.n]));
  assert.equal(porAno['2025|concluida'], MATRICULAS_ANTERIOR.length, 'ano anterior todo concluído');
  assert.equal(porAno['2026|ativa'], REMATRICULAS.length + MATRICULAS_ATUAL.length - 1);
  assert.equal(porAno['2026|cancelada'], 1);
  assert.equal(db.get<any>("SELECT count(*) AS n FROM matriculas WHERE tipo = 'rematricula'").n, REMATRICULAS.length);

  // Cada matrícula tem as mensalidades geradas pela mesma regra das rotas (mês da matrícula até dezembro).
  const semParcelas = db.get<any>('SELECT count(*) AS n FROM matriculas m WHERE NOT EXISTS (SELECT 1 FROM mensalidades ms WHERE ms.matricula_id = m.id)');
  assert.equal(semParcelas.n, 0);
  const dez = db.get<any>("SELECT count(*) AS n FROM matriculas m WHERE NOT EXISTS (SELECT 1 FROM mensalidades ms WHERE ms.matricula_id = m.id AND ms.competencia = m.ano_letivo || '-12')");
  assert.equal(dez.n, 0);
  const valorErrado = db.get<any>(
    `SELECT count(*) AS n FROM mensalidades ms JOIN matriculas m ON m.id = ms.matricula_id JOIN turmas t ON t.id = m.turma_id
     JOIN idiomas i ON i.id = t.idioma_id WHERE ms.valor <> i.mensalidade`);
  assert.equal(valorErrado.n, 0);

  const pagas = await get('/mensalidades?status=paga');
  assert.ok(pagas.length > 100);
  assert.ok(pagas.some((m: any) => m.valor_pago > m.valor), 'há pagamentos com multa e juros');
  const inad = await get('/financeiro/inadimplentes');
  assert.deepEqual(inad.map((i: any) => i.aluno_nome).sort(), ['Emily Johnson', 'Marcelo Pires', 'Mateo González', 'Valentina López']);
  assert.ok(inad.find((i: any) => i.aluno_nome === 'Mateo González').acima_90_dias);
  const resumo = await get('/financeiro/resumo?ano=2026');
  assert.ok(resumo.recebido > 0 && resumo.a_receber > 0 && resumo.em_atraso > 0);

  const sug = await get('/matriculas/sugestoes-rematricula?ano=2026');
  assert.deepEqual(sug.map((s: any) => s.aluno_nome), ['John Smith', 'Martina Rossi', 'Mateo González', 'Sophie Martin']);
  assert.ok(sug.every((s: any) => s.turmas_sugeridas.length === 1));
  assert.equal(sug.find((s: any) => s.aluno_nome === 'Mateo González').inadimplente, true);

  assert.equal(db.get<any>('SELECT count(*) AS n FROM materiais').n, MATERIAIS.length);
  for (const r of db.all<any>('SELECT idioma_id, count(*) AS n, count(DISTINCT nivel) AS niveis FROM materiais GROUP BY idioma_id')) {
    assert.ok(r.n >= 3 && r.n <= 5, `materiais por idioma: ${r.n}`);
    assert.ok(r.niveis >= 2);
  }
  const d = await get('/dashboard');
  assert.equal(d.inadimplentes, 4);
  assert.equal(d.matriculas_ano, porAno['2026|ativa']);
  definirHoje(null);
});

test('seed da parte 4: avaliação de nível com respostas e uma avaliação sem respostas', async () => {
  const { definirHoje } = await import('./services/financeiro.ts');
  const { RESPOSTAS_NIVEL } = await import('./seed-avaliacoes.ts');
  definirHoje('2026-11-16');
  const db = await openDb();
  seed(db, { anoAtual: 2026 });
  const api = createApi(db);
  const get = async (path: string) => ((await api.handle({ method: 'GET', path })) as any).data;
  const avs = await get('/avaliacoes');
  assert.equal(avs.length, 2);
  const nivel = avs.find((a: any) => a.travada);
  const livre = avs.find((a: any) => !a.travada);
  assert.equal(nivel.total_respostas, RESPOSTAS_NIVEL.length);
  assert.equal(nivel.form.questions[0].type, 'grid');
  assert.equal(livre.total_respostas, 0);
  const res = await get(`/avaliacoes/${nivel.id}/resultados`);
  assert.ok(res.nota_media > 0 && res.nota_media <= 10);
  assert.equal(res.perguntas[1].com_porque, 1);
  const exp = await get(`/avaliacoes/${nivel.id}/exportar`);
  assert.equal(exp.csv.trim().split('\r\n').length, 1 + RESPOSTAS_NIVEL.length);
  definirHoje(null);
});
