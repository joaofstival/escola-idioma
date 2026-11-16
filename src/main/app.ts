// Monta a API: roteador com todas as rotas registradas. Usado pelo main.ts (IPC) e pelos testes.
import type { Db } from './db.ts';
import { Router } from './router.ts';
import * as idiomas from './routes/idiomas.ts';
import * as alunos from './routes/alunos.ts';
import * as professores from './routes/professores.ts';
import * as turmas from './routes/turmas.ts';

/** Módulo de rotas: um arquivo por recurso em routes/, cada um exporta register(router, db). */
export interface RouteModule { register(router: Router, db: Db): void }

/**
 * Recursos registrados. Partes 3 e 4 acrescentam aqui: matriculas, materiais, mensalidades/financeiro,
 * dashboard, cotacao, traducao e avaliacoes.
 */
export const MODULOS: RouteModule[] = [idiomas, alunos, professores, turmas];

export function createApi(db: Db, modulos: RouteModule[] = MODULOS): Router {
  const router = new Router();
  for (const m of modulos) m.register(router, db);
  return router;
}
