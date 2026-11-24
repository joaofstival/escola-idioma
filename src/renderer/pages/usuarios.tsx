import { useState } from 'react';
import { useQuery } from '@/hooks/use-query';
import { api, mensagemErro } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/page-header';
import { EstadoErro } from '@/components/estados';
interface Conta {
  id: number;
  nome: string;
  email: string;
  papel: string;
  ativo: boolean;
}
export default function Usuarios() {
  const q = useQuery(() => api.get<Conta[]>('/admin/usuarios'), []),
    alunos = useQuery(() => api.get<{ id: number; nome: string }[]>('/alunos'), []),
    professores = useQuery(() => api.get<{ id: number; nome: string }[]>('/professores'), []);
  const [nome, setNome] = useState(''),
    [email, setEmail] = useState(''),
    [papel, setPapel] = useState('aluno'),
    [vinculo, setVinculo] = useState(''),
    [codigo, setCodigo] = useState(''),
    [erro, setErro] = useState(''),
    [salvando, setSalvando] = useState(false);
  async function criar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setErro('');
    setCodigo('');
    try {
      const r = await api.post<{ codigoAtivacao: string }>('/admin/usuarios', {
        nome,
        email,
        papel,
        ...(papel === 'aluno' ? { aluno_id: Number(vinculo) } : papel === 'professor' ? { professor_id: Number(vinculo) } : {}),
      });
      setCodigo(r.codigoAtivacao);
      setNome('');
      setEmail('');
      q.reload();
    } catch (err) {
      setErro(mensagemErro(err));
    } finally {
      setSalvando(false);
    }
  }
  async function acao(u: Conta, tipo: 'desativar' | 'recuperar') {
    if (!window.confirm(`${tipo === 'desativar' ? 'Desativar conta' : 'Gerar código de recuperação'} de ${u.nome}?`)) return;
    setErro('');
    try {
      const r = await api.post<{ codigoAtivacao?: string }>(`/admin/usuarios/${u.id}/${tipo}`);
      setCodigo(r.codigoAtivacao ?? '');
      q.reload();
    } catch (err) {
      setErro(mensagemErro(err));
    }
  }
  return (
    <>
      <PageHeader title="Contas e acesso" description="Crie contas individuais e entregue o código de ativação por um canal seguro." />
      {erro && (
        <p role="alert" className="text-danger-deep">
          {erro}
        </p>
      )}
      {codigo && (
        <div role="status" className="my-4 rounded-xl border p-4">
          <p>Código de ativação/recuperação (entregue somente à pessoa vinculada):</p>
          <code className="break-all">{codigo}</code>
        </div>
      )}
      <form onSubmit={criar} className="mb-8 grid max-w-2xl gap-3 rounded-xl border p-4">
        <Label htmlFor="conta-nome">Nome</Label>
        <Input id="conta-nome" value={nome} onChange={(e) => setNome(e.target.value)} required />
        <Label htmlFor="conta-email">E-mail</Label>
        <Input id="conta-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <Label htmlFor="conta-papel">Perfil</Label>
        <select
          id="conta-papel"
          className="h-9 rounded-md border bg-background px-3"
          value={papel}
          onChange={(e) => {
            setPapel(e.target.value);
            setVinculo('');
          }}
        >
          {['aluno', 'professor', 'secretaria', 'financeiro', 'admin'].map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        {['aluno', 'professor'].includes(papel) && (
          <>
            <Label htmlFor="conta-vinculo">Pessoa vinculada</Label>
            <select
              id="conta-vinculo"
              className="h-9 rounded-md border bg-background px-3"
              value={vinculo}
              onChange={(e) => setVinculo(e.target.value)}
              required
            >
              <option value="">Selecione</option>
              {(papel === 'aluno' ? alunos.data : professores.data)?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </>
        )}
        <Button disabled={salvando}>{salvando ? 'Criando…' : 'Criar conta e código'}</Button>
      </form>
      {q.error ? (
        <EstadoErro erro={q.error} />
      ) : (
        <ul className="divide-y">
          {q.data?.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                {u.nome} · {u.papel}
                <p className="text-muted-foreground">
                  {u.email} · {u.ativo ? 'Ativa' : 'Inativa / aguardando ativação'}
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => void acao(u, 'recuperar')}>
                  Recuperar acesso
                </Button>
                {u.ativo && (
                  <Button variant="outline" onClick={() => void acao(u, 'desativar')}>
                    Desativar
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
