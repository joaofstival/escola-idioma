// Etapa da seed da parte 4: uma avaliação de nível com respostas de alunos de uma turma do ano atual
// e um feedback sem respostas (editável). Usa as mesmas funções das rotas.
import type { Db } from './db.ts';
import type { SeedContexto } from './seed.ts';
import { criarAvaliacao, responderAvaliacao } from './routes/avaliacoes.ts';
import { COMPETENCIAS } from './data/modelos-avaliacao.ts';
import type { Answer } from '../shared/types.ts';

export const TURMA_AVALIACAO = 'Inglês 1 - Manhã';
export const TURMA_FEEDBACK = 'Espanhol 1 - Tarde';

/** Notas por competência (na ordem de COMPETENCIAS), recomendação e observação de cada aluno. */
export const RESPOSTAS_NIVEL: { aluno: string; notas: string[]; recomendacao: string; porque?: string; obs?: string }[] = [
  { aluno: 'João Pedro Ribeiro', notas: ['excelente', 'bom', 'excelente', 'bom', 'bom', 'excelente'], recomendacao: 'avancar', obs: 'Muito participativo; ótima pronúncia.' },
  { aluno: 'Larissa Teixeira', notas: ['bom', 'regular', 'bom', 'bom', 'regular', 'bom'], recomendacao: 'avancar' },
  { aluno: 'Valentina López', notas: ['regular', 'precisa_melhorar', 'regular', 'regular', 'precisa_melhorar', 'regular'], recomendacao: 'repetir',
    porque: 'Faltou a muitas aulas no 2º semestre; precisa consolidar o vocabulário básico.', obs: 'Sugerido reforço com a monitoria.' },
];

export function seedAvaliacoes(db: Db, ctx: SeedContexto): void {
  const turma = (nome: string) => ctx.turmas.get(`${ctx.anoAtual}|${nome}`);
  const t1 = turma(TURMA_AVALIACAO);
  const t2 = turma(TURMA_FEEDBACK);
  if (t1 === undefined || t2 === undefined) return;

  const nivel = criarAvaliacao(db, {
    turma_id: t1, modelo_id: 'nivel', titulo: `Avaliação de nível - ${TURMA_AVALIACAO} (${ctx.anoAtual})`,
    descricao: 'Avaliação de fim de ano feita pelo professor, por competência.',
  });
  for (const r of RESPOSTAS_NIVEL) {
    const alunoId = ctx.alunos.get(r.aluno);
    if (alunoId === undefined) continue;
    if (!db.get("SELECT 1 FROM matriculas WHERE aluno_id = ? AND turma_id = ? AND status = 'ativa'", [alunoId, t1])) continue;
    const answers: Answer[] = [
      ...COMPETENCIAS.map((c, i) => ({ question_id: 'competencias', row_id: c.id, option_id: r.notas[i] })),
      { question_id: 'recomendacao', option_id: r.recomendacao, reason: r.porque ?? null },
      ...(r.obs ? [{ question_id: 'observacoes', value_text: r.obs }] : []),
    ];
    responderAvaliacao(db, nivel.id, { aluno_id: alunoId, answers });
  }

  criarAvaliacao(db, {
    turma_id: t2, modelo_id: 'feedback', titulo: `Feedback da turma - ${TURMA_FEEDBACK} (${ctx.anoAtual})`,
    descricao: 'Pesquisa de satisfação dos alunos (ainda sem respostas: o formulário pode ser editado).',
  });
}
