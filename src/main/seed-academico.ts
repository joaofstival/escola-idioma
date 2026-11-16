// Etapas da seed da parte 3: matrículas (ano anterior concluído, ano atual ativo), mensalidades geradas pelas
// mesmas funções das rotas, pagamentos, alguns atrasos (inadimplentes), um cancelamento e materiais didáticos.
import type { Db } from './db.ts';
import type { SeedContexto } from './seed.ts';
import type { MaterialTipo } from '../shared/types.ts';
import { hoje, somarDias } from './services/financeiro.ts';
import { cancelarMatricula, matricular, rematricular } from './routes/matriculas.ts';
import { pagarMensalidade } from './routes/mensalidades.ts';

/** `data`: MM-DD dentro do ano da turma (limitada ao "hoje" da seed). */
export interface MatriculaSeed { aluno: string; turma: string; data: string }
export interface RematriculaSeed { aluno: string; turma: string }

export const MATRICULAS_ANTERIOR: MatriculaSeed[] = [
  { aluno: 'Ana Beatriz Souza', turma: 'Inglês 1 - Manhã', data: '02-02' },
  { aluno: 'Bruno Henrique Lima', turma: 'Inglês 2 - Noite', data: '02-03' },
  { aluno: 'Carla Mendes', turma: 'Inglês 3 - Sábado', data: '02-03' },
  { aluno: 'John Smith', turma: 'Inglês 2 - Noite', data: '02-05' },
  { aluno: 'Sophie Martin', turma: 'Inglês 3 - Sábado', data: '03-12' },
  { aluno: 'Diego Albuquerque', turma: 'Espanhol 1 - Tarde', data: '02-04' },
  { aluno: 'Mateo González', turma: 'Espanhol 1 - Tarde', data: '02-04' },
  { aluno: 'Eduarda Nogueira', turma: 'Espanhol 2 - Noite', data: '02-06' },
  { aluno: 'Felipe Araújo', turma: 'Francês 1 - Noite', data: '02-02' },
  { aluno: 'Isabela Martins', turma: 'Francês 1 - Noite', data: '04-20' },
  { aluno: 'Gabriela Rocha', turma: 'Alemão 1 - Noite', data: '02-09' },
  { aluno: 'Lukas Schmidt', turma: 'Alemão 1 - Noite', data: '02-09' },
  { aluno: 'Heitor Carvalho', turma: 'Italiano 1 - Sábado', data: '02-07' },
  { aluno: 'Martina Rossi', turma: 'Italiano 1 - Sábado', data: '02-07' },
];

/** Rematrículas para o ano atual (nível + 1). John, Sophie, Martina e Mateo ficam como sugestões de rematrícula. */
export const REMATRICULAS: RematriculaSeed[] = [
  { aluno: 'Ana Beatriz Souza', turma: 'Inglês 2 - Manhã' },
  { aluno: 'Bruno Henrique Lima', turma: 'Inglês 3 - Noite' },
  { aluno: 'Carla Mendes', turma: 'Inglês 4 - Sábado' },
  { aluno: 'Diego Albuquerque', turma: 'Espanhol 2 - Tarde' },
  { aluno: 'Eduarda Nogueira', turma: 'Espanhol 3 - Noite' },
  { aluno: 'Felipe Araújo', turma: 'Francês 2 - Noite' },
  { aluno: 'Isabela Martins', turma: 'Francês 2 - Noite' },
  { aluno: 'Gabriela Rocha', turma: 'Alemão 2 - Noite' },
  { aluno: 'Lukas Schmidt', turma: 'Alemão 2 - Noite' },
  { aluno: 'Heitor Carvalho', turma: 'Italiano 2 - Sábado' },
];

export const MATRICULAS_ATUAL: MatriculaSeed[] = [
  { aluno: 'João Pedro Ribeiro', turma: 'Inglês 1 - Manhã', data: '02-02' },
  { aluno: 'Larissa Teixeira', turma: 'Inglês 1 - Manhã', data: '02-03' },
  { aluno: 'Valentina López', turma: 'Inglês 1 - Manhã', data: '02-05' },
  { aluno: 'Haruto Tanaka', turma: 'Inglês 2 - Manhã', data: '02-04' },
  { aluno: 'Ana Beatriz Souza', turma: 'Espanhol 1 - Tarde', data: '03-02' },
  { aluno: 'Marcelo Pires', turma: 'Espanhol 1 - Tarde', data: '02-06' },
  { aluno: 'Emily Johnson', turma: 'Espanhol 1 - Tarde', data: '02-06' },
  { aluno: 'Natália Freitas', turma: 'Francês 1 - Noite', data: '02-02' },
  { aluno: 'Camila Muñoz', turma: 'Francês 1 - Noite', data: '05-18' },
  { aluno: 'Paula Moreira', turma: 'Alemão 1 - Noite', data: '02-09' },
  { aluno: 'Carla Mendes', turma: 'Italiano 1 - Sábado', data: '08-15' },
];

