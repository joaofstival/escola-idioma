import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Download, Undo2, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/page-header';
import { EstadoErro, EstadoVazio, TabelaCarregando } from '@/components/estados';
import { ConfirmarApagar, type AlvoApagar } from '@/components/confirmar-apagar';
import { FiltroSelect } from '@/components/filtro-select';
import { StatusBadge, type Tom } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useQuery } from '@/hooks/use-query';
import { api, mensagemErro } from '@/lib/api';
import { brl, competencia as fmtCompetencia, data as fmtData } from '@/lib/format';
import { diasTxt, gerarCsv, hojeLocal, rotuloForma, ROTULO_STATUS, statusExibido } from '@/lib/financeiro';
import { cn } from '@/lib/utils';
import { FinanceiroResumo } from './financeiro-resumo';
import { PagamentoDialog } from './pagamento-dialog';
import type { Inadimplente, Mensalidade } from '../../shared/types.ts';

const STATUS = [
  { valor: 'todas', rotulo: 'Todas' },
  { valor: 'pendente', rotulo: 'Em aberto' },
  { valor: 'paga', rotulo: 'Pagas' },
  { valor: 'atrasada', rotulo: 'Atrasadas' },
  { valor: 'cancelada', rotulo: 'Canceladas' },
];
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const TOM_STATUS: Record<ReturnType<typeof statusExibido>, Tom> = {
  paga: 'ok',
  pendente: 'info',
  atrasada: 'atencao',
  cancelada: 'neutro',
};

function explicacaoEncargos(m: Mensalidade): string {
  return `Valor original ${brl(m.valor)} + multa de 2% (${brl(m.multa)}) + juros de 1% ao mês pro rata, ${diasTxt(m.dias_atraso)} (${brl(m.juros)}) = ${brl(m.valor_atualizado)}, calculado para hoje.`;
}

