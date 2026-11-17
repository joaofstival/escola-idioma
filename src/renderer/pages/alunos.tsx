// Alunos: lista com busca e filtro, cadastro em diálogo, inativar/reativar e detalhe com histórico (#/alunos/:id).
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Pencil, Plus, Power, PowerOff, Search, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import { CampoCheck, CampoSelect, CampoTexto } from '@/components/campos';
import { ConfirmarApagar } from '@/components/confirmar-apagar';
import { EstadoErro, EstadoVazio, TabelaCarregando } from '@/components/estados';
import { BarraFiltros, FiltroSelect } from '@/components/filtros';
import { FormDialog } from '@/components/form-dialog';
import { MenuAcoes } from '@/components/menu-acoes';
import { PageHeader } from '@/components/page-header';
import { StatusBadge, type Tom } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { FormDescription } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useQuery } from '@/hooks/use-query';
import { api, mensagemErro } from '@/lib/api';
import { MOEDAS, brl, competencia, data, dinheiro, nivel, ou } from '@/lib/format';
import { emailOpcional, nuloSeVazio, textoObrigatorio, textoOpcional } from '@/lib/validacao';
import type { Aluno, Conversao, HistoricoAluno, MatriculaStatus, Mensalidade } from '../../shared/types.ts';

// ---------- Formulário ----------

const esquema = z.object({
  nome: textoObrigatorio('o nome completo', 150),
  data_nascimento: z.string(),
  documento: textoOpcional('o documento', 30),
  email: emailOpcional,
  telefone: textoOpcional('o telefone', 30),
  endereco: textoOpcional('o endereço', 300),
  pais_origem: textoOpcional('o país de origem', 60),
  moeda_origem: z.string(),
  ativo: z.boolean(),
});
type Valores = z.infer<typeof esquema>;

function FormAluno({ aluno, aoFechar, aoSalvar }: { aluno: Aluno | null; aoFechar: () => void; aoSalvar: () => void }) {
  const moeda = aluno?.moeda_origem || 'BRL';
  const moedas = MOEDAS.includes(moeda) ? MOEDAS : [...MOEDAS, moeda];
  const form = useForm<Valores>({
    resolver: zodResolver(esquema),
    defaultValues: {
      nome: aluno?.nome ?? '', data_nascimento: aluno?.data_nascimento ?? '', documento: aluno?.documento ?? '',
      email: aluno?.email ?? '', telefone: aluno?.telefone ?? '', endereco: aluno?.endereco ?? '',
      pais_origem: aluno?.pais_origem ?? '', moeda_origem: moeda, ativo: aluno?.ativo ?? true,
    },
  });
  return (
    <FormDialog
      titulo={aluno ? `Editar ${aluno.nome}` : 'Novo aluno'}
      form={form}
      larga
      rotuloSalvar="Salvar aluno"
      aoFechar={aoFechar}
      aoEnviar={async (v) => {
        const corpo = {
          nome: v.nome.trim(), data_nascimento: nuloSeVazio(v.data_nascimento), documento: nuloSeVazio(v.documento),
          email: nuloSeVazio(v.email), telefone: nuloSeVazio(v.telefone), endereco: nuloSeVazio(v.endereco),
          pais_origem: nuloSeVazio(v.pais_origem), moeda_origem: v.moeda_origem, ...(aluno ? { ativo: v.ativo } : {}),
        };
        if (aluno) await api.put(`/alunos/${aluno.id}`, corpo);
        else await api.post('/alunos', corpo);
        toast.success(aluno ? 'Dados do aluno atualizados.' : 'Aluno cadastrado.');
        aoSalvar();
      }}
    >
      <CampoTexto<Valores> nome="nome" rotulo="Nome completo" obrigatorio maxLength={150} className="sm:col-span-2" autoFocus />
      <CampoTexto<Valores> nome="data_nascimento" rotulo="Data de nascimento" type="date" />
      <CampoTexto<Valores> nome="documento" rotulo="Documento (CPF, RNE ou passaporte)" maxLength={30} />
      <CampoTexto<Valores> nome="email" rotulo="E-mail" type="email" maxLength={150} />
      <CampoTexto<Valores> nome="telefone" rotulo="Telefone" type="tel" maxLength={30} />
      <CampoTexto<Valores> nome="endereco" rotulo="Endereço" maxLength={300} className="sm:col-span-2" />
      <CampoTexto<Valores> nome="pais_origem" rotulo="País de origem" maxLength={60} placeholder="Ex.: Brasil, Argentina" />
      <CampoSelect<Valores> nome="moeda_origem" rotulo="Moeda de origem" opcoes={moedas.map((m) => ({ valor: m, rotulo: m }))} />
      <FormDescription className="sm:col-span-2">Para alunos estrangeiros, o histórico mostra as mensalidades também na moeda de origem (cotação do dia).</FormDescription>
      {aluno && <CampoCheck<Valores> nome="ativo" rotulo="Aluno ativo" className="sm:col-span-2" />}
    </FormDialog>
  );
}

