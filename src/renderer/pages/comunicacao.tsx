import { useState } from 'react';
import { useSessao } from '@/auth/sessao';
import { useQuery } from '@/hooks/use-query';
import { api, mensagemErro } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EstadoErro } from '@/components/estados';
import { data } from '@/lib/format';
interface Aviso {
  id: number;
  titulo: string;
  texto: string;
  lido: number;
  expira_em: string;
}
interface Pedido {
  id: number;
  nome: string;
  assunto: string;
  texto: string;
  status: string;
  versao: number;
}
export default function Comunicacao() {
  const { usuario } = useSessao();
  const gestao = ['admin', 'secretaria'].includes(usuario?.papel ?? '');
  const publicar = gestao || usuario?.papel === 'professor';
  const avisos = useQuery(() => api.get<Aviso[]>('/avisos'), []),
    pedidos = useQuery(() => api.get<Pedido[]>('/solicitacoes'), []),
    turmas = useQuery(() => api.get<{ id: number; nome: string }[]>('/portal/turmas'), []);
  const [erro, setErro] = useState(''),
    [busy, setBusy] = useState(false),
    [aberto, setAberto] = useState<number | null>(null);
  async function enviar(e: React.FormEvent<HTMLFormElement>, aviso = false) {
    e.preventDefault();
    const form = e.currentTarget,
      d = new FormData(form);
    setBusy(true);
    setErro('');
    try {
      await api.post(
        aviso ? '/avisos' : '/solicitacoes',
        aviso
          ? {
              titulo: d.get('titulo'),
              texto: d.get('texto'),
              turma_id: d.get('turma') ? Number(d.get('turma')) : null,
              expira_em: d.get('validade'),
              papel_destino: d.get('papel') || null,
            }
          : { assunto: d.get('assunto'), texto: d.get('texto') },
      );
      form.reset();
      avisos.reload();
      pedidos.reload();
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold">Avisos e secretaria</h1>
        <p className="text-muted-foreground">Comunicados da escola e acompanhamento das suas solicitações.</p>
      </header>
      {erro && (
        <p role="alert" className="text-destructive">
          {erro}
        </p>
      )}
      {avisos.error && <EstadoErro erro={avisos.error} aoRecarregar={avisos.reload} />}
      <div className="grid gap-3">
        {avisos.data?.length === 0 && <p>Nenhum aviso no momento.</p>}
        {avisos.data?.map((a) => (
          <article key={a.id} className="rounded-xl border p-4 space-y-2">
            <h2 className="font-semibold">{a.titulo}</h2>
            <p className="whitespace-pre-wrap">{a.texto}</p>
            <p className="text-sm text-muted-foreground">Válido até {data(a.expira_em)}</p>
            {!a.lido ? (
              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    await api.post(`/avisos/${a.id}/ler`, {});
                    avisos.reload();
                  } catch (e) {
                    setErro(mensagemErro(e));
                  }
                }}
              >
                Marcar como lido
              </Button>
            ) : (
              <span className="text-sm">Lido</span>
            )}
          </article>
        ))}
      </div>
      {publicar && (
        <details className="rounded-xl border p-4">
          <summary className="cursor-pointer font-medium">Publicar comunicado</summary>
          <form onSubmit={(e) => void enviar(e, true)} className="mt-4 grid gap-3">
            <label htmlFor="aviso-titulo">
              Título
              <Input id="aviso-titulo" name="titulo" required minLength={3} maxLength={150} />
            </label>
            <label>
              Mensagem
              <textarea
                name="texto"
                required
                minLength={3}
                maxLength={5000}
                className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </label>
            <label>
              Destino
              <select name="turma" required={!gestao} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="">{gestao ? 'Toda a escola' : 'Escolha a turma'}</option>
                {turmas.data?.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nome}
                  </option>
                ))}
              </select>
            </label>
            {gestao && (
              <label>
                Perfil destinatário (deixe em branco ao escolher uma turma)
                <select name="papel" className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="">Todos os perfis</option>
                  {['admin', 'secretaria', 'financeiro', 'professor', 'aluno'].map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label htmlFor="aviso-validade">
              Válido até
              <Input id="aviso-validade" name="validade" type="date" required />
            </label>
            <Button disabled={busy}>Publicar aviso</Button>
          </form>
        </details>
      )}
      <details className="rounded-xl border p-4">
        <summary className="cursor-pointer font-medium">Nova solicitação à secretaria</summary>
        <form onSubmit={(e) => void enviar(e)} className="mt-4 grid gap-3">
          <label htmlFor="pedido-assunto">
            Assunto
            <Input id="pedido-assunto" name="assunto" required minLength={3} maxLength={150} />
          </label>
          <label>
            Descreva o pedido
            <textarea
              name="texto"
              required
              minLength={5}
              maxLength={5000}
              className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </label>
          <Button disabled={busy}>Enviar solicitação</Button>
        </form>
      </details>
      <h2 className="text-lg font-semibold">{gestao ? 'Atendimentos' : 'Minhas solicitações'}</h2>
      {pedidos.error && <EstadoErro erro={pedidos.error} />}
      <div className="space-y-3">
        {pedidos.data?.map((p) => (
          <article key={p.id} className="rounded-xl border p-4 space-y-2">
            <h3 className="font-medium">
              #{p.id} · {p.assunto}
            </h3>
            {gestao && <p>{p.nome}</p>}
            <p className="whitespace-pre-wrap">{p.texto}</p>
            <p>Situação: {p.status.replace('_', ' ')}</p>
            <Button variant="outline" onClick={() => setAberto(aberto === p.id ? null : p.id)}>
              Acompanhar pedido
            </Button>
            {aberto === p.id && <Atendimento pedido={p} gestao={gestao} atualizado={pedidos.reload} />}
          </article>
        ))}
      </div>
    </section>
  );
}
function Atendimento({ pedido, gestao, atualizado }: { pedido: Pedido; gestao: boolean; atualizado: () => void }) {
  const q = useQuery(
    () =>
      api.get<{ id: number; nome: string; resposta: string; status: string; criado_em: string }[]>(`/solicitacoes/${pedido.id}/historico`),
    [pedido.id, pedido.versao],
  );
  const [erro, setErro] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <div className="space-y-3">
      {q.error && <EstadoErro erro={q.error} />}
      {q.data?.length === 0 && <p>Aguardando atendimento.</p>}
      {q.data?.map((h) => (
        <blockquote key={h.id} className="border-l-2 pl-3">
          <p>{h.resposta}</p>
          <small>
            {h.nome} · {h.status.replace('_', ' ')}
          </small>
        </blockquote>
      ))}
      {gestao && (
        <form
          className="grid gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const f = e.currentTarget,
              d = new FormData(f);
            try {
              await api.put(`/solicitacoes/${pedido.id}`, { status: d.get('status'), resposta: d.get('resposta'), versao: pedido.versao });
              f.reset();
              setErro('');
              atualizado();
            } catch (e) {
              setErro(mensagemErro(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Situação
            <select
              name="status"
              defaultValue={pedido.status}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="aberta">Aberta</option>
              <option value="em_atendimento">Em atendimento</option>
              <option value="resolvida">Resolvida</option>
            </select>
          </label>
          <label>
            Resposta
            <textarea
              name="resposta"
              required
              minLength={5}
              maxLength={5000}
              className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </label>
          {erro && <p role="alert">{erro}</p>}
          <Button disabled={busy}>Registrar atendimento</Button>
        </form>
      )}
    </div>
  );
}
