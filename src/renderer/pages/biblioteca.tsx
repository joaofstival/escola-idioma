import { useState } from 'react';
import { useSessao } from '@/auth/sessao';
import { useQuery } from '@/hooks/use-query';
import { api, mensagemErro } from '@/lib/api';
import { lerArquivo, baixarArquivo } from '@/lib/arquivo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EstadoErro } from '@/components/estados';
import type { PublicacaoMaterial } from '../../shared/contracts/pedagogico';
export default function Biblioteca() {
  const { usuario } = useSessao();
  const editor = ['admin', 'professor'].includes(usuario?.papel ?? '');
  const q = useQuery(() => api.get<PublicacaoMaterial[]>('/biblioteca'), []),
    turmas = useQuery(() => api.get<{ id: number; nome: string }[]>('/portal/turmas'), []);
  const [anterior, setAnterior] = useState<PublicacaoMaterial | null>(null),
    [erro, setErro] = useState(''),
    [salvando, setSalvando] = useState(false);
  async function salvar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget,
      d = new FormData(form);
    setSalvando(true);
    setErro('');
    try {
      const f = d.get('arquivo');
      const arquivo = f instanceof File && f.size ? await lerArquivo(f) : undefined;
      await api.post(anterior ? `/biblioteca/${anterior.id}/versionar` : '/biblioteca', {
        turma_id: Number(d.get('turma')),
        titulo: d.get('titulo'),
        descricao: d.get('descricao'),
        estado: d.get('estado'),
        ...(arquivo ? { arquivo } : { link: d.get('link') }),
        acesso_ate: d.get('ate') || null,
      });
      setAnterior(null);
      form.reset();
      q.reload();
    } catch (err) {
      setErro(mensagemErro(err));
    } finally {
      setSalvando(false);
    }
  }
  async function estado(p: PublicacaoMaterial, novo: string) {
    if (!window.confirm(`${novo === 'arquivado' ? 'Arquivar' : 'Alterar publicação de'} “${p.titulo}”?`)) return;
    try {
      await api.put(`/biblioteca/${p.id}`, {
        revisao: p.revisao,
        estado: novo,
        motivo: novo === 'arquivado' ? 'Arquivamento solicitado pelo responsável' : 'Publicação autorizada pelo responsável',
      });
      q.reload();
    } catch (err) {
      setErro(mensagemErro(err));
    }
  }
  async function baixar(p: PublicacaoMaterial) {
    setErro('');
    try {
      await baixarArquivo(`/biblioteca/${p.id}/arquivo`);
    } catch (err) {
      setErro(mensagemErro(err));
    }
  }
  return (
    <section className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold">Biblioteca de materiais</h1>
        <p className="text-muted-foreground">
          Materiais publicados para suas turmas. Arquivos de até 5 MB; a cópia baixada pode ser lida offline.
        </p>
      </header>
      {editor && (
        <details open={anterior ? true : undefined} className="rounded-xl border p-4">
          <summary className="cursor-pointer font-medium">{anterior ? 'Publicar nova versão' : 'Adicionar material à turma'}</summary>
          <form key={anterior?.id ?? 'novo'} onSubmit={salvar} className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="material-turma">Turma</Label>
              <select
                id="material-turma"
                name="turma"
                className="h-9 w-full rounded border bg-background"
                defaultValue={anterior?.turma_id}
                required
              >
                {turmas.data
                  ?.filter((t) => !anterior || t.id === anterior.turma_id)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nome}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <Label htmlFor="material-titulo">Título</Label>
              <Input id="material-titulo" name="titulo" defaultValue={anterior?.titulo} required minLength={2} maxLength={150} />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="material-descricao">Descrição</Label>
              <textarea
                id="material-descricao"
                name="descricao"
                className="w-full rounded border bg-background p-2"
                defaultValue={anterior?.descricao}
                maxLength={2000}
              />
            </div>
            <div>
              <Label htmlFor="material-arquivo">Arquivo (PDF, imagem ou áudio)</Label>
              <Input id="material-arquivo" name="arquivo" type="file" accept=".pdf,.png,.jpg,.jpeg,.mp3,.ogg,.wav" />
            </div>
            <div>
              <Label htmlFor="material-link">Ou link HTTPS</Label>
              <Input id="material-link" name="link" type="url" placeholder="https://…" />
            </div>
            <div>
              <Label htmlFor="material-estado">Situação</Label>
              <select id="material-estado" name="estado" className="h-9 w-full rounded border bg-background">
                <option value="rascunho">Rascunho</option>
                <option value="publicado">Publicado para a turma</option>
              </select>
            </div>
            <div>
              <Label htmlFor="material-ate">Disponível até (opcional)</Label>
              <Input id="material-ate" name="ate" type="date" />
            </div>
            <Button disabled={salvando}>{salvando ? 'Enviando…' : anterior ? 'Salvar nova versão' : 'Salvar material'}</Button>
            {anterior && (
              <Button type="button" variant="outline" onClick={() => setAnterior(null)}>
                Cancelar nova versão
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
        <p>Carregando materiais…</p>
      ) : q.data.length === 0 ? (
        <p>Nenhum material disponível para suas turmas.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {q.data.map((p) => (
            <article key={p.id} className="space-y-3 rounded-xl border p-5">
              <h2 className="text-lg font-semibold">{p.titulo}</h2>
              <p className="text-sm text-muted-foreground">
                {p.turma_nome} · {p.autor_nome} · versão {p.versao}
                {editor ? ' · ' + p.estado : ''}
              </p>
              <p className="whitespace-pre-wrap">{p.descricao}</p>
              {p.arquivo_nome && (
                <p className="text-sm">
                  {p.arquivo_nome} · {Math.ceil((p.tamanho ?? 0) / 1024)} KB
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {p.arquivo_id && (
                  <Button variant="outline" onClick={() => void baixar(p)}>
                    Baixar arquivo
                  </Button>
                )}
                {p.link && (
                  <Button variant="outline" asChild>
                    <a href={p.link} target="_blank" rel="noreferrer">
                      Abrir material
                    </a>
                  </Button>
                )}
                {editor && (usuario?.papel === 'admin' || p.autor_id === usuario?.id) && (
                  <>
                    <Button variant="outline" onClick={() => setAnterior(p)}>
                      Nova versão
                    </Button>
                    {p.estado === 'rascunho' && <Button onClick={() => void estado(p, 'publicado')}>Publicar</Button>}
                    {p.estado !== 'arquivado' && (
                      <Button variant="outline" onClick={() => void estado(p, 'arquivado')}>
                        Arquivar
                      </Button>
                    )}
                  </>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
