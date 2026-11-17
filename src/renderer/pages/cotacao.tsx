import { useState } from 'react';
import { ArrowRight, RefreshCw, TriangleAlert } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { EstadoErro, TabelaCarregando } from '@/components/estados';
import { FiltroSelect } from '@/components/filtro-select';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useQuery } from '@/hooks/use-query';
import { api, mensagemErro } from '@/lib/api';
import { dinheiro } from '@/lib/format';
import type { Conversao, CotacaoResposta } from '../../shared/types.ts';

const dataHora = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
};
const taxa = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 4, minimumFractionDigits: 2 });

export default function Cotacao() {
  const q = useQuery(() => api.get<CotacaoResposta>('/cotacao'), []);
  const [valor, setValor] = useState('100');
  const [de, setDe] = useState('BRL');
  const [para, setPara] = useState('USD');
  const [conv, setConv] = useState<Conversao | null>(null);
  const [erroConv, setErroConv] = useState<string | null>(null);
  const [convertendo, setConvertendo] = useState(false);

  const moedas = Object.values(q.data?.cotacoes ?? {}).filter((c) => c.moeda !== 'BRL');
  const opcoes = ['BRL', ...moedas.map((c) => c.moeda)].map((m) => ({ valor: m, rotulo: m }));
  const valorNum = Number(valor.trim().replace(',', '.'));
  const erroValor = valor.trim() === '' || !Number.isFinite(valorNum) || valorNum < 0 ? 'Informe um valor numérico maior ou igual a zero.' : null;

  async function converter(e: React.FormEvent) {
    e.preventDefault();
    if (erroValor || convertendo) return;
    setConvertendo(true);
    setErroConv(null);
    try {
      setConv(await api.get<Conversao>('/cotacao/converter', { valor: valorNum, de, para }));
    } catch (err) {
      setConv(null);
      setErroConv(mensagemErro(err));
    } finally {
      setConvertendo(false);
    }
  }

  return (
    <>
      <PageHeader title="Cotação de moedas" description="Valores em reais (BRL). Atualizados a cada hora; sem internet, usa a última cotação guardada.">
        <Button variant="outline" onClick={q.reload} disabled={q.loading}>
          <RefreshCw aria-hidden="true" className={q.loading ? 'animate-spin' : undefined} />Atualizar cotações
        </Button>
      </PageHeader>

      <div className="space-y-8">
        {q.data?.desatualizada && (
          <div role="status" className="flex items-start gap-2 rounded-xl border border-warning-deep/30 bg-warning-soft p-4 text-warning-deep">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p>Cotações desatualizadas: não foi possível consultar o serviço agora, então estes valores vêm da última consulta (até 72 horas atrás). Confira a data antes de usar.</p>
          </div>
        )}
        {q.data && (q.data.indisponiveis?.length ?? 0) > 0 && (
          <p role="status" className="text-muted-foreground">Sem cotação no momento para: {q.data.indisponiveis!.join(', ')}.</p>
        )}

        {q.error && !q.data ? (
          <EstadoErro erro={q.error} aoRecarregar={q.reload} titulo="Não foi possível carregar as cotações." />
        ) : (
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Moeda</TableHead><TableHead className="text-right">1 unidade em reais</TableHead>
                  <TableHead className="text-right">R$ 1 em moeda</TableHead><TableHead className="text-right">Variação no dia</TableHead>
                  <TableHead>Atualizada em</TableHead>
                </TableRow>
              </TableHeader>
              {!q.data ? <TabelaCarregando colunas={5} linhas={6} /> : (
                <TableBody aria-busy={q.loading}>
                  {moedas.map((c) => (
                    <TableRow key={c.moeda}>
                      <TableCell><span className="font-medium">{c.moeda}</span> <span className="text-muted-foreground">{c.nome}</span></TableCell>
                      <TableCell className="text-right tabular-nums">{dinheiro(c.valor_em_brl)}</TableCell>
                      <TableCell className="text-right tabular-nums">{taxa(c.brl_em_moeda)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {c.variacao_pct === null || c.variacao_pct === undefined ? '—' : (
                          <StatusBadge tom={c.variacao_pct > 0 ? 'ok' : c.variacao_pct < 0 ? 'perigo' : 'neutro'}>
                            {c.variacao_pct > 0 ? 'Alta ' : c.variacao_pct < 0 ? 'Queda ' : 'Estável '}
                            {Math.abs(c.variacao_pct).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%
                          </StatusBadge>
                        )}
                      </TableCell>
                      <TableCell>
                        {dataHora(c.atualizado_em)}
                        {c.desatualizada && <StatusBadge tom="aviso" className="ml-2">Desatualizada</StatusBadge>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              )}
            </Table>
          </div>
        )}

        <section aria-labelledby="conv-titulo" className="max-w-2xl space-y-4">
          <h2 id="conv-titulo" className="text-base font-semibold">Converter valor</h2>
          <form onSubmit={converter} noValidate className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="conv-valor">Valor</Label>
              <Input id="conv-valor" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} className="w-36 tabular-nums"
                aria-invalid={erroValor ? true : undefined} aria-describedby={erroValor ? 'conv-valor-erro' : undefined} />
            </div>
            <div className="space-y-1.5"><Label>De</Label><FiltroSelect rotulo="Moeda de origem" valor={de} aoMudar={setDe} opcoes={opcoes} className="w-28" /></div>
            <ArrowRight className="mb-2.5 size-4 text-muted-foreground" aria-hidden="true" />
            <div className="space-y-1.5"><Label>Para</Label><FiltroSelect rotulo="Moeda de destino" valor={para} aoMudar={setPara} opcoes={opcoes} className="w-28" /></div>
            <Button type="submit" disabled={convertendo || !q.data}>{convertendo ? 'Convertendo…' : 'Converter valor'}</Button>
          </form>
          {erroValor && <p id="conv-valor-erro" className="text-sm text-danger-deep">{erroValor}</p>}
          {erroConv && <p role="alert" className="text-sm text-danger-deep">{erroConv}</p>}
          {conv && (
            <div aria-live="polite" className="rounded-xl bg-inset p-4">
              <p className="text-lg font-semibold tabular-nums">{dinheiro(conv.valor, conv.de)} = {dinheiro(conv.resultado, conv.para)}</p>
              <p className="mt-1 text-xs text-muted-foreground">Taxa {taxa(conv.taxa)} · fonte {conv.fonte} · {conv.data ? dataHora(conv.data) : ''}
                {conv.desatualizada && ' · cotação desatualizada'}</p>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
