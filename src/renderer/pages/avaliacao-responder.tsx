import { useState } from 'react';
import { toast } from 'sonner';
import { EstadoVazio } from '@/components/estados';
import { FiltroSelect } from '@/components/filtro-select';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useQuery } from '@/hooks/use-query';
import { api, mensagemErro } from '@/lib/api';
import { montarRespostas, validarPreenchimento, type Preenchimento } from '@/lib/avaliacao';
import { PerguntaParticipante } from './avaliacao-formulario';
import type { Avaliacao, RespostaAvaliacao } from '../../shared/types.ts';

/** Registrar a resposta de um aluno matriculado na turma (cada aluno responde uma vez). */
export function AvaliacaoResponder({ avaliacao, aoResponder }: { avaliacao: Avaliacao; aoResponder: () => void }) {
  const turma = useQuery(() => api.get<{ alunos?: { id: number; nome: string }[] }>(`/turmas/${avaliacao.turma_id}`), [avaliacao.turma_id]);
  const respondidas = useQuery(
    () => api.get<RespostaAvaliacao[]>(`/avaliacoes/${avaliacao.id}/respostas`),
    [avaliacao.id, avaliacao.total_respostas],
  );
  const [aluno, setAluno] = useState('');
  const [valores, setValores] = useState<Record<string, Preenchimento>>({});
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erroServidor, setErroServidor] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const jaResponderam = new Set((respondidas.data ?? []).map((r) => r.aluno_id));
  const pendentes = (turma.data?.alunos ?? []).filter((a) => !jaResponderam.has(a.id));

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    const ev: Record<string, string> = validarPreenchimento(avaliacao.form, valores);
    if (!aluno) ev.aluno = 'Escolha o aluno que está respondendo.';
    setErros(ev);
    setErroServidor(null);
    if (Object.keys(ev).length) return;
    setEnviando(true);
    try {
      await api.post(`/avaliacoes/${avaliacao.id}/respostas`, {
        aluno_id: Number(aluno),
        answers: montarRespostas(avaliacao.form, valores),
      });
      toast.success(`Resposta de ${pendentes.find((a) => String(a.id) === aluno)?.nome ?? 'aluno'} registrada.`);
      setAluno('');
      setValores({});
      aoResponder();
    } catch (err) {
      setErroServidor(mensagemErro(err));
    } finally {
      setEnviando(false);
    }
  }

  if (turma.data && pendentes.length === 0) {
    return (
      <EstadoVazio
        titulo="Nenhum aluno pendente."
        descricao="Todos os alunos matriculados nesta turma já responderam, ou a turma não tem alunos com matrícula ativa."
      />
    );
  }
  return (
    <form onSubmit={enviar} noValidate className="max-w-3xl space-y-6">
      <div className="space-y-1.5">
        <Label>Aluno</Label>
        <FiltroSelect
          rotulo="Aluno que está respondendo"
          valor={aluno}
          aoMudar={(v) => {
            setAluno(v);
            setErros((r) => {
              const n = { ...r };
              delete n.aluno;
              return n;
            });
          }}
          placeholder="Escolha o aluno"
          className="w-72"
          opcoes={pendentes.map((a) => ({ valor: String(a.id), rotulo: a.nome }))}
        />
        {erros.aluno && (
          <p role="alert" className="text-sm text-danger-deep">
            {erros.aluno}
          </p>
        )}
      </div>
      {avaliacao.form.questions.map((q, i) => (
        <PerguntaParticipante
          key={q.id}
          pergunta={q}
          numero={i + 1}
          valor={valores[q.id] ?? {}}
          erro={erros[q.id]}
          aoMudar={(v) => setValores({ ...valores, [q.id]: v })}
        />
      ))}
      {erroServidor && (
        <p role="alert" className="rounded-xl border border-danger-deep/30 bg-danger-soft p-4 text-danger-deep">
          {erroServidor}
        </p>
      )}
      <div className="flex justify-end">
        <Button type="submit" disabled={enviando}>
          {enviando ? 'Enviando…' : 'Registrar resposta'}
        </Button>
      </div>
    </form>
  );
}
