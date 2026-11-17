import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { EstadoErro, EstadoVazio } from '@/components/estados';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { useQuery } from '@/hooks/use-query';
import { api, mensagemErro } from '@/lib/api';
import { data as fmtData } from '@/lib/format';
import type { ExportacaoCsv, ResultadoPergunta, ResultadosAvaliacao, RespostaAvaliacao } from '../../shared/types.ts';

const num = (n: number | null | undefined) => (n === null || n === undefined ? '—' : n.toLocaleString('pt-BR', { maximumFractionDigits: 2 }));

function Barras({ itens }: { itens: { rotulo: string; count: number; percent: number }[] }) {
  return (
    <ul className="space-y-2">
      {itens.map((o) => (
        <li key={o.rotulo} className="grid grid-cols-[minmax(0,12rem)_1fr_7rem] items-center gap-3">
          <span className="truncate" title={o.rotulo}>{o.rotulo}</span>
          <span className="h-3 rounded-full bg-inset" aria-hidden="true"><span className="block h-full rounded-full bg-info-deep" style={{ width: `${Math.min(100, o.percent)}%` }} /></span>
          <span className="text-right tabular-nums">{o.count} ({num(o.percent)}%)</span>
        </li>
      ))}
    </ul>
  );
}

function BlocoPergunta({ p }: { p: ResultadoPergunta }) {
  return (
    <section className="space-y-3 rounded-xl border p-4">
      <header>
        <h3 className="font-semibold">{p.title}</h3>
        <p className="text-xs text-muted-foreground">{p.respostas} {p.respostas === 1 ? 'resposta' : 'respostas'}{p.com_porque > 0 ? ` · ${p.com_porque} com justificativa` : ''}</p>
      </header>
      {p.opcoes && <Barras itens={p.opcoes.map((o) => ({ rotulo: o.label, count: o.count, percent: o.percent }))} />}
      {p.type === 'rating' && (
        <>
          <p>Média: <strong className="tabular-nums">{num(p.media)}</strong></p>
          {p.distribuicao && p.respostas > 0 && <Barras itens={p.distribuicao.map((d) => ({ rotulo: `Nota ${d.valor}`, count: d.count, percent: (d.count / p.respostas) * 100 }))} />}
        </>
      )}
      {p.linhas?.map((l) => (
        <div key={l.row_id} className="space-y-1">
          <p className="font-medium">{l.label}{l.media !== null && l.media !== undefined && <span className="ml-2 font-normal text-muted-foreground">média {num(l.media)}</span>}</p>
          <Barras itens={l.opcoes.map((o) => ({ rotulo: o.label, count: o.count, percent: o.percent }))} />
        </div>
      ))}
      {p.textos && (p.textos.length === 0 ? <p className="text-muted-foreground">Sem respostas em texto.</p> : (
        <ul className="space-y-2">
          {p.textos.map((t, i) => <li key={i} className="rounded-lg bg-inset p-3"><span className="block text-xs text-muted-foreground">{t.aluno_nome}</span>{t.texto}</li>)}
        </ul>
      ))}
    </section>
  );
}

export function AvaliacaoResultados({ avaliacaoId, versao }: { avaliacaoId: number; versao: number }) {
  const q = useQuery(() => Promise.all([
    api.get<ResultadosAvaliacao>(`/avaliacoes/${avaliacaoId}/resultados`),
    api.get<RespostaAvaliacao[]>(`/avaliacoes/${avaliacaoId}/respostas`),
  ]), [avaliacaoId, versao]);

  async function exportar() {
    try {
      const x = await api.get<ExportacaoCsv>(`/avaliacoes/${avaliacaoId}/exportar`);
      const caminho = await api.saveFile(x.nome_arquivo, x.csv);
      if (caminho) toast.success(`Respostas exportadas para ${caminho}`);
    } catch (err) {
      toast.error(mensagemErro(err));
    }
  }

  if (q.error) return <EstadoErro erro={q.error} aoRecarregar={q.reload} titulo="Não foi possível carregar os resultados." />;
  if (!q.data) return <div aria-busy="true" className="space-y-3"><Skeleton className="h-20 rounded-xl" /><Skeleton className="h-40 rounded-xl" /></div>;
  const [r, respostas] = q.data;
  if (r.total_respostas === 0) return <EstadoVazio titulo="Ainda não há respostas." descricao="Registre a resposta de um aluno na aba “Registrar resposta”. Os resultados aparecem aqui." />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p><strong className="tabular-nums">{r.total_respostas}</strong> {r.total_respostas === 1 ? 'resposta' : 'respostas'} · nota média <strong className="tabular-nums">{num(r.nota_media)}</strong> (de 0 a 10)</p>
        <Button variant="outline" onClick={() => void exportar()}><Download aria-hidden="true" />Exportar CSV</Button>
      </div>
      {r.perguntas.map((p) => <BlocoPergunta key={p.question_id} p={p} />)}
      <section aria-labelledby="quem-respondeu" className="space-y-2">
        <h3 id="quem-respondeu" className="font-semibold">Quem respondeu</h3>
        <ul className="divide-y rounded-xl border">
          {respostas.map((x) => (
            <li key={x.id} className="flex items-center justify-between px-4 py-2">
              <span>{x.aluno_nome}</span>
              <span className="text-muted-foreground tabular-nums">{fmtData(x.criado_em)} · nota {num(x.score)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
