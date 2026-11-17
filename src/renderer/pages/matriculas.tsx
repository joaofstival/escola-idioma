// Matrículas: abas "Matrículas do ano" (filtros e cancelamento), "Nova matrícula" e "Rematrículas" (sugestões do ano anterior).
// Aba inicial e pré-seleção pela query: #/matriculas?aba=nova&aluno_id=1&turma_id=2 | ?aba=rematriculas
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CircleCheck, Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import { CampoSelect } from '@/components/campos';
import { ConfirmarApagar } from '@/components/confirmar-apagar';
import { EstadoErro, EstadoVazio, TabelaCarregando } from '@/components/estados';
import { BarraFiltros, FiltroSelect } from '@/components/filtros';
import { MenuAcoes } from '@/components/menu-acoes';
import { Ocupacao } from '@/components/ocupacao';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { StatusMatricula } from '@/components/status-matricula';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useQuery } from '@/hooks/use-query';
import { api, mensagemErro } from '@/lib/api';
import { anoAtual, brl, data, nivel, ou } from '@/lib/format';
import { opcoesAno } from '@/lib/opcoes';
import type { Aluno, Idioma, Matricula, SugestaoRematricula, Turma } from '../../shared/types.ts';

type Aba = 'lista' | 'nova' | 'rematriculas';
const vagas = (t: Pick<Turma, 'capacidade' | 'ocupacao'>) => Math.max(0, t.capacidade - (t.ocupacao ?? 0));

type Mudar = (k: string, v: string) => void;

// ---------- Aba: lista ----------