/** Inativar pede confirmação; reativar é direto. */
function useAlternarAtivo(aoSalvar: () => void) {
  const [inativar, setInativar] = useState<Aluno | null>(null);
  async function alternar(a: Aluno) {
    try {
      await api.put(`/alunos/${a.id}`, { ativo: !a.ativo });
      toast.success(a.ativo ? `${a.nome} inativado.` : `${a.nome} reativado.`);
      aoSalvar();
    } catch (e) {
      toast.error(mensagemErro(e));
    }
  }
  const pedir = (a: Aluno) => (a.ativo ? setInativar(a) : void alternar(a));
  const dialogo = (
    <ConfirmarApagar
      alvo={inativar && { nome: inativar.nome, tipo: 'aluno', aviso: 'O aluno deixa de aparecer nas matrículas, mas o histórico é mantido.' }}
      titulo={(a) => `Inativar ${a.tipo} “${a.nome}”?`}
      rotuloConfirmar="Inativar aluno"
      aoCancelar={() => setInativar(null)}
      aoConfirmar={() => { if (inativar) void alternar(inativar); setInativar(null); }}
    />
  );
  return { pedir, dialogo };
}

const BadgeAtivo = ({ ativo }: { ativo: boolean }) => <StatusBadge tom={ativo ? 'ok' : 'neutro'}>{ativo ? 'Ativo' : 'Inativo'}</StatusBadge>;

// ---------- Lista ----------

