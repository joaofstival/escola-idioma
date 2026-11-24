import { useState } from 'react';
import { api, mensagemErro } from '@/lib/api';
import { Button } from '@/components/ui/button';
export function MinhaConta() {
  const [erro, setErro] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <details className="text-sm">
      <summary className="cursor-pointer">Trocar minha senha</summary>
      <form
        className="grid gap-3 py-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const d = new FormData(e.currentTarget);
          if (d.get('nova') !== d.get('confirmacao')) {
            setErro('A confirmação precisa ser igual à nova senha');
            return;
          }
          setBusy(true);
          try {
            await api.post('/auth/senha', { senha_atual: d.get('atual'), nova_senha: d.get('nova') });
            window.dispatchEvent(new Event('escola:session-expired'));
          } catch (e) {
            setErro(mensagemErro(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Senha atual
          <input
            className="block w-full rounded border p-2"
            type="password"
            name="atual"
            required
            autoComplete="current-password"
            maxLength={128}
          />
        </label>
        <label>
          Nova senha
          <input
            className="block w-full rounded border p-2"
            type="password"
            name="nova"
            required
            minLength={12}
            maxLength={128}
            autoComplete="new-password"
          />
        </label>
        <label>
          Confirme a nova senha
          <input
            className="block w-full rounded border p-2"
            type="password"
            name="confirmacao"
            required
            minLength={12}
            maxLength={128}
            autoComplete="new-password"
          />
        </label>
        {erro && <p role="alert">{erro}</p>}
        <p>Todas as suas sessões serão encerradas.</p>
        <Button disabled={busy}>Alterar senha e entrar novamente</Button>
      </form>
    </details>
  );
}
