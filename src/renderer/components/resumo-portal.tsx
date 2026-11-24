import { useQuery } from '@/hooks/use-query';
import { api } from '@/lib/api';
import { EstadoErro } from '@/components/estados';
import { Button } from '@/components/ui/button';
import { data } from '@/lib/format';
interface Resumo {
  turmas: number;
  materiais: number;
  atividades: number;
  avisos_nao_lidos: number;
  entregas_pendentes: number | null;
  proxima_aula: { turma_nome: string; data: string; inicio: string; fim: string; local: string } | null;
}
export function ResumoPortal({ abrir }: { abrir: (aba: string) => void }) {
  const q = useQuery(() => api.get<Resumo>('/portal/dashboard'), []);
  if (q.error) return <EstadoErro erro={q.error} aoRecarregar={q.reload} />;
  if (!q.data) return <p>Carregando sua área…</p>;
  const r = q.data;
  return (
    <section className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { valor: r.turmas, texto: 'Turmas vinculadas', aba: 'turmas' },
          { valor: r.materiais, texto: 'Materiais disponíveis', aba: 'biblioteca' },
          { valor: r.atividades, texto: 'Atividades publicadas', aba: 'atividades' },
          { valor: r.avisos_nao_lidos, texto: 'Avisos não lidos', aba: 'comunicacao' },
        ].map((i) => (
          <div key={i.aba} className="rounded-xl border p-5">
            <p className="text-3xl font-semibold">{i.valor}</p>
            <Button variant="link" className="px-0" onClick={() => abrir(i.aba)}>
              {i.texto}
            </Button>
          </div>
        ))}
      </div>
      <article className="rounded-xl border p-5 space-y-2">
        <h2 className="text-lg font-semibold">Próxima aula agendada</h2>
        {r.proxima_aula ? (
          <>
            <p>
              {r.proxima_aula.turma_nome} · {data(r.proxima_aula.data)} · {r.proxima_aula.inicio}–{r.proxima_aula.fim}
            </p>
            <p>{r.proxima_aula.local || 'Local a confirmar'}</p>
          </>
        ) : (
          <p>O calendário ainda não tem uma próxima aula registrada.</p>
        )}
        <Button variant="outline" onClick={() => abrir('agenda')}>
          Ver agenda e frequência
        </Button>
      </article>
      {r.entregas_pendentes !== null && <p>{r.entregas_pendentes} entrega(s) aguardando lançamento de nota nas suas turmas.</p>}
    </section>
  );
}
