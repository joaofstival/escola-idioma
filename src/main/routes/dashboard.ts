// GET /dashboard: números do painel inicial (ano e mês correntes segundo services/financeiro.hoje()).
import type { Db } from '../db.ts';
import type { Router } from '../router.ts';
import { arredondar, hoje } from '../services/financeiro.ts';
import type { Dashboard } from '../../shared/types.ts';

export function dashboard(db: Db, hojeRef: string): Dashboard {
  const ano = Number(hojeRef.slice(0, 4));
  const mes = hojeRef.slice(0, 7);
  const r = db.get<Omit<Dashboard, 'ano'>>(
    `SELECT
       (SELECT count(*) FROM alunos WHERE ativo = 1) AS alunos_ativos,
       (SELECT count(*) FROM professores WHERE ativo = 1) AS professores_ativos,
       (SELECT count(*) FROM turmas WHERE ano_letivo = :ano) AS turmas_ano,
       (SELECT count(*) FROM matriculas WHERE ano_letivo = :ano AND status = 'ativa') AS matriculas_ano,
       (SELECT coalesce(sum(valor_pago), 0) FROM mensalidades WHERE status = 'paga' AND substr(data_pagamento, 1, 7) = :mes) AS receita_mes,
       (SELECT coalesce(sum(valor), 0) FROM mensalidades WHERE status = 'pendente' AND competencia = :mes) AS a_receber_mes,
       (SELECT count(DISTINCT aluno_id) FROM mensalidades WHERE status = 'pendente' AND vencimento < :hoje) AS inadimplentes`,
    { ano, mes, hoje: hojeRef },
  )!;
  return { ...r, receita_mes: arredondar(r.receita_mes), a_receber_mes: arredondar(r.a_receber_mes), ano };
}

export function register(router: Router, db: Db): void {
  router.get('/dashboard', () => dashboard(db, hoje()));
}
