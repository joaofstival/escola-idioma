import type { Db } from './db.ts';
import { HttpError } from './router.ts';
import type { Pagina } from '../shared/contracts/paginacao.ts';
export function consultarPagina<T>(
  db: Db,
  sql: string,
  params: Record<string, string | number | boolean>,
  query: Record<string, string>,
): T[] | Pagina<T> {
  if (query.pagina === undefined) return db.all<T>(sql, params);
  const pagina = Number(query.pagina),
    tamanho = Number(query.tamanho ?? 25);
  if (!Number.isSafeInteger(pagina) || pagina < 1 || pagina > 1000000 || !Number.isSafeInteger(tamanho) || tamanho < 1 || tamanho > 100)
    throw new HttpError(422, 'Página ou tamanho inválido');
  const total = db.get<{ n: number }>(`SELECT count(*) n FROM (${sql})`, params)!.n;
  const itens = db.all<T>(sql + ' LIMIT :__limite OFFSET :__offset', { ...params, __limite: tamanho, __offset: (pagina - 1) * tamanho });
  return { itens, total, pagina, tamanho };
}
