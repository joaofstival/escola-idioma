import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/page-header';
import { EstadoErro } from '@/components/estados';
import { Skeleton } from '@/components/ui/skeleton';
import { useQuery } from '@/hooks/use-query';
import { api } from '@/lib/api';
import { brl } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Dashboard } from '../../shared/types.ts';

function Linha({ rotulo, valor, para, destaque }: { rotulo: string; valor: string; para: string; destaque?: 'perigo' }) {
  return (
    <Link to={para} className="flex items-baseline justify-between gap-4 rounded-lg px-3 py-2 outline-offset-2 hover:bg-inset">
      <dt className="text-muted-foreground">{rotulo}</dt>
      <dd className={cn('text-lg font-semibold tabular-nums', destaque === 'perigo' && 'text-danger-deep')}>{valor}</dd>
    </Link>
  );
}

export default function Painel() {
  const q = useQuery(() => api.get<Dashboard>('/dashboard'), []);
  const d = q.data;
  const mes = new Date().toLocaleDateString('pt-BR', { month: 'long' });
  return (
    <>
      <PageHeader title="Painel" description="Situação da escola hoje." />
      {q.error ? <EstadoErro erro={q.error} aoRecarregar={q.reload} titulo="Não foi possível carregar o painel." /> : !d ? (
        <div aria-busy="true" className="grid gap-8 md:grid-cols-2"><Skeleton className="h-40 rounded-xl" /><Skeleton className="h-40 rounded-xl" /></div>
      ) : (
        <div className="grid items-start gap-8 md:grid-cols-2">
          <section aria-labelledby="fin-mes" className="space-y-2">
            <h2 id="fin-mes" className="text-base font-semibold">Financeiro de {mes}</h2>
            <dl className="divide-y rounded-xl border p-1">
              <Linha rotulo="Recebido no mês" valor={brl(d.receita_mes)} para="/financeiro" />
              <Linha rotulo="A receber no mês" valor={brl(d.a_receber_mes)} para="/financeiro?status=pendente" />
              <Linha rotulo="Alunos inadimplentes" valor={String(d.inadimplentes)} para="/financeiro?aba=inadimplentes" destaque={d.inadimplentes > 0 ? 'perigo' : undefined} />
            </dl>
          </section>
          <section aria-labelledby="esc-ano" className="space-y-2">
            <h2 id="esc-ano" className="text-base font-semibold">Escola em {d.ano}</h2>
            <dl className="divide-y rounded-xl border p-1">
              <Linha rotulo="Alunos ativos" valor={String(d.alunos_ativos)} para="/alunos" />
              <Linha rotulo="Professores ativos" valor={String(d.professores_ativos)} para="/professores" />
              <Linha rotulo="Turmas no ano" valor={String(d.turmas_ano)} para="/turmas" />
              <Linha rotulo="Matrículas no ano" valor={String(d.matriculas_ano)} para="/matriculas" />
            </dl>
          </section>
        </div>
      )}
    </>
  );
}
