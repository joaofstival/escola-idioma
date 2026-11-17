import { useQuery } from '@/hooks/use-query';
import { api } from '@/lib/api';
import { brl } from '@/lib/format';
import { escalaEixo } from '@/lib/financeiro';
import { EstadoErro } from '@/components/estados';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ResumoFinanceiro } from '../../shared/types.ts';

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const MESES_CURTOS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const compacto = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 });

function Indicador({ rotulo, valor, dica, tom }: { rotulo: string; valor: string; dica: React.ReactNode; tom: string }) {
  return (
    <div className={cn('rounded-xl border border-l-4 bg-card p-4', tom)}>
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{valor}</p>
      <p className="mt-1 text-xs text-muted-foreground">{dica}</p>
    </div>
  );
}

/** KPIs do ano e gráfico previsto × recebido; clicar num mês filtra a tabela. */
export function FinanceiroResumo({
  ano, mesAtivo, aoEscolherMes, aoVerAtrasadas, versao,
}: { ano: number; mesAtivo: string | null; aoEscolherMes: (competencia: string) => void; aoVerAtrasadas: () => void; versao: number }) {
  const q = useQuery(() => api.get<ResumoFinanceiro>('/financeiro/resumo', { ano }), [ano, versao]);

  if (q.error) return <EstadoErro erro={q.error} aoRecarregar={q.reload} titulo="Não foi possível carregar o resumo." />;
  if (!q.data) {
    return (
      <div aria-busy="true" className="grid gap-4 md:grid-cols-3">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
      </div>
    );
  }
  const r = q.data;
  const previstoTotal = r.por_mes.reduce((s, m) => s + m.previsto, 0);
  const pct = previstoTotal > 0 ? Math.round((r.recebido / previstoTotal) * 100) : 0;
  const n = r.alunos_inadimplentes.length;
  const max = Math.max(0, ...r.por_mes.map((m) => Math.max(m.previsto, m.recebido)));
  const { topo, passo } = escalaEixo(max);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <Indicador rotulo="Recebido" valor={brl(r.recebido)} tom="border-l-success-deep"
          dica={previstoTotal > 0 ? `${pct}% do previsto no ano (${brl(previstoTotal)})` : 'Nada previsto para o ano'} />
        <Indicador rotulo="A receber" valor={brl(r.a_receber)} tom="border-l-info-deep" dica="Em aberto, ainda no prazo" />
        <Indicador rotulo="Em atraso" valor={brl(r.em_atraso)} tom="border-l-danger-deep"
          dica={n > 0 ? (
            <>{n} {n === 1 ? 'aluno' : 'alunos'} em {r.ano} · <Button variant="link" className="h-auto p-0 text-xs" onClick={aoVerAtrasadas}>Ver mensalidades atrasadas</Button></>
          ) : `Nenhum aluno em atraso em ${r.ano}`} />
      </div>

      <section aria-labelledby="grafico-titulo" className="rounded-xl border bg-card p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 id="grafico-titulo" className="text-base font-semibold">Previsto × recebido por mês</h2>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><i className="size-3 rounded-sm bg-info-soft ring-1 ring-info-deep/40" />Previsto</span>
            <span className="flex items-center gap-1.5"><i className="size-3 rounded-sm bg-success-deep" />Recebido</span>
          </div>
        </div>
        {topo === 0 ? (
          <p className="py-8 text-center text-muted-foreground">Sem mensalidades com competência em {r.ano}.</p>
        ) : (
          <div role="group" aria-label={`Previsto e recebido por mês em ${r.ano}`} className="relative ml-14 h-44">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="absolute inset-x-0 border-t border-border" style={{ bottom: `${(i / 4) * 100}%` }}>
                <span className="absolute -top-2 -left-14 w-12 text-right text-xs text-muted-foreground tabular-nums">{i === 0 ? 'R$ 0' : compacto.format(passo * i)}</span>
              </div>
            ))}
            <div className="absolute inset-0 flex items-stretch gap-1">
              {r.por_mes.map((m) => {
                const idx = Number(m.competencia.slice(5, 7)) - 1;
                const rotulo = `${MESES[idx]}/${m.competencia.slice(0, 4)}: previsto ${brl(m.previsto)}, recebido ${brl(m.recebido)}`;
                const ativo = mesAtivo === m.competencia;
                return (
                  <button key={m.competencia} type="button" onClick={() => aoEscolherMes(m.competencia)} aria-pressed={ativo}
                    aria-label={`${rotulo}. Filtrar a tabela por este mês`} title={rotulo}
                    className={cn('group relative flex flex-1 items-end justify-center gap-0.5 rounded-sm px-0.5 pb-0 outline-offset-2 hover:bg-accent', ativo && 'bg-accent')}>
                    <span className="w-2/5 max-w-4 rounded-t-sm bg-info-soft ring-1 ring-info-deep/40" style={{ height: `${(m.previsto / topo) * 100}%` }} />
                    <span className="w-2/5 max-w-4 rounded-t-sm bg-success-deep" style={{ height: `${(m.recebido / topo) * 100}%` }} />
                    <span className="absolute -bottom-6 text-xs text-muted-foreground">{MESES_CURTOS[idx]}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <div className="h-6" aria-hidden="true" />
      </section>
    </div>
  );
}