function AbaLista({ params, mudar }: { params: URLSearchParams; mudar: Mudar }) {
  const ano = params.get('ano') || String(anoAtual());
  const turmaId = params.get('turma_id') ?? '';
  const [status, setStatus] = useState('');
  const turmas = useQuery(() => api.get<Turma[]>('/turmas', { ano }), [ano]);
  const lista = useQuery(() => api.get<Matricula[]>('/matriculas', { ano, turma_id: turmaId, status }), [ano, turmaId, status]);
  const [cancelar, setCancelar] = useState<Matricula | null>(null);
  const mats = lista.data;

  async function confirmarCancelar() {
    const m = cancelar;
    setCancelar(null);
    if (!m) return;
    try {
      const r = await api.put<Matricula>(`/matriculas/${m.id}/cancelar`);
      toast.success(`Matrícula cancelada · ${r.mensalidades_canceladas ?? 0} mensalidade(s) futura(s) cancelada(s).`);
      lista.reload();
    } catch (e) {
      toast.error(mensagemErro(e));
    }
  }

  return (
    <>
      <BarraFiltros total={mats ? `${mats.length} matrícula(s) · ${mats.filter((m) => m.status === 'ativa').length} ativa(s)` : undefined}>
        <FiltroSelect rotulo="Ano letivo" valor={ano} aoMudar={(v) => { mudar('ano', v); mudar('turma_id', ''); }} opcoes={opcoesAno(Number(ano))} />
        <FiltroSelect className="min-w-56" rotulo="Turma" valor={turmaId} aoMudar={(v) => mudar('turma_id', v)} opcoes={[{ valor: '', rotulo: 'Todas as turmas' }, ...(turmas.data ?? []).map((t) => ({ valor: String(t.id), rotulo: t.nome }))]} />
        <FiltroSelect rotulo="Situação" valor={status} aoMudar={setStatus} opcoes={[{ valor: '', rotulo: 'Todas' }, { valor: 'ativa', rotulo: 'Ativas' }, { valor: 'concluida', rotulo: 'Concluídas' }, { valor: 'cancelada', rotulo: 'Canceladas' }]} />
      </BarraFiltros>

      {lista.error && !mats ? (
        <EstadoErro erro={lista.error} aoRecarregar={lista.reload} />
      ) : mats && mats.length === 0 ? (
        <EstadoVazio titulo={`Nenhuma matrícula em ${ano} com esses filtros`} descricao="Ajuste os filtros ou crie uma matrícula.">
          <Button onClick={() => mudar('aba', 'nova')}><Plus /> Nova matrícula</Button>
        </EstadoVazio>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Aluno</TableHead><TableHead>Turma</TableHead><TableHead>Tipo</TableHead>
              <TableHead className="text-right">Data</TableHead><TableHead>Situação</TableHead>
              <TableHead className="w-12"><span className="sr-only">Ações</span></TableHead>
            </TableRow>
          </TableHeader>
          {!mats ? (
            <TabelaCarregando colunas={6} />
          ) : (
            <TableBody>
              {mats.map((m) => (
                <TableRow key={m.id} className={m.status === 'cancelada' ? 'text-muted-foreground' : ''}>
                  <TableCell><Link to={`/alunos/${m.aluno_id}`} className="font-medium text-primary hover:underline">{m.aluno_nome}</Link></TableCell>
                  <TableCell>
                    <Link to={`/turmas/${m.turma_id}`} className="text-primary hover:underline">{m.turma_nome}</Link>
                    <div className="text-xs text-muted-foreground">{m.idioma_nome ?? ''}{m.nivel ? ` · ${nivel(m.nivel)}` : ''}</div>
                  </TableCell>
                  <TableCell>{m.tipo === 'rematricula' ? <StatusBadge tom="info">Rematrícula</StatusBadge> : 'Matrícula'}</TableCell>
                  <TableCell className="text-right tabular-nums">{data(m.data)}</TableCell>
                  <TableCell><StatusMatricula status={m.status} /></TableCell>
                  <TableCell className="text-right">
                    {m.status === 'ativa' && <MenuAcoes item={`${m.aluno_nome} em ${m.turma_nome}`} acoes={[{ rotulo: 'Cancelar matrícula', destrutiva: true, aoClicar: () => setCancelar(m) }]} />}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          )}
        </Table>
      )}

      <ConfirmarApagar
        alvo={cancelar && {
          nome: `${cancelar.aluno_nome} na turma ${cancelar.turma_nome}`, tipo: 'matrícula',
          aviso: 'As mensalidades futuras pendentes serão canceladas. As mensalidades já vencidas continuam devidas e as pagas não mudam.',
        }}
        titulo={(a) => `Cancelar matrícula de ${a.nome}?`}
        rotuloConfirmar="Cancelar matrícula"
        rotuloCancelar="Manter matrícula"
        aoCancelar={() => setCancelar(null)}
        aoConfirmar={() => void confirmarCancelar()}
      />
    </>
  );
}

// ---------- Aba: nova matrícula ----------

const esquemaNova = z.object({
  aluno_id: z.string().min(1, 'Selecione o aluno.'),
  ano_letivo: z.string(),
  turma_id: z.string().min(1, 'Selecione a turma.'),
});
type ValoresNova = z.infer<typeof esquemaNova>;

function AbaNova({ params }: { params: URLSearchParams }) {
  const preTurma = useQuery(() => (params.get('turma_id') ? api.get<Turma>(`/turmas/${Number(params.get('turma_id'))}`).catch(() => null) : Promise.resolve(null)), []);
  const base = useQuery(() => Promise.all([api.get<Aluno[]>('/alunos', { ativo: true }), api.get<Idioma[]>('/idiomas')]), []);
  if (base.error) return <EstadoErro erro={base.error} aoRecarregar={base.reload} />;
  if (!base.data || preTurma.loading) return <div aria-busy="true" className="text-muted-foreground" role="status">Carregando…</div>;
  return <FormNova alunos={base.data[0]} idiomas={base.data[1]} anoInicial={preTurma.data?.ano_letivo ?? anoAtual()} params={params} />;
}

function FormNova({ alunos, idiomas, anoInicial, params }: { alunos: Aluno[]; idiomas: Idioma[]; anoInicial: number; params: URLSearchParams }) {
  const form = useForm<ValoresNova>({
    resolver: zodResolver(esquemaNova),
    defaultValues: { aluno_id: params.get('aluno_id') ?? '', ano_letivo: String(anoInicial), turma_id: params.get('turma_id') ?? '' },
  });
  const ano = form.watch('ano_letivo');
  const turmaSel = form.watch('turma_id');
  const turmasQ = useQuery(() => api.get<Turma[]>('/turmas', { ano }), [ano]);
  const turmas = turmasQ.data ?? [];
  const mensalidade = new Map(idiomas.map((i) => [i.id, i.mensalidade]));
  const t = turmas.find((x) => String(x.id) === turmaSel);
  const [resultado, setResultado] = useState<{ m: Matricula; n: number; valor?: number } | null>(null);

  // trocou o ano: a turma escolhida deixa de valer
  useEffect(() => {
    if (turmaSel && turmasQ.data && !turmasQ.data.some((x) => String(x.id) === turmaSel && vagas(x) > 0)) form.setValue('turma_id', '');
  }, [turmasQ.data]); // eslint-disable-line

  async function enviar(v: ValoresNova) {
    try {
      const m = await api.post<Matricula>('/matriculas', { aluno_id: Number(v.aluno_id), turma_id: Number(v.turma_id), ano_letivo: Number(v.ano_letivo) });
      const alvo = turmas.find((x) => x.id === m.turma_id);
      const n = m.mensalidades_geradas ?? 0;
      setResultado({ m, n, valor: alvo ? mensalidade.get(alvo.idioma_id) : undefined });
      toast.success(`Matrícula realizada · ${n} mensalidade(s) gerada(s).`);
      form.setValue('aluno_id', '');
      turmasQ.reload();
    } catch (e) {
      toast.error(mensagemErro(e));
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(enviar)} noValidate className="flex flex-col gap-4">
          <h2 className="text-base font-semibold">Dados da matrícula</h2>
          <CampoSelect<ValoresNova> nome="aluno_id" rotulo="Aluno" obrigatorio placeholder="Selecione o aluno" opcoes={alunos.map((a) => ({ valor: String(a.id), rotulo: a.nome + (a.documento ? ` · ${a.documento}` : '') }))} />
          <CampoSelect<ValoresNova> nome="ano_letivo" rotulo="Ano letivo" obrigatorio opcoes={opcoesAno(Number(ano))} />
          <CampoSelect<ValoresNova>
            nome="turma_id" rotulo="Turma" obrigatorio disabled={turmasQ.loading && !turmasQ.data}
            placeholder={turmasQ.loading ? 'Carregando turmas…' : turmas.length ? 'Selecione a turma' : 'Nenhuma turma neste ano'}
            opcoes={turmas.map((x) => ({ valor: String(x.id), desabilitada: vagas(x) === 0, rotulo: `${x.nome} — ${vagas(x) ? `${vagas(x)} vaga(s)` : 'lotada'} · ${brl(mensalidade.get(x.idioma_id))}/mês` }))}
          />
          {t && (
            <dl className="grid grid-cols-2 gap-3 rounded-xl border bg-muted p-4">
              <div><dt className="text-xs text-muted-foreground">Idioma e nível</dt><dd>{t.idioma_nome} · {nivel(t.nivel)}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Mensalidade</dt><dd className="font-medium tabular-nums">{brl(mensalidade.get(t.idioma_id))}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Professor</dt><dd>{ou(t.professor_nome)}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Horário</dt><dd>{ou(t.horario)}</dd></div>
              <div className="col-span-2"><dt className="text-xs text-muted-foreground">Vagas</dt><dd className="flex items-center gap-2"><Ocupacao ocupacao={t.ocupacao} capacidade={t.capacidade} /> <span className="text-xs text-muted-foreground">{vagas(t)} vaga(s) livre(s)</span></dd></div>
            </dl>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting && <Loader2 className="animate-spin" aria-hidden="true" />}
              Matricular aluno
            </Button>
            <span className="text-xs text-muted-foreground">As mensalidades do mês atual até dezembro são geradas automaticamente.</span>
          </div>
        </form>
      </Form>

      <div>
        {resultado ? (
          <div role="status" className="flex flex-col gap-3 rounded-xl border border-success-deep/30 bg-success-soft p-4 text-success-deep">
            <h2 className="flex items-center gap-2 text-base font-semibold"><CircleCheck className="size-4" aria-hidden="true" /> Matrícula realizada</h2>
            <p><strong>{resultado.m.aluno_nome}</strong> foi matriculado(a) na turma <strong>{resultado.m.turma_nome}</strong> ({resultado.m.ano_letivo}).</p>
            <p className="tabular-nums"><strong className="text-xl">{resultado.n}</strong> mensalidade(s) gerada(s){resultado.valor !== undefined ? ` de ${brl(resultado.valor)} · total ${brl(resultado.valor * resultado.n)}` : ''}</p>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline"><Link to={`/alunos/${resultado.m.aluno_id}`}>Ver histórico do aluno</Link></Button>
              <Button asChild variant="outline"><Link to={`/financeiro?aluno_id=${resultado.m.aluno_id}`}>Ver mensalidades</Link></Button>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border p-4">
            <h2 className="mb-2 text-base font-semibold">Como funciona</h2>
            <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
              <li>Escolha um aluno ativo e uma turma com vagas.</li>
              <li>O valor de cada mensalidade é o valor fixo do idioma da turma (veja <Link to="/idiomas" className="text-primary hover:underline">Idiomas e valores</Link>).</li>
              <li>Vencimento no dia 10; se a matrícula for depois do dia 10, a 1ª parcela vence em 5 dias.</li>
              <li>Um aluno só pode ter uma matrícula ativa por idioma no ano.</li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Aba: rematrículas ----------

function AbaRematriculas({ params, mudar }: { params: URLSearchParams; mudar: Mudar }) {
  const ano = params.get('ano') || String(anoAtual());
  const q = useQuery(() => Promise.all([
    api.get<SugestaoRematricula[]>('/matriculas/sugestoes-rematricula', { ano }),
    api.get<Turma[]>('/turmas', { ano }),
  ]), [ano]);
  const [destinos, setDestinos] = useState<Record<number, string>>({});
  const [enviando, setEnviando] = useState<number | null>(null);
  const [sugs, turmas] = q.data ?? [undefined, [] as Turma[]];

  // destino padrão = primeira turma sugerida
  useEffect(() => {
    if (sugs) setDestinos(Object.fromEntries(sugs.map((s) => [s.aluno_id, s.turmas_sugeridas[0] ? String(s.turmas_sugeridas[0].id) : ''])));
  }, [q.data]); // eslint-disable-line

  async function rematricular(s: SugestaoRematricula) {
    const destino = destinos[s.aluno_id];
    if (!destino) { toast.error(`Escolha a turma de destino de ${s.aluno_nome}.`); return; }
    setEnviando(s.aluno_id);
    try {
      const m = await api.post<Matricula>('/matriculas/rematricula', { aluno_id: s.aluno_id, turma_id_destino: Number(destino), ano_letivo: Number(ano) });
      toast.success(`${s.aluno_nome} rematriculado(a) em ${m.turma_nome} · ${m.mensalidades_geradas ?? 0} mensalidade(s) gerada(s).`);
      q.reload();
    } catch (e) {
      toast.error(mensagemErro(e));
    }
    setEnviando(null);
  }

  const bloqueados = sugs?.filter((s) => s.inadimplente).length ?? 0;
  return (
    <>
      <div className="mb-4 flex flex-wrap items-end gap-4">
        <FiltroSelect rotulo="Rematricular para o ano" valor={ano} aoMudar={(v) => mudar('ano', v)} opcoes={opcoesAno(Number(ano))} className="[&_button]:w-56" />
        <p className="max-w-xl pb-1 text-xs text-muted-foreground">
          Alunos ativos que estudaram no ano anterior e ainda não foram rematriculados no idioma. A turma sugerida é a do nível seguinte. Alunos com mensalidade em atraso não podem ser rematriculados.
        </p>
      </div>
      {q.error && !sugs ? (
        <EstadoErro erro={q.error} aoRecarregar={q.reload} />
      ) : sugs && sugs.length === 0 ? (
        <EstadoVazio titulo={`Nenhuma rematrícula pendente para ${ano}`} />
      ) : (
        <>
          {sugs && (
            <p className="mb-3" aria-live="polite">
              <strong>{sugs.length}</strong> aluno(s) para rematricular
              {bloqueados > 0 && <> · <span className="text-danger-deep"><strong>{bloqueados}</strong> bloqueado(s) por inadimplência</span></>}
            </p>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Aluno</TableHead><TableHead>Idioma: nível atual → sugerido</TableHead><TableHead>Turma de destino</TableHead>
                <TableHead className="w-44"><span className="sr-only">Ações</span></TableHead>
              </TableRow>
            </TableHeader>
            {!sugs ? (
              <TabelaCarregando colunas={4} />
            ) : (
              <TableBody>
                {sugs.map((s) => {
                  const sugIds = new Set(s.turmas_sugeridas.map((t) => t.id));
                  const outras = turmas.filter((t) => t.idioma_id === s.idioma_id && !sugIds.has(t.id) && vagas(t) > 0).sort((a, b) => a.nivel - b.nivel);
                  const semTurma = !s.turmas_sugeridas.length && !outras.length;
                  return (
                    <TableRow key={s.aluno_id}>
                      <TableCell>
                        <Link to={`/alunos/${s.aluno_id}`} className="font-medium text-primary hover:underline">{s.aluno_nome}</Link>
                        {s.inadimplente && <div title="Há mensalidade em atraso: a rematrícula é bloqueada até a regularização"><StatusBadge tom="perigo">Inadimplente · bloqueada</StatusBadge></div>}
                      </TableCell>
                      <TableCell>
                        <strong>{s.idioma_nome}</strong>
                        <div className="text-xs whitespace-nowrap">{nivel(s.nivel_atual)} <span aria-label="para">→</span> <strong>{nivel(s.nivel_sugerido)}</strong></div>
                      </TableCell>
                      <TableCell>
                        <Select value={destinos[s.aluno_id] || undefined} onValueChange={(v) => setDestinos((d) => ({ ...d, [s.aluno_id]: v }))} disabled={s.inadimplente || semTurma}>
                          <SelectTrigger className="w-72" aria-label={`Turma de destino de ${s.aluno_nome}`}>
                            <SelectValue placeholder={semTurma ? 'Nenhuma turma com vaga' : 'Escolha uma turma'} />
                          </SelectTrigger>
                          <SelectContent>
                            {s.turmas_sugeridas.length > 0 && (
                              <SelectGroup>
                                <SelectLabel>Sugeridas · {nivel(s.nivel_sugerido)}</SelectLabel>
                                {s.turmas_sugeridas.map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.nome} ({vagas(t)} vaga(s))</SelectItem>)}
                              </SelectGroup>
                            )}
                            {outras.length > 0 && (
                              <SelectGroup>
                                <SelectLabel>Outras turmas de {s.idioma_nome}</SelectLabel>
                                {outras.map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.nome} · {nivel(t.nivel)} ({vagas(t)} vaga(s))</SelectItem>)}
                              </SelectGroup>
                            )}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-right">
                        {s.inadimplente ? (
                          <Button asChild variant="outline" size="sm"><Link to={`/financeiro?aluno_id=${s.aluno_id}`}>Regularizar</Link></Button>
                        ) : (
                          <Button size="sm" aria-label={`Rematricular ${s.aluno_nome}`} disabled={enviando === s.aluno_id || semTurma} onClick={() => void rematricular(s)}>
                            {enviando === s.aluno_id && <Loader2 className="animate-spin" aria-hidden="true" />}
                            Rematricular
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            )}
          </Table>
        </>
      )}
    </>
  );
}

// ---------- Página ----------

export default function Matriculas() {
  const [params, setParams] = useSearchParams();
  const abaParam = params.get('aba');
  const aba: Aba = abaParam === 'nova' ? 'nova' : abaParam === 'rematriculas' || abaParam === 'rematricula' ? 'rematriculas' : 'lista';
  const mudar: Mudar = (k, v) => setParams((p) => { const n = new URLSearchParams(p); if (v) n.set(k, v); else n.delete(k); return n; }, { replace: true });
  // trocar de aba limpa os filtros da anterior
  const irPara = (a: string) => setParams(a === 'lista' ? {} : { aba: a }, { replace: true });

  return (
    <>
      <PageHeader title="Matrículas" />
      <Tabs value={aba} onValueChange={irPara} className="gap-4">
        <TabsList aria-label="Seções de matrículas">
          <TabsTrigger value="lista">Matrículas do ano</TabsTrigger>
          <TabsTrigger value="nova">Nova matrícula</TabsTrigger>
          <TabsTrigger value="rematriculas">Rematrículas</TabsTrigger>
        </TabsList>
        {aba === 'lista' && <AbaLista params={params} mudar={mudar} />}
        {aba === 'nova' && <AbaNova params={params} />}
        {aba === 'rematriculas' && <AbaRematriculas params={params} mudar={mudar} />}
      </Tabs>
    </>
  );
}
