// GET /cotacao?moedas=USD,EUR e GET /cotacao/converter?valor=&de=&para= (services/cotacao.ts).
import type { Db } from '../db.ts';
import type { Router } from '../router.ts';
import { ValidationError } from '../router.ts';
import { ServicoCotacao, lerMoedas } from '../services/cotacao.ts';

/** Instância usada pelo app (cache compartilhado entre as telas). */
export const servicoCotacao = new ServicoCotacao();

function lerValor(v: string | undefined): number {
  const n = Number((v ?? '').trim().replace(',', '.'));
  if (v === undefined || v.trim() === '' || !Number.isFinite(n) || n < 0 || n > 1e12) {
    throw new ValidationError([`valor inválido: "${v ?? ''}" (informe um número maior ou igual a 0)`], 'Parâmetros inválidos');
  }
  return n;
}

function lerMoeda(v: string | undefined, nome: string, padrao?: string): string {
  if ((v === undefined || v.trim() === '') && padrao) return padrao;
  if (v === undefined || v.trim() === '') throw new ValidationError([`${nome} é obrigatório`], 'Parâmetros inválidos');
  const [m] = lerMoedas(v);
  if (v.includes(',')) throw new ValidationError([`${nome} deve ser uma única moeda`], 'Parâmetros inválidos');
  return m;
}

/** Cria o módulo de rotas sobre um serviço (os testes passam um serviço com fetch falso). */
export function criarRotasCotacao(servico: ServicoCotacao) {
  return {
    register(router: Router, _db: Db): void {
      router.get('/cotacao', ({ query }) => servico.cotacoes(lerMoedas(query.moedas)));
      router.get('/cotacao/converter', ({ query }) => {
        const valor = lerValor(query.valor);
        const de = lerMoeda(query.de, 'de', 'BRL');
        const para = lerMoeda(query.para, 'para');
        return servico.converter(valor, de, para);
      });
    },
  };
}

export const { register } = criarRotasCotacao(servicoCotacao);
