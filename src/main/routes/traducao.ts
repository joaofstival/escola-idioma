// GET /traducao?texto=&de=pt&para=en (services/traducao.ts).
import type { Db } from '../db.ts';
import type { Router } from '../router.ts';
import { ServicoTraducao } from '../services/traducao.ts';

/** Instância usada pelo app (cache compartilhado). */
export const servicoTraducao = new ServicoTraducao();

/** Cria o módulo de rotas sobre um serviço (os testes passam um serviço com fetch falso). */
export function criarRotasTraducao(servico: ServicoTraducao) {
  return {
    register(router: Router, _db: Db): void {
      router.get('/traducao', ({ query }) => servico.traduzir(query.texto, query.de ?? 'pt', query.para));
    },
  };
}

export const { register } = criarRotasTraducao(servicoTraducao);
