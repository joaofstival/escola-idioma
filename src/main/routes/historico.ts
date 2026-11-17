// GET /alunos/:id/historico: matrículas, mensalidades (com encargos calculados) e resumo financeiro do aluno.
import type { Db } from '../db.ts';
import type { Router } from '../router.ts';
import { parseId } from '../validation.ts';
import { arredondar, hoje } from '../services/financeiro.ts';
import { buscarAluno } from './alunos.ts';
import { listarMatriculas } from './matriculas.ts';
import { listarMensalidades } from './mensalidades.ts';
import type { HistoricoAluno } from '../../shared/types.ts';

/** resumo: pago = soma de valor_pago; pendente = a vencer (valor original); atrasado = vencidas (valor original). */
export function historicoAluno(db: Db, alunoId: number, hojeRef: string): HistoricoAluno {
  const aluno = buscarAluno(db, alunoId);
  const matriculas = listarMatriculas(db, { aluno_id: alunoId });
  const mensalidades = listarMensalidades(db, { aluno_id: alunoId }, hojeRef);
  const resumo = { pago: 0, pendente: 0, atrasado: 0 };
  for (const m of mensalidades) {
    if (m.status === 'paga') resumo.pago += m.valor_pago ?? 0;
    else if (m.status === 'pendente') {
      if (m.atrasada) resumo.atrasado += m.valor;
      else resumo.pendente += m.valor;
    }
  }
  return {
    aluno,
    matriculas,
    mensalidades,
    resumo: { pago: arredondar(resumo.pago), pendente: arredondar(resumo.pendente), atrasado: arredondar(resumo.atrasado) },
  };
}

export function register(router: Router, db: Db): void {
  router.get('/alunos/:id/historico', ({ params }) => historicoAluno(db, parseId(params.id, 'Aluno'), hoje()));
}