/** Alunos com mensalidades do ano atual em aberto: quantas das últimas vencidas ficam sem pagar. */
export const ATRASOS_ATUAL: Record<string, number> = { 'Marcelo Pires': 3, 'Valentina López': 2, 'Emily Johnson': 1 };
/** Ano anterior: Mateo deixou novembro e dezembro sem pagar (atraso > 90 dias; rematrícula bloqueada). */
export const ATRASOS_ANTERIOR: Record<string, number> = { 'Mateo González': 2 };
/** Matrícula cancelada no ano atual (as mensalidades futuras ficam canceladas). */
export const CANCELAMENTOS: { aluno: string; turma: string }[] = [{ aluno: 'Paula Moreira', turma: 'Alemão 1 - Noite' }];

const FORMAS = ['pix', 'boleto', 'cartao_credito', 'dinheiro', 'transferencia', 'cartao_debito'];

export interface MaterialSeed { titulo: string; tipo: MaterialTipo; idioma: string; nivel: number; autor?: string; referencia?: string; descricao?: string }

export const MATERIAIS: MaterialSeed[] = [
  { titulo: 'English File Beginner', tipo: 'livro', idioma: 'Inglês', nivel: 1, autor: 'Christina Latham-Koenig, Clive Oxenden', referencia: 'Oxford University Press, 4ª ed.', descricao: 'Livro do aluno + workbook (A1).' },
  { titulo: 'English File Elementary', tipo: 'livro', idioma: 'Inglês', nivel: 2, autor: 'Christina Latham-Koenig, Clive Oxenden', referencia: 'Oxford University Press, 4ª ed.' },
  { titulo: 'Apostila de Phrasal Verbs', tipo: 'apostila', idioma: 'Inglês', nivel: 3, autor: 'Coordenação pedagógica', descricao: 'Exercícios de fixação com 150 phrasal verbs frequentes.' },
  { titulo: 'BBC Learning English: 6 Minute English', tipo: 'audio', idioma: 'Inglês', nivel: 4, referencia: 'https://www.bbc.co.uk/learningenglish/english/features/6-minute-english', descricao: 'Podcast semanal para compreensão auditiva.' },
  { titulo: 'English Grammar in Use', tipo: 'livro', idioma: 'Inglês', nivel: 5, autor: 'Raymond Murphy', referencia: 'Cambridge University Press, 5ª ed.' },
  { titulo: 'Aula Internacional Plus 1', tipo: 'livro', idioma: 'Espanhol', nivel: 1, autor: 'Jaime Corpas, Eva García, Agustín Garmendia', referencia: 'Difusión' },
  { titulo: 'Aula Internacional Plus 2', tipo: 'livro', idioma: 'Espanhol', nivel: 2, autor: 'Jaime Corpas, Eva García, Agustín Garmendia', referencia: 'Difusión' },
  { titulo: 'Verbos irregulares em espanhol', tipo: 'apostila', idioma: 'Espanhol', nivel: 2, autor: 'Coordenação pedagógica' },
  { titulo: 'Notícias em espanhol lento', tipo: 'link', idioma: 'Espanhol', nivel: 3, referencia: 'https://www.newsinslowspanish.com', descricao: 'Notícias narradas em velocidade reduzida.' },
  { titulo: 'Alter Ego+ 1', tipo: 'livro', idioma: 'Francês', nivel: 1, autor: 'Annie Berthet et al.', referencia: 'Hachette FLE' },
  { titulo: 'Alter Ego+ 2', tipo: 'livro', idioma: 'Francês', nivel: 2, autor: 'Annie Berthet et al.', referencia: 'Hachette FLE' },
  { titulo: 'Journal en français facile (RFI)', tipo: 'audio', idioma: 'Francês', nivel: 3, referencia: 'https://francaisfacile.rfi.fr', descricao: 'Jornal diário de 10 minutos em francês simples.' },
  { titulo: 'Menschen A1.1', tipo: 'livro', idioma: 'Alemão', nivel: 1, autor: 'Sandra Evans, Angela Pude, Franz Specht', referencia: 'Hueber' },
  { titulo: 'Menschen A1.2', tipo: 'livro', idioma: 'Alemão', nivel: 2, autor: 'Sandra Evans, Angela Pude, Franz Specht', referencia: 'Hueber' },
  { titulo: 'Nicos Weg (DW)', tipo: 'video', idioma: 'Alemão', nivel: 1, referencia: 'https://learngerman.dw.com', descricao: 'Série em vídeo do A1 ao B1.' },
  { titulo: 'Tabela de declinações', tipo: 'apostila', idioma: 'Alemão', nivel: 3, autor: 'Hans Becker' },
  { titulo: 'Nuovo Espresso 1', tipo: 'livro', idioma: 'Italiano', nivel: 1, autor: 'Luciana Ziglio, Giovanna Rizzo', referencia: 'Alma Edizioni' },
  { titulo: 'Nuovo Espresso 2', tipo: 'livro', idioma: 'Italiano', nivel: 2, autor: 'Maria Balì, Giovanna Rizzo', referencia: 'Alma Edizioni' },
  { titulo: 'Canzoni italiane per la classe', tipo: 'audio', idioma: 'Italiano', nivel: 2, autor: 'Giulia Romano', descricao: 'Seleção de músicas com letras e atividades.' },
  { titulo: 'Cartões de vocabulário', tipo: 'outro', idioma: 'Italiano', nivel: 1, autor: 'Coordenação pedagógica', descricao: 'Flashcards impressos (cores, números, família).' },
];

