// Turmas: filtros por ano/idioma/nível, tabela com ocupação, cadastro em diálogo (professor filtrado pelo idioma)
// e detalhe em #/turmas/:id com alunos e materiais didáticos.
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Eye, Pencil, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import { CampoSelect, CampoTexto } from '@/components/campos';
import { ConfirmarApagar } from '@/components/confirmar-apagar';
import { EstadoErro, EstadoVazio, TabelaCarregando } from '@/components/estados';
import { BarraFiltros, FiltroSelect } from '@/components/filtros';
import { FormDialog } from '@/components/form-dialog';
import { MenuAcoes } from '@/components/menu-acoes';
import { Ocupacao } from '@/components/ocupacao';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { StatusMatricula } from '@/components/status-matricula';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FormDescription } from '@/components/ui/form';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useQuery } from '@/hooks/use-query';
import { api, mensagemErro } from '@/lib/api';
import { anoAtual, brl, cefr, nivel, ou } from '@/lib/format';
import { TIPO_MATERIAL, opcoesAno, opcoesNivel } from '@/lib/opcoes';
import { nuloSeVazio, paraNumero, textoObrigatorio, textoOpcional } from '@/lib/validacao';
import type { Idioma, Material, Matricula, Professor, Turma } from '../../shared/types.ts';

// ---------- Formulário ----------

const inteiro = (rotulo: string, min: number, max: number) =>
  z.string().refine((v) => {
    const n = paraNumero(v);
    return Number.isInteger(n) && n >= min && n <= max;
  }, `Informe ${rotulo} entre ${min} e ${max}.`);

const esquema = z.object({
  nome: textoObrigatorio('o nome da turma', 80),
  idioma_id: z.string().min(1, 'Escolha o idioma.'),
  nivel: z.string().min(1, 'Escolha o nível.'),
  ano_letivo: inteiro('o ano letivo', 2000, 2100),
  capacidade: inteiro('a capacidade', 1, 500),
  professor_id: z.string(),
  horario: textoOpcional('o horário', 120),
});
type Valores = z.infer<typeof esquema>;

/** Professores que podem dar aula no idioma (ativos e habilitados). O atual da turma é mantido mesmo se inativo. */
function aptos(profs: Professor[], idiomaId: number | null, atual: number | null): Professor[] {
  if (!idiomaId) return [];
  return profs.filter((p) => p.idiomas.some((i) => i.id === idiomaId) && (p.ativo || p.id === atual));
}

function FormTurma({
  turma, idiomas, profs, padrao, aoFechar, aoSalvar,
}: { turma: Turma | null; idiomas: Idioma[]; profs: Professor[]; padrao: { ano?: number; idioma_id?: number }; aoFechar: () => void; aoSalvar: (t: Turma) => void }) {
  const form = useForm<Valores>({
    resolver: zodResolver(esquema),
    defaultValues: {
      nome: turma?.nome ?? '', idioma_id: String(turma?.idioma_id ?? padrao.idioma_id ?? ''), nivel: String(turma?.nivel ?? 1),
      ano_letivo: String(turma?.ano_letivo ?? padrao.ano ?? anoAtual()), capacidade: String(turma?.capacidade ?? 12),
      professor_id: turma?.professor_id ? String(turma.professor_id) : '', horario: turma?.horario ?? '',
    },
  });
  const idiomaId = Number(form.watch('idioma_id')) || null;
  const lista = aptos(profs, idiomaId, turma?.professor_id ?? null);
  const profAtual = form.watch('professor_id');
  // trocou o idioma e o professor escolhido não leciona nele: limpa a escolha
  useEffect(() => {
    if (profAtual && !lista.some((p) => String(p.id) === profAtual)) form.setValue('professor_id', '');
  }, [idiomaId]); // eslint-disable-line

  const opcoesProf = !idiomaId
    ? [{ valor: '', rotulo: 'Escolha o idioma primeiro' }]
    : !lista.length
      ? [{ valor: '', rotulo: 'Nenhum professor habilitado neste idioma' }]
      : [{ valor: '', rotulo: 'Sem professor (definir depois)' }, ...lista.map((p) => ({ valor: String(p.id), rotulo: p.nome + (p.ativo ? '' : ' (inativo)') }))];

  return (
    <FormDialog
      titulo={turma ? `Editar ${turma.nome}` : 'Nova turma'}
      form={form}
      larga
      rotuloSalvar="Salvar turma"
      aoFechar={aoFechar}
      aoEnviar={async (v) => {
        const corpo = {
          nome: v.nome.trim(), idioma_id: Number(v.idioma_id), nivel: Number(v.nivel), ano_letivo: paraNumero(v.ano_letivo),
          capacidade: paraNumero(v.capacidade), professor_id: v.professor_id ? Number(v.professor_id) : null, horario: nuloSeVazio(v.horario),
        };
        const salvo = turma ? await api.put<Turma>(`/turmas/${turma.id}`, corpo) : await api.post<Turma>('/turmas', corpo);
        toast.success(turma ? 'Turma atualizada.' : 'Turma criada.');
        aoSalvar(salvo);
      }}
    >
      <CampoTexto<Valores> nome="nome" rotulo="Nome da turma" obrigatorio maxLength={80} placeholder="Ex.: Inglês 2 - Noite" className="sm:col-span-2" autoFocus />
      <CampoSelect<Valores>
        nome="idioma_id" rotulo="Idioma" obrigatorio placeholder={idiomas.length ? 'Selecione' : 'Cadastre um idioma'}
        opcoes={idiomas.map((i) => ({ valor: String(i.id), rotulo: `${i.nome} · ${brl(i.mensalidade)}/mês` }))}
      />
      <CampoSelect<Valores> nome="nivel" rotulo="Nível" obrigatorio opcoes={opcoesNivel()} />
      <CampoTexto<Valores> nome="ano_letivo" rotulo="Ano letivo" obrigatorio inputMode="numeric" maxLength={4} />
      <CampoTexto<Valores> nome="capacidade" rotulo="Capacidade (vagas)" obrigatorio inputMode="numeric" maxLength={3} />
      <CampoSelect<Valores> nome="professor_id" rotulo="Professor" opcoes={opcoesProf} />
      <CampoTexto<Valores> nome="horario" rotulo="Horário" maxLength={120} placeholder="Ex.: Seg e Qua 19h–20h30" />
      <FormDescription className="sm:col-span-2">
        A lista de professores mostra apenas quem está ativo e habilitado no idioma escolhido.
        {turma?.ocupacao ? ` A capacidade não pode ficar abaixo dos ${turma.ocupacao} alunos matriculados.` : ''}
      </FormDescription>
    </FormDialog>
  );
}

