import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/page-header';
import { EstadoErro } from '@/components/estados';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useQuery } from '@/hooks/use-query';
import { api, mensagemErro } from '@/lib/api';
import { AvaliacaoEditor, type TurmaOpcao } from './avaliacao-editor';
import { PerguntaParticipante } from './avaliacao-formulario';
import { AvaliacaoResponder } from './avaliacao-responder';
import { AvaliacaoResultados } from './avaliacao-resultados';
import type { Avaliacao, EvaluationForm, ModeloAvaliacao } from '../../shared/types.ts';

function Previa({ form }: { form: EvaluationForm }) {
  return (
    <div className="max-w-3xl space-y-6">
      <p className="rounded-xl bg-inset p-3 text-muted-foreground">Prévia: assim o aluno vê a avaliação. Nada aqui é gravado.</p>
      {form.questions.map((q, i) => (
        <Previa1 key={q.id} q={q} i={i} />
      ))}
    </div>
  );
}
function Previa1({ q, i }: { q: EvaluationForm['questions'][number]; i: number }) {
  const [v, setV] = useState({});
  return <PerguntaParticipante pergunta={q} numero={i + 1} valor={v} aoMudar={setV} />;
}

/** Tela de uma avaliação existente: perguntas, prévia, resposta e resultados. */
export function AvaliacaoDetalhe() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [versao, setVersao] = useState(0);
  const [rascunho, setRascunho] = useState<EvaluationForm | null>(null);
  const q = useQuery(() => api.get<Avaliacao>(`/avaliacoes/${id}`), [id, versao]);
  const turmas = useQuery(() => api.get<TurmaOpcao[]>('/turmas'), []);
  const aba = ['perguntas', 'previa', 'responder', 'resultados'].includes(params.get('aba') ?? '') ? params.get('aba')! : 'perguntas';
  const recarregar = () => setVersao((v) => v + 1);

  async function duplicar(a: Avaliacao) {
    try {
      const copia = await api.post<Avaliacao>(`/avaliacoes/${a.id}/duplicar`, {});
      toast.success(`Criada a cópia “${copia.titulo}”. Ela pode ser editada.`);
      navigate(`/avaliacoes/${copia.id}`);
    } catch (err) {
      toast.error(mensagemErro(err));
    }
  }

  if (q.error)
    return (
      <>
        <PageHeader title="Avaliação" />
        <EstadoErro erro={q.error} aoRecarregar={q.reload} titulo="Não foi possível carregar a avaliação." />
      </>
    );
  if (!q.data || q.data.id !== Number(id) || !turmas.data)
    return (
      <>
        <PageHeader title="Avaliação" />
        <div aria-busy="true" className="space-y-3">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-48 rounded-xl" />
        </div>
      </>
    );
  const a = q.data;

  return (
    <>
      <PageHeader title={a.titulo} description={`Turma ${a.turma_nome ?? '—'}${a.travada ? ' · travada (já tem respostas)' : ''}`}>
        <Button variant="outline" asChild>
          <Link to="/avaliacoes">
            <ArrowLeft aria-hidden="true" />
            Voltar às avaliações
          </Link>
        </Button>
        <Button variant="outline" onClick={() => void duplicar(a)}>
          <Copy aria-hidden="true" />
          Duplicar avaliação
        </Button>
      </PageHeader>
      <Publicacao avaliacao={a} atualizar={recarregar} />
      <Tabs value={aba} onValueChange={(v) => setParams({ aba: v }, { replace: true })}>
        <TabsList>
          <TabsTrigger value="perguntas">Perguntas</TabsTrigger>
          <TabsTrigger value="previa">Ver como participante</TabsTrigger>
          <TabsTrigger value="responder">Registrar resposta</TabsTrigger>
          <TabsTrigger value="resultados">Resultados ({a.total_respostas})</TabsTrigger>
        </TabsList>
        <TabsContent value="perguntas" forceMount className="mt-6 data-[state=inactive]:hidden">
          <AvaliacaoEditor
            key={`${a.id}-${a.total_respostas}`}
            avaliacao={a}
            formInicial={a.form}
            turmas={turmas.data}
            aoSalvar={recarregar}
            aoRascunho={setRascunho}
          />
        </TabsContent>
        <TabsContent value="previa" className="mt-6">
          <Previa form={rascunho ?? a.form} />
        </TabsContent>
        <TabsContent value="responder" className="mt-6">
          <AvaliacaoResponder key={a.id} avaliacao={a} aoResponder={recarregar} />
        </TabsContent>
        <TabsContent value="resultados" className="mt-6">
          <AvaliacaoResultados avaliacaoId={a.id} versao={versao} />
        </TabsContent>
      </Tabs>
    </>
  );
}

