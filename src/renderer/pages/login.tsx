import { useState } from 'react';
import { useSessao } from '@/auth/sessao';
import { api, mensagemErro } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
export default function Login() {
  const { entrar } = useSessao();
  const [ativar, setAtivar] = useState(false),
    [email, setEmail] = useState(''),
    [senha, setSenha] = useState(''),
    [codigo, setCodigo] = useState(''),
    [erro, setErro] = useState(''),
    [enviando, setEnviando] = useState(false),
    [mensagem, setMensagem] = useState('');
  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setErro('');
    try {
      if (ativar) {
        await api.post('/auth/ativar', { codigo, senha });
        setAtivar(false);
        setSenha('');
        setCodigo('');
        setMensagem('Acesso ativado. Entre com seu e-mail e senha.');
      } else await entrar(email, senha);
    } catch (err) {
      setErro(mensagemErro(err));
    } finally {
      setEnviando(false);
    }
  }
  return (
    <main className="flex min-h-screen items-center justify-center bg-inset p-6">
      <div className="w-full max-w-md space-y-5 rounded-xl border bg-background p-8">
        <h1 className="text-2xl font-semibold">Escola Idiomas</h1>
        <p className="text-muted-foreground">
          {ativar ? 'Ative sua conta ou redefina sua senha com o código fornecido pela escola.' : 'Entre para acessar sua área da escola.'}
        </p>
        <form onSubmit={enviar} className="space-y-4">
          {ativar ? (
            <div className="space-y-2">
              <Label htmlFor="codigo">Código de acesso</Label>
              <Input id="codigo" value={codigo} onChange={(e) => setCodigo(e.target.value)} required autoComplete="off" />
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="senha">{ativar ? 'Nova senha (mínimo 12 caracteres)' : 'Senha'}</Label>
            <Input
              id="senha"
              type="password"
              autoComplete={ativar ? 'new-password' : 'current-password'}
              minLength={ativar ? 12 : 1}
              maxLength={128}
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              required
            />
          </div>
          {erro && (
            <p role="alert" className="text-danger-deep">
              {erro}
            </p>
          )}
          {mensagem && <p role="status">{mensagem}</p>}
          <Button className="w-full" disabled={enviando}>
            {enviando ? 'Aguarde…' : ativar ? 'Ativar acesso' : 'Entrar'}
          </Button>
        </form>
        <Button
          variant="link"
          onClick={() => {
            setAtivar(!ativar);
            setErro('');
            setSenha('');
          }}
        >
          {ativar ? 'Voltar para entrar' : 'Primeiro acesso ou recuperação'}
        </Button>
        <ConexaoEscola />
        <p className="text-xs text-muted-foreground">Precisa de um código? Solicite à secretaria. Não compartilhe sua senha.</p>
      </div>
    </main>
  );
}

function ConexaoEscola() {
  const [endereco, setEndereco] = useState(''),
    [mensagem, setMensagem] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <details
      onToggle={async (e) => {
        if (e.currentTarget.open && !endereco) {
          try {
            const r = await api.get<{ endereco: string }>('/cliente/conexao');
            setEndereco(r.endereco);
          } catch {
            setMensagem('Informe o endereço fornecido pela escola');
          }
        }
      }}
    >
      <summary className="cursor-pointer text-sm">Conexão com a escola</summary>
      <form
        className="mt-3 space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await api.put('/cliente/conexao', { endereco });
            setMensagem('Conexão salva. Entre com sua conta.');
          } catch (e) {
            setMensagem(mensagemErro(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <Label htmlFor="escola-url">Endereço do servidor</Label>
        <Input
          id="escola-url"
          type="url"
          value={endereco}
          onChange={(e) => setEndereco(e.target.value)}
          placeholder="https://escola.exemplo.com"
          required
        />
        <Button disabled={busy} variant="outline">
          Salvar conexão
        </Button>
        {mensagem && (
          <p role="status" className="text-sm">
            {mensagem}
          </p>
        )}
      </form>
    </details>
  );
}
