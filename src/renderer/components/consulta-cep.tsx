import { useState } from 'react';
import { api, mensagemErro } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
export function ConsultaCep({ preencher }: { preencher: (endereco: string) => void }) {
  const [cep, setCep] = useState(''),
    [erro, setErro] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <div className="sm:col-span-2 space-y-2">
      <label htmlFor="consulta-cep">
        Consultar endereço pelo CEP
        <Input id="consulta-cep" value={cep} onChange={(e) => setCep(e.target.value)} placeholder="00000-000" maxLength={9} />
      </label>
      <Button
        type="button"
        variant="outline"
        disabled={busy || !/^\d{5}-?\d{3}$/.test(cep)}
        onClick={async () => {
          setBusy(true);
          setErro('');
          try {
            const r = await api.get<{ logradouro: string; bairro: string; cidade: string; uf: string }>('/ferramentas/cep', { cep });
            preencher([r.logradouro, r.bairro, r.cidade, r.uf].filter(Boolean).join(', '));
          } catch (e) {
            setErro(mensagemErro(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        Buscar CEP
      </Button>
      <p className="text-xs text-muted-foreground">Confira o resultado e complete número e complemento no endereço.</p>
      {erro && <p role="alert">{erro}</p>}
    </div>
  );
}
