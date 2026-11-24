import { z } from 'zod';
import { HttpError } from '../../main/router.ts';
export class ServicoFerramentas {
  private readonly buscar: typeof fetch;
  constructor(buscar: typeof fetch = fetch) {
    this.buscar = buscar;
  }
  private async json(url: string) {
    try {
      const r = await this.buscar(url, { signal: AbortSignal.timeout(5000), redirect: 'error' });
      if (!r.ok) throw new Error();
      return await r.json();
    } catch {
      throw new HttpError(503, 'Consulta indisponível. Tente novamente; você pode continuar o cadastro manualmente.');
    }
  }
  async cep(entrada: string) {
    const cep = z
      .string()
      .regex(/^\d{8}$/)
      .parse(entrada.replace('-', ''));
    const v = z
      .object({
        erro: z.union([z.boolean(), z.string()]).optional(),
        logradouro: z.string().optional(),
        bairro: z.string().optional(),
        localidade: z.string().optional(),
        uf: z.string().optional(),
      })
      .parse(await this.json(`https://viacep.com.br/ws/${cep}/json/`));
    if (v.erro) throw new HttpError(404, 'CEP não encontrado');
    return { cep, logradouro: v.logradouro ?? '', bairro: v.bairro ?? '', cidade: v.localidade ?? '', uf: v.uf ?? '' };
  }
  async feriados(entrada: string) {
    const ano = z.coerce.number().int().min(1900).max(2199).parse(entrada);
    const itens = z
      .array(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), name: z.string().max(200), type: z.string().optional() }))
      .max(100)
      .parse(await this.json(`https://brasilapi.com.br/api/feriados/v1/${ano}`));
    return {
      ano,
      fonte: 'BrasilAPI',
      abrangencia: 'Feriados nacionais. Confira também o calendário local e o da escola.',
      feriados: itens,
    };
  }
}