/** Carrega idiomas e professores só quando o formulário abre. */
function AbrirFormTurma({ turma, padrao, aoFechar, aoSalvar }: { turma: Turma | null; padrao: { ano?: number; idioma_id?: number }; aoFechar: () => void; aoSalvar: (t: Turma) => void }) {
  const dados = useQuery(() => Promise.all([api.get<Idioma[]>('/idiomas'), api.get<Professor[]>('/professores')]), []);
  useEffect(() => {
    if (dados.error) {
      toast.error(mensagemErro(dados.error));
      aoFechar();
    }
  }, [dados.error]); // eslint-disable-line
  if (!dados.data) return null;
  return <FormTurma turma={turma} idiomas={dados.data[0]} profs={dados.data[1]} padrao={padrao} aoFechar={aoFechar} aoSalvar={aoSalvar} />;
}

// ---------- Lista ----------

function Lista() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const ano = params.get('ano') || String(anoAtual());
  const idiomaId = params.get('idioma_id') ?? '';
  const nivelF = params.get('nivel') ?? '';
  const professorId = params.get('professor_id') ?? '';
  const mudar = (k: string, v: string) => setParams((p) => { const n = new URLSearchParams(p); if (v) n.set(k, v); else n.delete(k); return n; }, { replace: true });

  const idiomas = useQuery(() => api.get<Idioma[]>('/idiomas'), []);
  const lista = useQuery(() => api.get<Turma[]>('/turmas', { ano, idioma_id: idiomaId, nivel: nivelF, professor_id: professorId }), [ano, idiomaId, nivelF, professorId]);
  const [editando, setEditando] = useState<Turma | 'nova' | null>(null);
  const turmas = lista.data;
  const vagas = turmas?.reduce((s, t) => s + Math.max(0, t.capacidade - (t.ocupacao ?? 0)), 0) ?? 0;

  const botaoNova = (
    <Button onClick={() => setEditando('nova')}>
      <Plus /> Nova turma
    </Button>
  );

  return (
    <>
      <PageHeader title="Turmas">{botaoNova}</PageHeader>
      <BarraFiltros total={turmas ? `${turmas.length} turma(s) · ${vagas} vaga(s) livre(s)` : undefined}>
        <FiltroSelect rotulo="Ano letivo" valor={ano} aoMudar={(v) => mudar('ano', v)} opcoes={opcoesAno(Number(ano))} />
        <FiltroSelect rotulo="Idioma" valor={idiomaId} aoMudar={(v) => mudar('idioma_id', v)} opcoes={[{ valor: '', rotulo: 'Todos os idiomas' }, ...(idiomas.data ?? []).map((i) => ({ valor: String(i.id), rotulo: i.nome }))]} />
        <FiltroSelect rotulo="Nível" valor={nivelF} aoMudar={(v) => mudar('nivel', v)} opcoes={opcoesNivel('Todos os níveis')} />
        {professorId && (
          <Button variant="outline" size="sm" className="mb-0.5" onClick={() => mudar('professor_id', '')}>
            Filtrado por professor <X aria-hidden="true" /> <span className="sr-only">Remover filtro de professor</span>
          </Button>
        )}
      </BarraFiltros>

      {lista.error && !turmas ? (
        <EstadoErro erro={lista.error} aoRecarregar={lista.reload} />
      ) : turmas && turmas.length === 0 ? (
        <EstadoVazio titulo={`Nenhuma turma em ${ano} com esses filtros`} descricao="Ajuste os filtros ou crie uma turma.">
          {botaoNova}
        </EstadoVazio>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Turma</TableHead><TableHead>Idioma</TableHead><TableHead>Nível</TableHead><TableHead>Professor</TableHead>
              <TableHead>Horário</TableHead><TableHead>Ocupação</TableHead>
              <TableHead className="w-12"><span className="sr-only">Ações</span></TableHead>
            </TableRow>
          </TableHeader>
          {!turmas ? (
            <TabelaCarregando colunas={7} />
          ) : (
            <TableBody>
              {turmas.map((t) => (
                <TableRow key={t.id} className="cursor-pointer" onClick={() => navigate(`/turmas/${t.id}`)}>
                  <TableCell>
                    <Link to={`/turmas/${t.id}`} className="font-medium text-primary hover:underline" onClick={(e) => e.stopPropagation()}>{t.nome}</Link>
                    {(t.ocupacao ?? 0) >= t.capacidade && <> <StatusBadge tom="perigo">Lotada</StatusBadge></>}
                  </TableCell>
                  <TableCell><Badge variant="secondary">{t.idioma_nome}</Badge></TableCell>
                  <TableCell className="whitespace-nowrap">{nivel(t.nivel)}</TableCell>
                  <TableCell>{t.professor_nome ?? <span className="text-muted-foreground">Não definido</span>}</TableCell>
                  <TableCell>{ou(t.horario)}</TableCell>
                  <TableCell><Ocupacao ocupacao={t.ocupacao} capacidade={t.capacidade} /></TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <MenuAcoes item={t.nome} acoes={[
                      { rotulo: 'Ver alunos e materiais', icone: Eye, aoClicar: () => navigate(`/turmas/${t.id}`) },
                      { rotulo: 'Editar turma', icone: Pencil, aoClicar: () => setEditando(t) },
                    ]} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          )}
        </Table>
      )}

      {editando && (
        <AbrirFormTurma
          turma={editando === 'nova' ? null : editando}
          padrao={{ ano: Number(ano), idioma_id: Number(idiomaId) || undefined }}
          aoFechar={() => setEditando(null)}
          aoSalvar={(t) => { if (String(t.ano_letivo) !== ano) mudar('ano', String(t.ano_letivo)); lista.reload(); }}
        />
      )}
    </>
  );
}

// ---------- Detalhe ----------

function Dado({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{rotulo}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Detalhe({ id }: { id: number }) {
  const navigate = useNavigate();
  const q = useQuery(() => api.get<Turma>(`/turmas/${id}`), [id]);
  const mats = useQuery(() => api.get<Material[]>(`/turmas/${id}/materiais`), [id]);
  const matr = useQuery(() => api.get<Matricula[]>('/matriculas', { turma_id: id }), [id]);
  const [editando, setEditando] = useState(false);
  const [apagar, setApagar] = useState(false);
  const turma = q.data;

  const voltar = (
    <Link to={turma ? `/turmas?ano=${turma.ano_letivo}` : '/turmas'} className="mb-4 inline-flex h-9 items-center gap-1 text-primary hover:underline">
      <ArrowLeft className="size-4" aria-hidden="true" /> {turma ? `Voltar para turmas de ${turma.ano_letivo}` : 'Voltar para turmas'}
    </Link>
  );
  if (q.error && !turma) return <>{voltar}<EstadoErro erro={q.error} aoRecarregar={q.reload} /></>;
  if (!turma) return <>{voltar}<Skeleton className="h-40 w-full" /></>;

  const alunos = turma.alunos ?? [];
  const livres = Math.max(0, turma.capacidade - (turma.ocupacao ?? alunos.length));
  const ordem = { ativa: 0, concluida: 1, cancelada: 2 };

  async function excluir() {
    try {
      await api.del(`/turmas/${id}`);
      toast.success(`Turma “${turma!.nome}” apagada.`);
      navigate(`/turmas?ano=${turma!.ano_letivo}`);
    } catch (e) {
      toast.error(mensagemErro(e));
    }
    setApagar(false);
  }

  return (
    <>
      {voltar}
      <PageHeader title={turma.nome} description={`${turma.idioma_nome} · ${nivel(turma.nivel)} · Ano letivo ${turma.ano_letivo}`}>
        <Button variant="outline" onClick={() => setApagar(true)}><Trash2 /> Apagar turma</Button>
        <Button variant="outline" onClick={() => setEditando(true)}><Pencil /> Editar turma</Button>
        {livres > 0 && turma.ano_letivo >= anoAtual() && <Button asChild><Link to={`/matriculas?aba=nova&turma_id=${turma.id}`}><Plus /> Matricular aluno</Link></Button>}
      </PageHeader>

      <dl className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Dado rotulo="Professor">{turma.professor_nome ?? <span className="text-muted-foreground">Não definido</span>}</Dado>
        <Dado rotulo="Horário">{ou(turma.horario)}</Dado>
        <Dado rotulo="Faixa QECR">{cefr(turma.nivel)}</Dado>
        <Dado rotulo="Ocupação">
          <Ocupacao ocupacao={turma.ocupacao} capacidade={turma.capacidade} />
          <span className="text-xs text-muted-foreground">{turma.ano_letivo < anoAtual() ? 'Ano letivo encerrado' : livres ? `${livres} vaga(s) livre(s)` : 'Turma lotada'}</span>
        </Dado>
      </dl>

      <div className="grid gap-8 lg:grid-cols-2">
        <section aria-labelledby="h-alunos">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 id="h-alunos" className="text-base font-semibold">Alunos ({alunos.length} ativo{alunos.length === 1 ? '' : 's'})</h2>
            <Link to={`/matriculas?ano=${turma.ano_letivo}`} className="text-primary hover:underline">Matrículas</Link>
          </div>
          {matr.data ? (
            matr.data.length ? (
              <ul className="divide-y rounded-xl border">
                {[...matr.data].sort((a, b) => ordem[a.status] - ordem[b.status] || String(a.aluno_nome).localeCompare(String(b.aluno_nome))).map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-2 px-4 py-2">
                    <Link to={`/alunos/${m.aluno_id}`} className="text-primary hover:underline">{m.aluno_nome}</Link>
                    <StatusMatricula status={m.status} />
                  </li>
                ))}
              </ul>
            ) : <EstadoVazio titulo="Nenhuma matrícula nesta turma" />
          ) : alunos.length ? (
            <ul className="divide-y rounded-xl border">{alunos.map((a) => <li key={a.id} className="px-4 py-2"><Link to={`/alunos/${a.id}`} className="text-primary hover:underline">{a.nome}</Link></li>)}</ul>
          ) : <EstadoVazio titulo="Nenhum aluno com matrícula ativa nesta turma" />}
        </section>

        <section aria-labelledby="h-mat">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 id="h-mat" className="text-base font-semibold">Materiais didáticos</h2>
            <Link to={`/materiais?idioma_id=${turma.idioma_id}&nivel=${turma.nivel}`} className="text-primary hover:underline">Gerenciar materiais</Link>
          </div>
          {mats.error ? <EstadoErro erro={mats.error} aoRecarregar={mats.reload} titulo="Não foi possível carregar os materiais." />
            : !mats.data ? <Skeleton className="h-24 w-full" />
            : mats.data.length === 0 ? <EstadoVazio titulo={`Nenhum material para ${turma.idioma_nome ?? 'este idioma'} no ${nivel(turma.nivel)}`} />
            : (
              <ul className="divide-y rounded-xl border">
                {mats.data.map((m) => (
                  <li key={m.id} className="flex gap-3 px-4 py-2">
                    <Badge variant="secondary" className="h-fit">{TIPO_MATERIAL[m.tipo] ?? m.tipo}</Badge>
                    <div>
                      <span className="font-medium">{m.titulo}</span>{m.autor && <span className="text-muted-foreground"> · {m.autor}</span>}
                      {m.referencia && <div className="text-xs">{/^https?:\/\//i.test(m.referencia) ? <a href={m.referencia} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{m.referencia}</a> : m.referencia}</div>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
        </section>
      </div>

      {editando && <AbrirFormTurma turma={turma} padrao={{}} aoFechar={() => setEditando(false)} aoSalvar={() => { q.reload(); matr.reload(); }} />}
      <ConfirmarApagar
        alvo={apagar ? { nome: turma.nome, tipo: 'turma', aviso: 'Só é possível se ela não tiver matrículas nem avaliações.' } : null}
        aoCancelar={() => setApagar(false)}
        aoConfirmar={() => void excluir()}
      />
    </>
  );
}

export default function Turmas() {
  const { id } = useParams();
  const n = Number(id);
  return id !== undefined && Number.isInteger(n) && n > 0 ? <Detalhe id={n} /> : <Lista />;
}
