import { useState } from 'react';
import { useSessao } from '@/auth/sessao';
import { useQuery } from '@/hooks/use-query';
import { api, mensagemErro } from '@/lib/api';
import { lerArquivo, baixarArquivo } from '@/lib/arquivo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EstadoErro } from '@/components/estados';
import { data } from '@/lib/format';
import type { AtividadeEscolar, EntregaEscolar } from '../../shared/contracts/pedagogico';
export default function Atividades() {
  const { usuario } = useSessao(),
    editor = ['admin', 'professor'].includes(usuario?.papel ?? '');
  const q = useQuery(() => api.get<AtividadeEscolar[]>('/atividades'), []),
    turmas = useQuery(() => api.get<{ id: number; nome: string }[]>('/portal/turmas'), []);
  const [edicao, setEdicao] = useState<AtividadeEscolar | null>(null),
    [aberta, setAberta] = useState<number | null>(null),
    [erro, setErro] = useState(''),
    [enviando, setEnviando] = useState(false);
  async function salvar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget,
      d = new FormData(form);
    setEnviando(true);
    setErro('');
    try {
      const v = {
        turma_id: Number(d.get('turma')),
        titulo: d.get('titulo'),
        descricao: d.get('descricao'),
        prazo: d.get('prazo'),
        valor_max: Number(d.get('maximo')),
        estado: d.get('estado'),
      };
      if (edicao) await api.put(`/atividades/${edicao.id}`, { ...v, versao: edicao.versao, motivo: d.get('motivo') });
      else await api.post('/atividades', v);
      setEdicao(null);
      form.reset();
      q.reload();
    } catch (err) {
      setErro(mensagemErro(err));
    } finally {
      setEnviando(false);
    }
  }
  async function apagar(a: AtividadeEscolar) {
    if (!window.confirm(`Apagar rascunho “${a.titulo}”?`)) return;
    try {
      await api.del(`/atividades/${a.id}`);
      q.reload();
    } catch (err) {
      setErro(mensagemErro(err));
    }
  }
  return (
    <section className="space-y-5">
      <h1 className="text-xl font-semibold">Atividades e notas</h1>
      {editor && (
        <details open={edicao ? true : undefined} className="rounded-xl border p-4">
          <summary className="cursor-pointer font-medium">{edicao ? 'Editar atividade' : 'Criar atividade ou avaliação'}</summary>
          <form key={edicao?.id ?? 'nova'} onSubmit={salvar} className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="atividade-turma">Turma</Label>
              <select id="atividade-turma" name="turma" className="h-9 w-full rounded border bg-background" defaultValue={edicao?.turma_id}>
                {turmas.data
                  ?.filter((t) => !edicao || t.id === edicao.turma_id)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nome}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <Label htmlFor="atividade-titulo">Título</Label>
              <Input id="atividade-titulo" name="titulo" defaultValue={edicao?.titulo} required minLength={2} maxLength={150} />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="atividade-descricao">Orientações e critérios</Label>
              <textarea
                id="atividade-descricao"
                name="descricao"
                className="min-h-24 w-full rounded border bg-background p-2"
                required
                maxLength={10000}
                defaultValue={edicao?.descricao}
              />
            </div>
            <div>
              <Label htmlFor="atividade-prazo">Prazo</Label>
              <Input id="atividade-prazo" name="prazo" type="date" required defaultValue={edicao?.prazo} />
            </div>
            <div>
              <Label htmlFor="atividade-maximo">Nota máxima</Label>
              <Input
                id="atividade-maximo"
                name="maximo"
                type="number"
                min="0.1"
                max="100"
                step="0.1"
                required
                defaultValue={edicao?.valor_max ?? 10}
              />
            </div>
            <div>
              <Label htmlFor="atividade-estado">Situação</Label>
              <select
                id="atividade-estado"
                name="estado"
                className="h-9 w-full rounded border bg-background"
                defaultValue={edicao?.estado ?? 'rascunho'}
              >
                <option value="rascunho">Rascunho</option>
                <option value="publicada">Publicada</option>
                <option value="encerrada">Encerrada</option>
              </select>
            </div>
            {edicao && (
              <div>
                <Label htmlFor="atividade-motivo">Motivo da alteração</Label>
                <Input id="atividade-motivo" name="motivo" required minLength={5} />
              </div>
            )}
            <Button disabled={enviando}>Salvar atividade</Button>
            {edicao && (
              <Button type="button" variant="outline" onClick={() => setEdicao(null)}>
                Cancelar edição
              </Button>
            )}
          </form>
        </details>
      )}
      {erro && (
        <p role="alert" className="text-danger-deep">
          {erro}
        </p>
      )}
      {q.error ? (
        <EstadoErro erro={q.error} aoRecarregar={q.reload} />
      ) : !q.data ? (
        <p>Carregando atividades…</p>
      ) : q.data.length === 0 ? (
        <p>Nenhuma atividade disponível.</p>
      ) : (
        q.data.map((a) => (
          <article key={a.id} className="space-y-3 rounded-xl border p-5">
            <h2 className="text-lg font-semibold">{a.titulo}</h2>
            <p className="text-sm text-muted-foreground">
              {a.turma_nome} · prazo {data(a.prazo)} · nota máxima {a.valor_max} · {a.estado}
            </p>
            <p className="whitespace-pre-wrap">{a.descricao}</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setAberta(aberta === a.id ? null : a.id)}>
                {aberta === a.id ? 'Fechar' : 'Ver entrega e notas'}
              </Button>
              {editor && (usuario?.papel === 'admin' || a.autor_id === usuario?.id) && (
                <>
                  <Button variant="outline" onClick={() => setEdicao(a)}>
                    Editar atividade
                  </Button>
                  {a.estado === 'rascunho' && (
                    <Button variant="outline" onClick={() => void apagar(a)}>
                      Apagar rascunho
                    </Button>
                  )}
                </>
              )}
            </div>
            {aberta === a.id && <Entregas atividade={a} />}
          </article>
        ))
      )}
    </section>
  );
}
function Entregas({ atividade: a }: { atividade: AtividadeEscolar }) {
  const { usuario } = useSessao(),
    aluno = usuario?.papel === 'aluno';
  const alunos = useQuery(
    () => (!aluno ? api.get<{ id: number; nome: string }[]>(`/portal/turmas/${a.turma_id}/alunos`) : Promise.resolve([])),
    [a.turma_id, aluno],
  );
  const q = useQuery(() => api.get<EntregaEscolar[]>(`/atividades/${a.id}/entregas`), [a.id]);
  const [erro, setErro] = useState(''),
    [enviando, setEnviando] = useState(false),
    [operacao, setOperacao] = useState(() => crypto.randomUUID());
  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget,
      d = new FormData(form);
    setEnviando(true);
    setErro('');
    try {
      const f = d.get('arquivo'),
        arquivo = f instanceof File && f.size ? await lerArquivo(f) : undefined;
      await api.post(`/atividades/${a.id}/entregas`, {
        texto: String(d.get('texto') ?? ''),
        operacao_id: operacao,
        ...(arquivo ? { arquivo } : {}),
      });
      q.reload();
      setOperacao(crypto.randomUUID());
      form.reset();
    } catch (err) {
      setErro(mensagemErro(err));
    } finally {
      setEnviando(false);
    }
  }
  async function avaliar(e: React.FormEvent<HTMLFormElement>, entrega: EntregaEscolar) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    setEnviando(true);
    setErro('');
    try {
      await api.put(`/atividades/${a.id}/entregas/${entrega.id}/nota`, {
        nota: Number(d.get('nota')),
        devolutiva: d.get('devolutiva'),
        publicada: d.get('publicada') === 'on',
        versao: entrega.nota_versao,
        motivo: d.get('motivo'),
      });
      q.reload();
    } catch (err) {
      setErro(mensagemErro(err));
    } finally {
      setEnviando(false);
    }
  }
  async function baixar(e: EntregaEscolar) {
    try {
      await baixarArquivo(`/atividades/${a.id}/entregas/${e.id}/arquivo`);
    } catch (err) {
      setErro(mensagemErro(err));
    }
  }
  return (
    <section className="space-y-4 border-t pt-4">
      {!aluno && (
        <details className="rounded border p-3">
          <summary>Registrar avaliação realizada na escola</summary>
          <form
            className="mt-3 grid gap-3"
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget,
                d = new FormData(form);
              setEnviando(true);
              try {
                await api.post(`/atividades/${a.id}/presencial`, {
                  aluno_id: Number(d.get('aluno')),
                  nota: Number(d.get('nota')),
                  devolutiva: String(d.get('devolutiva') ?? ''),
                  publicada: d.get('publicada') === 'on',
                  motivo: String(d.get('motivo')),
                  operacao_id: operacao,
                });
                q.reload();
                setOperacao(crypto.randomUUID());
                setErro('');
                form.reset();
              } catch (e) {
                setErro(mensagemErro(e));
              } finally {
                setEnviando(false);
              }
            }}
          >
            <label>
              Aluno
              <select name="aluno" required className="block w-full border p-2 rounded">
                <option value="">Selecione</option>
                {alunos.data
                  ?.filter((aluno) => !q.data?.some((e) => e.aluno_id === aluno.id))
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.nome}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Nota (0 a {a.valor_max})
              <input name="nota" type="number" min={0} max={a.valor_max} step="0.01" required className="block w-full border p-2 rounded" />
            </label>
            <label>
              Devolutiva
              <textarea name="devolutiva" maxLength={5000} className="block w-full border p-2 rounded" />
            </label>
            <label>
              Descrição/motivo do registro
              <input name="motivo" required minLength={5} maxLength={500} className="block w-full border p-2 rounded" />
            </label>
            <label>
              <input type="checkbox" name="publicada" /> Publicar nota para o aluno
            </label>
            <Button disabled={enviando}>Registrar avaliação presencial</Button>
          </form>
        </details>
      )}

      {erro && (
        <p role="alert" className="text-danger-deep">
          {erro}
        </p>
      )}
      {q.error ? (
        <EstadoErro erro={q.error} />
      ) : !q.data ? (
        <p>Carregando entregas…</p>
      ) : (
        <>
          {q.data.length === 0 && <p>{aluno ? 'Você ainda não enviou esta atividade.' : 'Nenhuma entrega recebida.'}</p>}
          {q.data.map((e) => (
            <div key={e.id} className="space-y-3 rounded-lg bg-inset p-4">
              <h3 className="font-semibold">
                {aluno ? 'Minha entrega' : e.aluno_nome} · versão {e.versao}
              </h3>
              <p className="whitespace-pre-wrap">{e.texto}</p>
              {e.arquivo_id && (
                <Button variant="outline" onClick={() => void baixar(e)}>
                  Baixar anexo
                </Button>
              )}
              {e.nota !== null ? (
                <p>
                  Nota: {e.nota} / {a.valor_max}
                  {!aluno && !e.publicada ? ' · rascunho' : ''}
                </p>
              ) : (
                <p>Nota ainda não publicada.</p>
              )}
              {e.devolutiva && <p className="whitespace-pre-wrap">Devolutiva: {e.devolutiva}</p>}
              {!aluno && (
                <form key={e.id + '-' + e.nota_versao} onSubmit={(ev) => void avaliar(ev, e)} className="grid gap-3">
                  <Label htmlFor={'nota-' + e.id}>Nota (0 a {a.valor_max})</Label>
                  <Input
                    id={'nota-' + e.id}
                    name="nota"
                    type="number"
                    min="0"
                    max={a.valor_max}
                    step="0.01"
                    required
                    defaultValue={e.nota ?? ''}
                  />
                  <Label htmlFor={'devolutiva-' + e.id}>Devolutiva</Label>
                  <textarea
                    id={'devolutiva-' + e.id}
                    name="devolutiva"
                    className="w-full rounded border bg-background p-2"
                    defaultValue={e.devolutiva ?? ''}
                    maxLength={5000}
                  />
                  <Label htmlFor={'motivo-nota-' + e.id}>Motivo do lançamento/correção</Label>
                  <Input id={'motivo-nota-' + e.id} name="motivo" required minLength={5} />
                  <Label className="flex items-center gap-2">
                    <input type="checkbox" name="publicada" defaultChecked={!!e.publicada} />
                    Publicar para o aluno
                  </Label>
                  <Button disabled={enviando}>Salvar avaliação</Button>
                </form>
              )}
            </div>
          ))}
        </>
      )}
      {aluno && a.estado === 'publicada' && !q.data?.some((e) => e.publicada !== null) && (
        <form onSubmit={enviar} className="grid gap-3">
          <Label htmlFor={'resposta-' + a.id}>Sua resposta</Label>
          <textarea id={'resposta-' + a.id} name="texto" className="min-h-24 w-full rounded border bg-background p-2" maxLength={20000} />
          <Label htmlFor={'anexo-' + a.id}>Anexo opcional (até 5 MB)</Label>
          <Input id={'anexo-' + a.id} name="arquivo" type="file" accept=".pdf,.png,.jpg,.jpeg,.mp3,.ogg,.wav" />
          <Button disabled={enviando}>Enviar minha atividade</Button>
          <p className="text-sm text-muted-foreground">A entrega será vinculada à sua conta. Após avaliação não é possível substituir.</p>
        </form>
      )}
    </section>
  );
}
