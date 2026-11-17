import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmarApagar } from '@/components/confirmar-apagar';
import { FiltroSelect } from '@/components/filtro-select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { api, mensagemErro } from '@/lib/api';
import { LIMITES, TIPOS, mover, novaPergunta, temErros, validarFormulario, type ErrosForm } from '@/lib/avaliacao';
import { PerguntaEditor } from './avaliacao-pergunta-editor';
import type { Avaliacao, EvaluationForm, Question, QuestionType } from '../../shared/types.ts';

export interface TurmaOpcao { id: number; nome: string }

interface Props {
  /** Avaliação existente; ausente = nova. */
  avaliacao?: Avaliacao;
  formInicial: EvaluationForm;
  tituloInicial?: string;
  turmas: TurmaOpcao[];
  aoSalvar: (a: Avaliacao) => void;
}

/** Editor em lista editada no lugar: um cartão aberto por vez, os demais resumidos. Travado quando já há respostas. */
export function AvaliacaoEditor({ avaliacao, formInicial, tituloInicial, turmas, aoSalvar }: Props) {
  const travada = avaliacao?.travada === true;
  const [titulo, setTitulo] = useState(avaliacao?.titulo ?? tituloInicial ?? '');
  const [descricao, setDescricao] = useState(avaliacao?.descricao ?? '');
  const [turmaId, setTurmaId] = useState(String(avaliacao?.turma_id ?? turmas[0]?.id ?? ''));
  const [perguntas, setPerguntas] = useState<Question[]>(formInicial.questions);
  const [aberta, setAberta] = useState<string | null>(formInicial.questions.length === 0 ? null : formInicial.questions[0].id);
  const [erros, setErros] = useState<ErrosForm | null>(null);
  const [erroServidor, setErroServidor] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [removendo, setRemovendo] = useState<number | null>(null);
  const navigate = useNavigate();

  const form: EvaluationForm = { questions: perguntas };
  const revalidar = (t: string, p: Question[]) => { if (erros) setErros(validarFormulario(t, { questions: p })); };
  const atualizar = (p: Question[]) => { setPerguntas(p); revalidar(titulo, p); };

  function adicionar(tipo: QuestionType) {
    const q = novaPergunta(tipo);
    atualizar([...perguntas, q]);
    setAberta(q.id);
  }

  async function salvar() {
    const e = validarFormulario(titulo, form);
    setErros(e);
    setErroServidor(null);
    if (temErros(e)) {
      const primeira = perguntas.find((q) => e.porPergunta[q.id]);
      if (primeira) setAberta(primeira.id);
      return;
    }
    if (!turmaId) { setErroServidor('Escolha a turma da avaliação.'); return; }
    setSalvando(true);
    try {
      const corpo = { turma_id: Number(turmaId), titulo: titulo.trim(), descricao: descricao.trim() || null, form };
      const salva = avaliacao ? await api.put<Avaliacao>(`/avaliacoes/${avaliacao.id}`, corpo) : await api.post<Avaliacao>('/avaliacoes', corpo);
      toast.success(`Avaliação “${salva.titulo}” salva.`);
      aoSalvar(salva);
      if (!avaliacao) navigate(`/avaliacoes/${salva.id}`, { replace: true });
    } catch (err) {
      setErroServidor(mensagemErro(err));
    } finally {
      setSalvando(false);
    }
  }

  const alvoRemover = removendo !== null ? perguntas[removendo] : null;

  return (
    <div className="space-y-6">
      {travada && (
        <p role="status" className="rounded-xl border border-info-deep/30 bg-info-soft p-4 text-info-deep">
          Esta avaliação já tem {avaliacao!.total_respostas} {avaliacao!.total_respostas === 1 ? 'resposta' : 'respostas'} e não pode mais ser alterada. Para mudar as perguntas, duplique a avaliação.
        </p>
      )}
      <fieldset disabled={travada} className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="av-titulo">Título</Label>
          <Input id="av-titulo" value={titulo} maxLength={150} aria-invalid={erros?.geral.includes('Dê um título à avaliação.') ? true : undefined}
            onChange={(e) => { setTitulo(e.target.value); revalidar(e.target.value, perguntas); }} />
          {erros?.geral.includes('Dê um título à avaliação.') && <p className="text-sm text-danger-deep">Dê um título à avaliação.</p>}
        </div>
        <div className="space-y-1.5">
          <Label>Turma</Label>
          <FiltroSelect rotulo="Turma da avaliação" valor={turmaId} aoMudar={setTurmaId} placeholder="Escolha a turma" className="w-full"
            opcoes={turmas.map((t) => ({ valor: String(t.id), rotulo: t.nome }))} desabilitado={travada} />
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="av-desc">Descrição (opcional)</Label>
          <Textarea id="av-desc" rows={2} value={descricao} maxLength={1000} onChange={(e) => setDescricao(e.target.value)} />
        </div>
      </fieldset>

      <section aria-labelledby="perguntas-titulo" className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 id="perguntas-titulo" className="text-base font-semibold">Perguntas ({perguntas.length} de {LIMITES.perguntasMax})</h2>
        </div>
        {perguntas.length === 0 ? (
          <p className="rounded-xl border border-dashed p-6 text-center text-muted-foreground">Nenhuma pergunta ainda. Escolha um tipo abaixo para começar.</p>
        ) : (
          <ol className="space-y-3">
            {perguntas.map((q, i) => (
              <PerguntaEditor key={q.id} pergunta={q} indice={i} total={perguntas.length} aberta={aberta === q.id} somenteLeitura={travada}
                erros={erros?.porPergunta[q.id] ?? []} aoAbrir={() => setAberta(aberta === q.id ? null : q.id)}
                aoMudar={(nova) => atualizar(perguntas.map((x) => (x.id === q.id ? nova : x)))}
                aoMover={(d) => atualizar(mover(perguntas, i, i + d))} aoRemover={() => setRemovendo(i)} />
            ))}
          </ol>
        )}
        {!travada && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Adicionar pergunta">
            {TIPOS.map((t) => (
              <Button key={t.tipo} type="button" variant="outline" size="sm" disabled={perguntas.length >= LIMITES.perguntasMax} title={t.descricao} onClick={() => adicionar(t.tipo)}>
                <Plus aria-hidden="true" />{t.rotulo}
              </Button>
            ))}
          </div>
        )}
      </section>

      {erros && erros.geral.filter((g) => g !== 'Dê um título à avaliação.').length > 0 && (
        <ul role="alert" className="list-disc space-y-0.5 pl-5 text-sm text-danger-deep">
          {erros.geral.filter((g) => g !== 'Dê um título à avaliação.').map((g) => <li key={g}>{g}</li>)}
        </ul>
      )}
      {erroServidor && <p role="alert" className="rounded-xl border border-danger-deep/30 bg-danger-soft p-4 text-danger-deep">{erroServidor}</p>}
      {!travada && (
        <div className="sticky bottom-0 flex justify-end gap-2 border-t bg-background py-3">
          <Button type="button" variant="outline" onClick={() => navigate('/avaliacoes')} disabled={salvando}>Cancelar</Button>
          <Button type="button" onClick={() => void salvar()} disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar avaliação'}</Button>
        </div>
      )}

      <ConfirmarApagar alvo={alvoRemover ? { tipo: 'pergunta', nome: alvoRemover.title || `Pergunta ${(removendo ?? 0) + 1}`, aviso: 'A pergunta sai da avaliação ao salvar.' } : null}
        aoCancelar={() => setRemovendo(null)} aoConfirmar={() => { if (removendo !== null) atualizar(perguntas.filter((_, i) => i !== removendo)); setRemovendo(null); }} />
    </div>
  );
}