export default function Financeiro() {
  const [params, setParams] = useSearchParams();
  const anoAtual = Number(hojeLocal().slice(0, 4));
  const [anoResumo, setAnoResumo] = useState(anoAtual);
  const [versao, setVersao] = useState(0);
  const [pagando, setPagando] = useState<Mensalidade | null>(null);
  const [estornando, setEstornando] = useState<Mensalidade | null>(null);

  const status = STATUS.some((s) => s.valor === params.get('status')) ? params.get('status')! : 'todas';
  const aluno = /^\d+$/.test(params.get('aluno_id') ?? '') ? params.get('aluno_id')! : 'todos';
  const ano = params.get('ano') ?? String(anoResumo);
  const mes = ano === 'todos' ? 'todos' : /^(0[1-9]|1[0-2])$/.test(params.get('mes') ?? '') ? params.get('mes')! : 'todos';
  const aba = params.get('aba') === 'inadimplentes' ? 'inadimplentes' : 'mensalidades';

  function mudar(novo: Record<string, string | null>) {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(novo)) {
      if (
        v === null ||
        v === '' ||
        v === 'todas' ||
        v === 'todos' ||
        (k === 'ano' && v === String(anoResumo)) ||
        (k === 'aba' && v === 'mensalidades')
      )
        p.delete(k);
      else p.set(k, v);
    }
    setParams(p, { replace: true });
  }

  const anos = useMemo(() => {
    const l: number[] = [];
    for (let a = anoAtual + 1; a >= anoAtual - 3; a--) l.push(a);
    if (!l.includes(anoResumo)) l.push(anoResumo);
    return l.sort((a, b) => b - a);
  }, [anoAtual, anoResumo]);

  const lista = useQuery(
    () =>
      api.get<Mensalidade[]>('/mensalidades', {
        status: status === 'todas' ? undefined : status,
        aluno_id: aluno === 'todos' ? undefined : aluno,
        ano: ano !== 'todos' && mes === 'todos' ? ano : undefined,
        competencia: ano !== 'todos' && mes !== 'todos' ? `${ano}-${mes}` : undefined,
      }),
    [status, aluno, ano, mes, versao],
  );
  const inad = useQuery(() => api.get<Inadimplente[]>('/financeiro/inadimplentes'), [versao]);
  const alunos = useQuery(() => api.get<{ id: number; nome: string }[]>('/alunos'), []);

  const recarregar = () => setVersao((v) => v + 1);
  const algumFiltro = status !== 'todas' || aluno !== 'todos' || mes !== 'todos' || ano !== String(anoResumo);
  const limpar = () => mudar({ status: null, aluno_id: null, mes: null, ano: null });

  async function estornar(m: Mensalidade, confirmado: boolean) {
    try {
      await api.post(`/mensalidades/${m.id}/estornar`);
      toast.success(confirmado ? `Pagamento estornado — ${m.aluno_nome ?? ''}, ${fmtCompetencia(m.competencia)}` : 'Pagamento desfeito');
      recarregar();
    } catch (err) {
      toast.error(mensagemErro(err));
    }
  }

  async function exportar() {
    if (!lista.data?.length) return;
    try {
      const caminho = await api.saveFile('mensalidades.csv', gerarCsv(lista.data));
      if (caminho) toast.success(`${lista.data.length} mensalidades exportadas para ${caminho}`);
    } catch (err) {
      toast.error(mensagemErro(err));
    }
  }

  const alvoEstorno: AlvoApagar | null = estornando
    ? {
        tipo: 'pagamento',
        nome: `${estornando.aluno_nome ?? 'aluno'} — ${fmtCompetencia(estornando.competencia)}`,
        aviso: `Estornar o pagamento de ${brl(estornando.valor_pago)}? A mensalidade volta a ficar em aberto e, se já venceu, volta a contar atraso.`,
      }
    : null;

  const itens = lista.data ?? [];
  const ativas = itens.filter((m) => m.status !== 'cancelada');
  const somaValor = ativas.reduce((s, m) => s + m.valor, 0);
  const somaAtual = ativas.reduce((s, m) => s + (m.status === 'paga' ? (m.valor_pago ?? 0) : m.valor_atualizado), 0);

  return (
    <>
      <PageHeader title="Mensalidades" description="Multa de 2% e juros de 1% ao mês pro rata sobre mensalidades vencidas.">
        <FiltroSelect
          rotulo="Ano do resumo"
          valor={String(anoResumo)}
          className="w-28"
          aoMudar={(v) => {
            setAnoResumo(Number(v));
            mudar({ ano: null, mes: null });
          }}
          opcoes={anos.map((a) => ({ valor: String(a), rotulo: String(a) }))}
        />
      </PageHeader>

      <div className="space-y-8">
        <FinanceiroResumo
          ano={anoResumo}
          versao={versao}
          mesAtivo={ano !== 'todos' && mes !== 'todos' ? `${ano}-${mes}` : null}
          aoEscolherMes={(c) => {
            const [a, mm] = c.split('-');
            mudar({ ano: a, mes: ano === a && mes === mm ? null : mm, aba: 'mensalidades' });
          }}
          aoVerAtrasadas={() => mudar({ status: 'atrasada', aluno_id: null, mes: null, ano: null, aba: 'mensalidades' })}
        />

        <Tabs value={aba} onValueChange={(v) => mudar({ aba: v })}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <TabsList>
              <TabsTrigger value="mensalidades">Mensalidades</TabsTrigger>
              <TabsTrigger value="inadimplentes">Inadimplentes{inad.data?.length ? ` (${inad.data.length})` : ''}</TabsTrigger>
            </TabsList>
            {aba === 'mensalidades' && (
              <Button variant="outline" onClick={exportar} disabled={!itens.length} title="Exporta a tabela com os filtros atuais">
                <Download aria-hidden="true" />
                Exportar CSV
              </Button>
            )}
          </div>

          <TabsContent value="mensalidades" className="mt-4 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <FiltroSelect rotulo="Situação" valor={status} aoMudar={(v) => mudar({ status: v })} opcoes={STATUS} className="w-40" />
              <FiltroSelect
                rotulo="Aluno"
                valor={aluno}
                aoMudar={(v) => mudar({ aluno_id: v })}
                className="w-56"
                opcoes={[
                  { valor: 'todos', rotulo: 'Todos os alunos' },
                  ...(alunos.data ?? []).map((a) => ({ valor: String(a.id), rotulo: a.nome })),
                ]}
              />
              <FiltroSelect
                rotulo="Ano"
                valor={ano}
                aoMudar={(v) => mudar({ ano: v, mes: v === 'todos' ? null : mes })}
                className="w-32"
                opcoes={[{ valor: 'todos', rotulo: 'Todos os anos' }, ...anos.map((a) => ({ valor: String(a), rotulo: String(a) }))]}
              />
              <FiltroSelect
                rotulo="Mês"
                valor={mes}
                aoMudar={(v) => mudar({ mes: v })}
                desabilitado={ano === 'todos'}
                className="w-40"
                opcoes={[
                  { valor: 'todos', rotulo: 'Todos os meses' },
                  ...MESES.map((n, i) => ({ valor: String(i + 1).padStart(2, '0'), rotulo: n })),
                ]}
              />
              {algumFiltro && (
                <Button variant="ghost" onClick={limpar}>
                  Limpar filtros
                </Button>
              )}
            </div>

            {lista.error ? (
              <EstadoErro erro={lista.error} aoRecarregar={lista.reload} titulo="Não foi possível carregar as mensalidades." />
            ) : !lista.loading && itens.length === 0 ? (
              <EstadoVazio
                titulo="Nenhuma mensalidade encontrada com estes filtros."
                descricao="As mensalidades são geradas ao matricular um aluno em uma turma."
              >
                {algumFiltro && (
                  <Button variant="outline" onClick={limpar}>
                    Limpar filtros
                  </Button>
                )}
              </EstadoVazio>
            ) : (
              <div className="rounded-xl border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Aluno</TableHead>
                      <TableHead>Idioma / turma</TableHead>
                      <TableHead>Competência</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead>Situação</TableHead>
                      <TableHead className="text-right">Valor atualizado</TableHead>
                      <TableHead className="w-px">
                        <span className="sr-only">Ações</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  {lista.loading && !lista.data ? (
                    <TabelaCarregando colunas={7} />
                  ) : (
                    <TableBody aria-busy={lista.loading}>
                      {itens.map((m) => {
                        const st = statusExibido(m);
                        return (
                          <TableRow key={m.id} className={cn(st === 'cancelada' && 'text-muted-foreground')}>
                            <TableCell>
                              <Link to={`/alunos/${m.aluno_id}`} className="font-medium text-primary hover:underline">
                                {m.aluno_nome}
                              </Link>
                            </TableCell>
                            <TableCell>
                              {m.idioma_nome ?? '—'}
                              <div className="text-xs text-muted-foreground">{m.turma_nome ?? ''}</div>
                            </TableCell>
                            <TableCell>
                              {fmtCompetencia(m.competencia)}
                              <div className="text-xs text-muted-foreground">vence {fmtData(m.vencimento)}</div>
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{brl(m.valor)}</TableCell>
                            <TableCell>
                              <StatusBadge tom={TOM_STATUS[st]}>
                                {st === 'atrasada' ? `${ROTULO_STATUS[st]} · ${diasTxt(m.dias_atraso)}` : ROTULO_STATUS[st]}
                              </StatusBadge>
                              {st === 'paga' && (
                                <div className="mt-1 text-xs text-muted-foreground">
                                  {fmtData(m.data_pagamento)} · {rotuloForma(m.forma_pagamento)}
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {st === 'cancelada' ? (
                                '—'
                              ) : st === 'paga' ? (
                                <>
                                  {brl(m.valor_pago)}
                                  <div className="text-xs text-muted-foreground">pago</div>
                                </>
                              ) : st === 'atrasada' ? (
                                <button
                                  type="button"
                                  className="text-right tabular-nums"
                                  title={explicacaoEncargos(m)}
                                  aria-label={`${brl(m.valor_atualizado)}. ${explicacaoEncargos(m)}`}
                                >
                                  {brl(m.valor_atualizado)}
                                  <span className="block text-xs text-danger-deep">+{brl(m.multa + m.juros)} encargos</span>
                                </button>
                              ) : (
                                brl(m.valor_atualizado)
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              {m.status === 'pendente' && (
                                <Button
                                  size="sm"
                                  onClick={() => setPagando(m)}
                                  aria-label={`Registrar pagamento de ${m.aluno_nome}, ${fmtCompetencia(m.competencia)}`}
                                >
                                  <Wallet aria-hidden="true" />
                                  Registrar pagamento
                                </Button>
                              )}
                              {m.status === 'paga' && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setEstornando(m)}
                                  aria-label={`Estornar pagamento de ${m.aluno_nome}, ${fmtCompetencia(m.competencia)}`}
                                >
                                  <Undo2 aria-hidden="true" />
                                  Estornar
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  )}
                  {itens.length > 0 && (
                    <TableFooter>
                      <TableRow>
                        <TableCell colSpan={3}>
                          {itens.length} {itens.length === 1 ? 'mensalidade' : 'mensalidades'}
                          {itens.length !== ativas.length
                            ? ` (${itens.length - ativas.length} cancelada${itens.length - ativas.length === 1 ? '' : 's'} fora dos totais)`
                            : ''}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{brl(somaValor)}</TableCell>
                        <TableCell />
                        <TableCell className="text-right tabular-nums">{brl(somaAtual)}</TableCell>
                        <TableCell />
                      </TableRow>
                    </TableFooter>
                  )}
                </Table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="inadimplentes" className="mt-4 space-y-4">
            {inad.error ? (
              <EstadoErro erro={inad.error} aoRecarregar={inad.reload} titulo="Não foi possível carregar os inadimplentes." />
            ) : !inad.loading && !inad.data?.length ? (
              <EstadoVazio titulo="Nenhum aluno com mensalidade em atraso." />
            ) : (
              <>
                <p className="text-muted-foreground">
                  Alunos com atraso em qualquer ano letivo. O indicador “Em atraso” do resumo conta só o ano escolhido. Acima de 90 dias de
                  atraso a cobrança pode ser formalizada (Lei 9.870/99).
                </p>
                <div className="rounded-xl border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Aluno</TableHead>
                        <TableHead>Contato</TableHead>
                        <TableHead className="text-right">Parcelas</TableHead>
                        <TableHead className="text-right">Total original</TableHead>
                        <TableHead className="text-right">Total atualizado</TableHead>
                        <TableHead>Atraso</TableHead>
                        <TableHead className="w-px">
                          <span className="sr-only">Ações</span>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    {inad.loading && !inad.data ? (
                      <TabelaCarregando colunas={7} />
                    ) : (
                      <TableBody>
                        {(inad.data ?? []).map((i) => (
                          <TableRow key={i.aluno_id}>
                            <TableCell>
                              <Link to={`/alunos/${i.aluno_id}`} className="font-medium text-primary hover:underline">
                                {i.aluno_nome}
                              </Link>
                            </TableCell>
                            <TableCell>
                              {i.email ?? '—'}
                              <div className="text-xs text-muted-foreground">{i.telefone ?? ''}</div>
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{i.qtd}</TableCell>
                            <TableCell className="text-right tabular-nums">{brl(i.total)}</TableCell>
                            <TableCell className="text-right font-semibold tabular-nums">{brl(i.total_atualizado)}</TableCell>
                            <TableCell>
                              <StatusBadge tom={i.acima_90_dias ? 'perigo' : 'atencao'}>
                                {diasTxt(i.dias_max_atraso)}
                                {i.acima_90_dias ? ' · acima de 90 dias' : ''}
                              </StatusBadge>
                              <div className="mt-1 text-xs text-muted-foreground">desde {fmtData(i.vencimento_mais_antigo)}</div>
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  mudar({ aluno_id: String(i.aluno_id), status: 'atrasada', ano: 'todos', mes: null, aba: 'mensalidades' })
                                }
                              >
                                Ver parcelas
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    )}
                  </Table>
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <PagamentoDialog
        mensalidade={pagando}
        aoFechar={() => setPagando(null)}
        aoPagar={() => {
          setPagando(null);
          recarregar();
        }}
        aoDesfazer={(m) => void estornar(m, false)}
      />
      <ConfirmarApagar
        alvo={alvoEstorno}
        rotuloConfirmar="Estornar pagamento"
        titulo={(a) => `Estornar ${a.tipo} “${a.nome}”?`}
        aoCancelar={() => setEstornando(null)}
        aoConfirmar={() => {
          const m = estornando;
          setEstornando(null);
          if (m) void estornar(m, true);
        }}
      />
    </>
  );
}
