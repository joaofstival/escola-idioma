import { useState } from 'react';
import { useQuery } from '@/hooks/use-query';
import { api, mensagemErro } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { EstadoErro } from '@/components/estados';
import { PerguntaParticipante } from './avaliacao-formulario';
import { montarRespostas, validarPreenchimento, type Preenchimento } from '@/lib/avaliacao';
import type { Avaliacao } from '../../shared/types';
export default function MinhasAvaliacoes() {
  const q = useQuery(() => api.get<Avaliacao[]>('/avaliacoes'), []),
    [aberta, setAberta] = useState<number | null>(null);
  return (
    <section className="space-y-4">
      <h1 className="text-xl font-semibold">Avaliações e feedback</h1>
      <p className="text-muted-foreground">
        Respostas identificadas pela sua conta. Feedback e autoavaliação não substituem as notas das atividades.
      </p>
      {q.error ? (
        <EstadoErro erro={q.error} />
      ) : q.data?.length === 0 ? (
        <p>Nenhuma avaliação publicada para suas turmas.</p>
      ) : (
        q.data?.map((a) => (
          <article key={a.id} className="space-y-3 rounded-xl border p-4">
            <h2 className="font-semibold">{a.titulo}</h2>
            <p>{a.descricao}</p>
            <Button variant="outline" onClick={() => setAberta(aberta === a.id ? null : a.id)}>
              Abrir avaliação
            </Button>
            {aberta === a.id && <Responder avaliacao={a} />}
          </article>
        ))
      )}
    </section>
  );
}
function Responder({ avaliacao: a }: { avaliacao: Avaliacao }) {
  const q = useQuery(() => api.get<{ id: number } | null>(`/avaliacoes/${a.id}/minha-resposta`), [a.id]);
  const [valores, setValores] = useState<Record<string, Preenchimento>>({}),
    [erros, setErros] = useState<Record<string, string>>({}),
    [erro, setErro] = useState(''),
    [enviando, setEnviando] = useState(false);
  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    const validacao = validarPreenchimento(a.form, valores);
    setErros(validacao);
    if (Object.keys(validacao).length) return;
    setEnviando(true);
    try {
      await api.post(`/avaliacoes/${a.id}/respostas`, { answers: montarRespostas(a.form, valores) });
      q.reload();
    } catch (err) {
      setErro(mensagemErro(err));
    } finally {
      setEnviando(false);
    }
  }
  return q.error ? (
    <EstadoErro erro={q.error} />
  ) : q.loading ? (
    <p>Consultando resposta…</p>
  ) : q.data ? (
    <p role="status">Sua resposta já foi enviada.</p>
  ) : (
    <form onSubmit={enviar} className="space-y-4">
      {a.form.questions.map((p, i) => (
        <PerguntaParticipante
          key={p.id}
          pergunta={p}
          numero={i + 1}
          valor={valores[p.id] ?? {}}
          erro={erros[p.id]}
          aoMudar={(v) => setValores({ ...valores, [p.id]: v })}
        />
      ))}
      {erro && <p role="alert">{erro}</p>}
      <Button disabled={enviando}>Enviar minha resposta</Button>
    </form>
  );
}