/** Nova avaliação: começa por um modelo pronto ou em branco. */
export function AvaliacaoNova() {
  const modelos = useQuery(() => api.get<ModeloAvaliacao[]>('/avaliacoes/modelos'), []);
  const turmas = useQuery(() => api.get<TurmaOpcao[]>('/turmas'), []);
  const [escolha, setEscolha] = useState<ModeloAvaliacao | 'branco' | null>(null);

  if (modelos.error || turmas.error)
    return (
      <>
        <PageHeader title="Nova avaliação" />
        <EstadoErro
          erro={(modelos.error ?? turmas.error)!}
          aoRecarregar={() => {
            modelos.reload();
            turmas.reload();
          }}
        />
      </>
    );
  if (!modelos.data || !turmas.data)
    return (
      <>
        <PageHeader title="Nova avaliação" />
        <Skeleton className="h-48 rounded-xl" />
      </>
    );
  if (turmas.data.length === 0) {
    return (
      <>
        <PageHeader title="Nova avaliação" />
        <p className="rounded-xl border border-dashed p-6 text-center text-muted-foreground">
          Cadastre uma turma antes de criar uma avaliação.
        </p>
      </>
    );
  }

  if (!escolha) {
    return (
      <>
        <PageHeader title="Nova avaliação" description="Comece por um modelo pronto (dá para editar tudo) ou por uma avaliação em branco.">
          <Button variant="outline" asChild>
            <Link to="/avaliacoes">
              <ArrowLeft aria-hidden="true" />
              Voltar às avaliações
            </Link>
          </Button>
        </PageHeader>
        <ul className="grid gap-4 md:grid-cols-2">
          {modelos.data.map((m) => (
            <li key={m.id} className="flex flex-col items-start gap-2 rounded-xl border p-4">
              <h2 className="font-semibold">{m.nome}</h2>
              <p className="flex-1 text-muted-foreground">{m.descricao}</p>
              <p className="text-xs text-muted-foreground">{m.form.questions.length} perguntas</p>
              <Button variant="outline" onClick={() => setEscolha(m)}>
                Usar modelo “{m.nome}”
              </Button>
            </li>
          ))}
          <li className="flex flex-col items-start gap-2 rounded-xl border border-dashed p-4">
            <h2 className="font-semibold">Em branco</h2>
            <p className="flex-1 text-muted-foreground">Monte as perguntas do zero.</p>
            <Button onClick={() => setEscolha('branco')}>Começar em branco</Button>
          </li>
        </ul>
      </>
    );
  }
  const modelo = escolha === 'branco' ? null : escolha;
  return (
    <>
      <PageHeader title="Nova avaliação" description={modelo ? `Baseada no modelo “${modelo.nome}”.` : 'Avaliação em branco.'}>
        <Button variant="outline" onClick={() => setEscolha(null)}>
          <ArrowLeft aria-hidden="true" />
          Trocar modelo
        </Button>
      </PageHeader>
      <AvaliacaoEditor
        formInicial={structuredClone(modelo?.form ?? { questions: [] })}
        tituloInicial={modelo?.nome}
        turmas={turmas.data}
        aoSalvar={() => undefined}
      />
    </>
  );
}

function Publicacao({ avaliacao: a, atualizar }: { avaliacao: Avaliacao; atualizar: () => void }) {
  const [erro, setErro] = useState(''),
    [enviando, setEnviando] = useState(false);
  async function publicar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    setEnviando(true);
    try {
      await api.post(`/avaliacoes/${a.id}/publicar`, { publicada: d.get('publicada') === 'on', finalidade: d.get('finalidade') });
      atualizar();
      setErro('Publicação atualizada.');
    } catch (err) {
      setErro(mensagemErro(err));
    } finally {
      setEnviando(false);
    }
  }
  return (
    <form key={a.id + '-' + a.publicada} onSubmit={publicar} className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border p-3">
      <label htmlFor="finalidade-av">Finalidade</label>
      <select
        id="finalidade-av"
        name="finalidade"
        className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        defaultValue={a.finalidade ?? 'feedback'}
      >
        {[
          ['feedback', 'Feedback'],
          ['autoavaliacao', 'Autoavaliação'],
          ['nivel', 'Avaliação de nível'],
          ['academica', 'Avaliação acadêmica'],
        ].map(([v, r]) => (
          <option key={v} value={v}>
            {r}
          </option>
        ))}
      </select>
      <label className="flex items-center gap-2">
        <input name="publicada" type="checkbox" defaultChecked={!!a.publicada} />
        Disponível aos alunos
      </label>
      <Button variant="outline" disabled={enviando}>
        Atualizar publicação
      </Button>
      {erro && <p role="status">{erro}</p>}
    </form>
  );
}
