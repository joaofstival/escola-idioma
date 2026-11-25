import { useState } from 'react';
import { api, mensagemErro } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function MinhaConta() {
  const [erro, setErro] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <section className="max-w-md">
      <form
        className="grid gap-4"
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
        <div className="grid gap-1.5">
          <Label htmlFor="senha-atual">Senha atual</Label>
          <Input id="senha-atual" type="password" name="atual" required autoComplete="current-password" maxLength={128} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="senha-nova">Nova senha</Label>
          <Input id="senha-nova" type="password" name="nova" required minLength={12} maxLength={128} autoComplete="new-password" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="senha-confirmacao">Confirme a nova senha</Label>
          <Input
            id="senha-confirmacao"
            type="password"
            name="confirmacao"
            required
            minLength={12}
            maxLength={128}
            autoComplete="new-password"
          />
        </div>
        {erro && (
          <p role="alert" className="text-sm text-destructive">
            {erro}
          </p>
        )}
        <p className="text-sm text-muted-foreground">Todas as suas sessões serão encerradas.</p>
        <div>
          <Button disabled={busy}>Alterar senha e entrar novamente</Button>
        </div>
      </form>
    </section>
  );
}
