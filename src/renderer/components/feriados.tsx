import { useState } from 'react';
import { useQuery } from '@/hooks/use-query';
import { api } from '@/lib/api';
import { EstadoErro } from '@/components/estados';
import { data } from '@/lib/format';
export function Feriados() {
  const [aberto, setAberto] = useState(false),
    [ano, setAno] = useState(String(new Date().getFullYear()));
  const q = useQuery(
    () =>
      aberto
        ? api.get<{ abrangencia: string; feriados: { date: string; name: string }[] }>('/ferramentas/feriados', { ano })
        : Promise.resolve(null),
    [ano, aberto],
  );
  return (
    <details className="rounded-lg border p-4" onToggle={(e) => setAberto(e.currentTarget.open)}>
      <summary className="cursor-pointer">Consultar feriados nacionais</summary>
      <label>
        Ano
        <input
          type="number"
          min={1900}
          max={2199}
          value={ano}
          onChange={(e) => setAno(e.target.value)}
          className="m-2 border rounded p-1"
        />
      </label>
      {q.error ? (
        <EstadoErro erro={q.error} aoRecarregar={q.reload} />
      ) : q.data ? (
        <>
          <p className="text-sm text-muted-foreground">{q.data.abrangencia} A consulta não cancela aulas automaticamente.</p>
          <ul className="mt-3 grid gap-1 sm:grid-cols-2">
            {q.data.feriados.map((f) => (
              <li key={f.date + f.name}>
                {data(f.date)} · {f.name}
              </li>
            ))}
          </ul>
        </>
      ) : aberto ? (
        <p>Consultando…</p>
      ) : null}
    </details>
  );
}
