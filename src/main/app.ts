// Monta a API: roteador com todas as rotas registradas. Usado pelo main.ts (IPC) e pelos testes.
import type { Db } from './db.ts';
import { Router } from './router.ts';
import * as idiomas from './routes/idiomas.ts';
import * as alunos from './routes/alunos.ts';
import * as professores from './routes/professores.ts';
import * as turmas from './routes/turmas.ts';
import * as matriculas from './routes/matriculas.ts';
import * as materiais from './routes/materiais.ts';
import * as mensalidades from './routes/mensalidades.ts';
import * as historico from './routes/historico.ts';
import * as dashboard from './routes/dashboard.ts';
import * as cotacao from './routes/cotacao.ts';
import * as traducao from './routes/traducao.ts';
import * as avaliacoes from './routes/avaliacoes.ts';

/** Módulo de rotas: um arquivo por recurso em routes/, cada um exporta register(router, db). */
export interface RouteModule { register(router: Router, db: Db): void }

/** Recursos registrados (todos os do contrato da seção 4 do PLANO). */
export const MODULOS: RouteModule[] = [
  idiomas, alunos, professores, turmas, matriculas, materiais, mensalidades, historico, dashboard, cotacao, traducao, avaliacoes,
];

export function createApi(db: Db, modulos: RouteModule[] = MODULOS): Router {
  const router = new Router();
  for (const m of modulos) m.register(router, db);
  return router;
}