/** "Hoje" da seed, preso ao ano atual da seed (útil quando os testes passam anoAtual diferente do relógio). */
export function hojeDaSeed(anoAtual: number, real: string = hoje()): string {
  if (real < `${anoAtual}-01-01`) return `${anoAtual}-01-01`;
  if (real > `${anoAtual}-12-31`) return `${anoAtual}-12-31`;
  return real;
}

function idDe(mapa: Map<string, number>, chave: string): number {
  const id = mapa.get(chave);
  if (id === undefined) throw new Error(`seed: referência inexistente "${chave}"`);
  return id;
}

/** Paga as mensalidades vencidas da lista de matrículas, deixando sem pagar as `n` últimas de alguns alunos. */
function pagarVencidas(db: Db, ctx: SeedContexto, ano: number, deixarAbertas: Record<string, number>, hojeRef: string): void {
  const abertasPorAluno = new Map<number, number>();
  for (const [nome, n] of Object.entries(deixarAbertas)) abertasPorAluno.set(idDe(ctx.alunos, nome), n);
  const ms = db.all<{ id: number; aluno_id: number; matricula_id: number; vencimento: string }>(
    `SELECT id, aluno_id, matricula_id, vencimento FROM mensalidades
     WHERE status = 'pendente' AND vencimento < ? AND substr(competencia, 1, 4) = ? ORDER BY aluno_id, vencimento DESC`,
    [hojeRef, String(ano)]);
  const abertas = new Map<number, number>();
  for (const m of ms) {
    const limite = abertasPorAluno.get(m.aluno_id) ?? 0;
    const ja = abertas.get(m.aluno_id) ?? 0;
    if (ja < limite) { abertas.set(m.aluno_id, ja + 1); continue; }
    // Alguns pagamentos com atraso (valor atualizado com multa e juros), os demais em dia.
    const atrasado = m.id % 5 === 0 && somarDias(m.vencimento, 4) <= hojeRef;
    const data = atrasado ? somarDias(m.vencimento, 4) : somarDias(m.vencimento, -(m.id % 4));
    pagarMensalidade(db, m.id, { forma_pagamento: FORMAS[m.id % FORMAS.length], data_pagamento: data }, hojeRef);
  }
}

export function seedMatriculas(db: Db, ctx: SeedContexto): void {
  const ano = ctx.anoAtual;
  const anterior = ano - 1;
  const h = hojeDaSeed(ano);
  const turma = (a: number, nome: string) => idDe(ctx.turmas, `${a}|${nome}`);
  const aluno = (nome: string) => idDe(ctx.alunos, nome);
  const dataNoAno = (a: number, mmdd: string) => { const d = `${a}-${mmdd}`; return d > h ? h : d; };

  // Ano anterior: matrículas, pagamentos (com a dívida do Mateo) e rematrículas.
  for (const m of MATRICULAS_ANTERIOR) {
    matricular(db, { aluno_id: aluno(m.aluno), turma_id: turma(anterior, m.turma), data: dataNoAno(anterior, m.data) }, h);
  }
  pagarVencidas(db, ctx, anterior, ATRASOS_ANTERIOR, h);
  for (const r of REMATRICULAS) {
    rematricular(db, { aluno_id: aluno(r.aluno), turma_id_destino: turma(ano, r.turma), ano_letivo: ano, data: `${anterior}-12-05` }, h);
  }
  db.run("UPDATE matriculas SET status = 'concluida' WHERE ano_letivo = ? AND status = 'ativa'", [anterior]);

  // Ano atual: novas matrículas, pagamentos com alguns atrasos e um cancelamento.
  for (const m of MATRICULAS_ATUAL) {
    matricular(db, { aluno_id: aluno(m.aluno), turma_id: turma(ano, m.turma), data: dataNoAno(ano, m.data) }, h);
  }
  pagarVencidas(db, ctx, ano, ATRASOS_ATUAL, h);
  for (const c of CANCELAMENTOS) {
    const id = db.get<{ id: number }>('SELECT id FROM matriculas WHERE aluno_id = ? AND turma_id = ?', [aluno(c.aluno), turma(ano, c.turma)])!.id;
    cancelarMatricula(db, id, h);
  }
}

export function seedMateriais(db: Db, ctx: SeedContexto): void {
  for (const m of MATERIAIS) {
    db.run(
      'INSERT INTO materiais (titulo, tipo, idioma_id, nivel, autor, referencia, descricao) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [m.titulo, m.tipo, idDe(ctx.idiomas, m.idioma), m.nivel, m.autor ?? null, m.referencia ?? null, m.descricao ?? null]);
  }
}