function Lista() {
  const navigate = useNavigate();
  const [texto, setTexto] = useState('');
  const [busca, setBusca] = useState('');
  const [ativo, setAtivo] = useState('true');
  // busca com espera: só consulta 300 ms depois de parar de digitar
  useEffect(() => {
    const t = setTimeout(() => setBusca(texto.trim()), 300);
    return () => clearTimeout(t);
  }, [texto]);

  const lista = useQuery(() => api.get<Aluno[]>('/alunos', { busca, ativo }), [busca, ativo]);
  const [editando, setEditando] = useState<Aluno | 'novo' | null>(null);
  const { pedir, dialogo } = useAlternarAtivo(lista.reload);
  const alunos = lista.data;

  const botaoNovo = (
    <Button onClick={() => setEditando('novo')}>
      <Plus /> Novo aluno
    </Button>
  );

  return (
    <>
      <PageHeader title="Alunos">{botaoNovo}</PageHeader>
      <BarraFiltros total={alunos ? `${alunos.length} aluno(s)` : undefined}>
        <div className="flex flex-col gap-2">
          <Label htmlFor="busca-alunos">Buscar</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground" aria-hidden="true" />
            <Input id="busca-alunos" type="search" className="w-80 pl-9" placeholder="Nome, e-mail, documento ou telefone" value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && setBusca(texto.trim())} />
          </div>
        </div>
        <FiltroSelect rotulo="Situação" valor={ativo} aoMudar={setAtivo} opcoes={[{ valor: 'true', rotulo: 'Ativos' }, { valor: 'false', rotulo: 'Inativos' }, { valor: '', rotulo: 'Todos' }]} />
      </BarraFiltros>

      {lista.error && !alunos ? (
        <EstadoErro erro={lista.error} aoRecarregar={lista.reload} />
      ) : alunos && alunos.length === 0 ? (
        <EstadoVazio titulo={busca ? `Nenhum aluno encontrado para “${busca}”` : 'Nenhum aluno nesta situação'} descricao={busca ? 'Confira a grafia ou mude a situação.' : 'Cadastre um aluno ou mude o filtro de situação.'}>
          {botaoNovo}
        </EstadoVazio>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Aluno</TableHead>
              <TableHead>Documento</TableHead>
              <TableHead>Telefone</TableHead>
              <TableHead>Origem</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead className="w-12"><span className="sr-only">Ações</span></TableHead>
            </TableRow>
          </TableHeader>
          {!alunos ? (
            <TabelaCarregando colunas={6} />
          ) : (
            <TableBody>
              {alunos.map((a) => (
                <TableRow key={a.id} className="cursor-pointer" onClick={() => navigate(`/alunos/${a.id}`)}>
                  <TableCell>
                    <Link to={`/alunos/${a.id}`} className="font-medium text-primary hover:underline" onClick={(e) => e.stopPropagation()}>{a.nome}</Link>
                    {a.email && <div className="text-xs text-muted-foreground">{a.email}</div>}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{ou(a.documento)}</TableCell>
                  <TableCell className="whitespace-nowrap">{ou(a.telefone)}</TableCell>
                  <TableCell>
                    {ou(a.pais_origem)} {a.moeda_origem !== 'BRL' && <StatusBadge tom="info">{a.moeda_origem}</StatusBadge>}
                  </TableCell>
                  <TableCell><BadgeAtivo ativo={a.ativo} /></TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <MenuAcoes
                      item={a.nome}
                      acoes={[
                        { rotulo: 'Ver histórico', icone: UserRound, aoClicar: () => navigate(`/alunos/${a.id}`) },
                        { rotulo: 'Editar aluno', icone: Pencil, aoClicar: () => setEditando(a) },
                        a.ativo
                          ? { rotulo: 'Inativar aluno', icone: PowerOff, destrutiva: true, aoClicar: () => pedir(a) }
                          : { rotulo: 'Reativar aluno', icone: Power, aoClicar: () => pedir(a) },
                      ]}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          )}
        </Table>
      )}

      {editando && <FormAluno aluno={editando === 'novo' ? null : editando} aoFechar={() => setEditando(null)} aoSalvar={lista.reload} />}
      {dialogo}
    </>
  );
}

// ---------- Detalhe / histórico ----------

const STATUS_MAT: Record<MatriculaStatus, [string, Tom]> = {
  ativa: ['Ativa', 'ok'], concluida: ['Concluída', 'info'], cancelada: ['Cancelada', 'neutro'],
};

function StatusMensalidade({ m }: { m: Mensalidade }) {
  if (m.status === 'paga') return <><StatusBadge tom="ok">Paga</StatusBadge><div className="text-xs text-muted-foreground">em {data(m.data_pagamento)}</div></>;
  if (m.status === 'cancelada') return <StatusBadge tom="neutro">Cancelada</StatusBadge>;
  if (m.atrasada) return <><StatusBadge tom="perigo">Atrasada</StatusBadge><div className="text-xs text-danger-deep">{m.dias_atraso} {m.dias_atraso === 1 ? 'dia' : 'dias'} de atraso</div></>;
  return <StatusBadge tom="atencao">A vencer</StatusBadge>;
}

/** Valor que importa em cada situação: pago, atualizado (atrasada) ou original. */
function valorRelevante(m: Mensalidade): number | null {
  if (m.status === 'cancelada') return null;
  if (m.status === 'paga') return m.valor_pago ?? m.valor;
  return m.atrasada ? m.valor_atualizado : m.valor;
}

function Dado({ rotulo, valor }: { rotulo: string; valor: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{rotulo}</dt>
      <dd>{ou(valor)}</dd>
    </div>
  );
}

function Kpi({ rotulo, valor, dica, tom }: { rotulo: string; valor: string; dica?: string; tom?: string }) {
  return (
    <div className="rounded-xl border p-4">
      <div className="text-xs text-muted-foreground">{rotulo}</div>
      <div className={`text-[28px] leading-tight font-semibold tabular-nums ${tom ?? ''}`}>{valor}</div>
      {dica && <div className="text-xs text-muted-foreground">{dica}</div>}
    </div>
  );
}

function Detalhe({ id }: { id: number }) {
  const q = useQuery(() => api.get<HistoricoAluno>(`/alunos/${id}/historico`), [id]);
  const [editando, setEditando] = useState(false);
  const { pedir, dialogo } = useAlternarAtivo(q.reload);
  const h = q.data;
  const moeda = h?.aluno.moeda_origem;
  const estrangeiro = !!moeda && moeda !== 'BRL';
  // cotação do dia: se falhar, só avisa; valores seguem em BRL
  const cot = useQuery(() => (estrangeiro ? api.get<Conversao>('/cotacao/converter', { valor: 1, de: 'BRL', para: moeda }) : Promise.resolve(null)), [estrangeiro, moeda]);
  const taxa = cot.data ? cot.data.taxa || cot.data.resultado : null;
  const conv = (v: number) => (taxa && moeda ? dinheiro(v * taxa, moeda) : null);

  const voltar = (
    <Link to="/alunos" className="mb-4 inline-flex h-9 items-center gap-1 text-primary hover:underline">
      <ArrowLeft className="size-4" aria-hidden="true" /> Voltar para alunos
    </Link>
  );
  if (q.error && !h) return <>{voltar}<EstadoErro erro={q.error} aoRecarregar={q.reload} /></>;
  if (!h) return <>{voltar}<Skeleton className="h-40 w-full" /></>;

  const { aluno, matriculas, resumo } = h;
  const mensalidades = [...h.mensalidades].sort((a, b) => b.competencia.localeCompare(a.competencia) || b.id - a.id);

  return (
    <>
      {voltar}
      <PageHeader title={aluno.nome} description={`Cadastrado em ${data(aluno.criado_em)}`}>
        <BadgeAtivo ativo={aluno.ativo} />
        {estrangeiro && <StatusBadge tom="info">Estrangeiro · {aluno.moeda_origem}</StatusBadge>}
        <Button variant="outline" onClick={() => setEditando(true)}><Pencil /> Editar aluno</Button>
        <Button variant="outline" onClick={() => pedir(aluno)}>{aluno.ativo ? <PowerOff /> : <Power />}{aluno.ativo ? 'Inativar aluno' : 'Reativar aluno'}</Button>
        {aluno.ativo && <Button asChild><Link to={`/matriculas?aba=nova&aluno_id=${aluno.id}`}><Plus /> Nova matrícula</Link></Button>}
      </PageHeader>

      <dl className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Dado rotulo="Data de nascimento" valor={aluno.data_nascimento ? data(aluno.data_nascimento) : null} />
        <Dado rotulo="Documento" valor={aluno.documento} />
        <Dado rotulo="E-mail" valor={aluno.email} />
        <Dado rotulo="Telefone" valor={aluno.telefone} />
        <Dado rotulo="Endereço" valor={aluno.endereco} />
        <Dado rotulo="País de origem" valor={aluno.pais_origem} />
        <Dado rotulo="Moeda de origem" valor={aluno.moeda_origem} />
      </dl>

      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <Kpi rotulo="Pago" valor={brl(resumo.pago)} tom="text-success-deep" dica={conv(resumo.pago) ? `≈ ${conv(resumo.pago)}` : undefined} />
        <Kpi rotulo="A vencer" valor={brl(resumo.pendente)} dica={conv(resumo.pendente) ? `≈ ${conv(resumo.pendente)}` : undefined} />
        <Kpi rotulo="Em atraso (valor original)" valor={brl(resumo.atrasado)} tom={resumo.atrasado ? 'text-danger-deep' : ''} dica={conv(resumo.atrasado) ? `≈ ${conv(resumo.atrasado)}` : undefined} />
      </div>

      <section className="mb-8" aria-labelledby="h-mat">
        <h2 id="h-mat" className="mb-3 text-base font-semibold">Matrículas</h2>
        {matriculas.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">Ano</TableHead><TableHead>Idioma</TableHead><TableHead>Turma</TableHead><TableHead>Nível</TableHead>
                <TableHead>Tipo</TableHead><TableHead>Situação</TableHead><TableHead className="text-right">Data</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...matriculas].sort((a, b) => b.ano_letivo - a.ano_letivo || b.id - a.id).map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="text-right tabular-nums">{m.ano_letivo}</TableCell>
                  <TableCell>{ou(m.idioma_nome)}</TableCell>
                  <TableCell><Link to={`/turmas/${m.turma_id}`} className="text-primary hover:underline">{m.turma_nome || `Turma ${m.turma_id}`}</Link></TableCell>
                  <TableCell>{m.nivel ? nivel(m.nivel) : '—'}</TableCell>
                  <TableCell>{m.tipo === 'rematricula' ? 'Rematrícula' : 'Matrícula'}</TableCell>
                  <TableCell><StatusBadge tom={STATUS_MAT[m.status][1]}>{STATUS_MAT[m.status][0]}</StatusBadge></TableCell>
                  <TableCell className="text-right tabular-nums">{data(m.data)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <EstadoVazio titulo="Este aluno ainda não tem matrículas" />
        )}
      </section>

      <section aria-labelledby="h-mens">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="h-mens" className="text-base font-semibold">Mensalidades</h2>
          {estrangeiro && (
            <span className={`text-xs ${cot.error ? 'text-warning-deep' : 'text-muted-foreground'}`}>
              {cot.loading && !cot.data ? `Convertendo para ${moeda}…` : cot.error || !cot.data || !taxa
                ? `Cotação para ${moeda} indisponível no momento; valores somente em BRL.`
                : `Cotação: 1 BRL = ${dinheiro(taxa, moeda)} · ${cot.data.fonte} · ${data(cot.data.data)}${cot.data.desatualizada ? ' (desatualizada)' : ''}`}
            </span>
          )}
        </div>
        {mensalidades.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Competência</TableHead><TableHead className="text-right">Vencimento</TableHead><TableHead className="text-right">Valor</TableHead>
                <TableHead className="text-right">Pago / atualizado</TableHead>
                {estrangeiro && <TableHead className="text-right">Em {moeda}</TableHead>}
                <TableHead>Situação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mensalidades.map((m) => {
                const rel = valorRelevante(m);
                return (
                  <TableRow key={m.id} className={m.status === 'cancelada' ? 'text-muted-foreground line-through' : ''}>
                    <TableCell title={m.turma_nome}>{competencia(m.competencia)}<div className="text-xs text-muted-foreground">{m.idioma_nome ?? ''}</div></TableCell>
                    <TableCell className="text-right tabular-nums">{data(m.vencimento)}</TableCell>
                    <TableCell className="text-right tabular-nums">{brl(m.valor)}</TableCell>
                    <TableCell className={`text-right tabular-nums ${m.atrasada ? 'text-danger-deep' : ''}`} title={m.atrasada ? `Multa ${brl(m.multa)} + juros ${brl(m.juros)}` : undefined}>
                      {rel === null ? '—' : brl(rel)}
                      {m.atrasada && <div className="text-xs text-muted-foreground">com multa e juros</div>}
                    </TableCell>
                    {estrangeiro && <TableCell className="text-right tabular-nums">{rel === null ? '—' : conv(rel) ?? '—'}</TableCell>}
                    <TableCell><StatusMensalidade m={m} /></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        ) : (
          <EstadoVazio titulo="Nenhuma mensalidade gerada para este aluno" />
        )}
      </section>

      {editando && <FormAluno aluno={aluno} aoFechar={() => setEditando(false)} aoSalvar={q.reload} />}
      {dialogo}
    </>
  );
}

export default function Alunos() {
  const { id } = useParams();
  const n = Number(id);
  return id !== undefined && Number.isInteger(n) && n > 0 ? <Detalhe id={n} /> : <Lista />;
}
