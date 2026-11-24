import { useState } from 'react';
import { useSessao } from '@/auth/sessao';
import { useQuery } from '@/hooks/use-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { EstadoErro, EstadoVazio } from '@/components/estados';
import { brl, data } from '@/lib/format';
import type { Mensalidade } from '../../shared/types';
type Turma = { id: number; nome: string; idioma_nome: string; nivel: number; ano_letivo: number; horario: string | null };
export default function Portal() {
  const { usuario, sair } = useSessao();
  const [aba, setAba] = useState('turmas');
  const q = useQuery(() => api.get<Turma[]>('/portal/turmas'), []);
  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Olá, {usuario?.nome}</h1>
          <p className="text-muted-foreground">{usuario?.papel === 'aluno' ? 'Área do aluno' : 'Área do professor'}</p>
        </div>
        <Button variant="outline" onClick={() => void sair()}>
          Sair
        </Button>
      </header>
      <nav className="flex flex-wrap gap-2" aria-label="Minha área">
        <Button variant={aba === 'turmas' ? 'default' : 'outline'} onClick={() => setAba('turmas')}>
          Minhas turmas
        </Button>
        {usuario?.papel === 'aluno' && (
          <Button variant={aba === 'mensalidades' ? 'default' : 'outline'} onClick={() => setAba('mensalidades')}>
            Minhas mensalidades
          </Button>
        )}
      </nav>
      {aba === 'mensalidades' ? (
        <MinhasMensalidades />
      ) : q.error ? (
        <EstadoErro erro={q.error} aoRecarregar={q.reload} />
      ) : !q.data ? (
        <p>Carregando turmas…</p>
      ) : q.data.length === 0 ? (
        <EstadoVazio titulo="Nenhuma turma vinculada." descricao="A secretaria precisa vincular sua matrícula ou atribuição docente." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {q.data.map((t) => (
            <section key={t.id} className="space-y-2 rounded-xl border p-5">
              <h2 className="text-lg font-semibold">{t.nome}</h2>
              <p>
                {t.idioma_nome} · Nível {t.nivel} · {t.ano_letivo}
              </p>
              <p className="text-muted-foreground">{t.horario ?? 'Horário a confirmar'}</p>
              {usuario?.papel === 'professor' && <AlunosTurma id={t.id} />}
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
function AlunosTurma({ id }: { id: number }) {
  const [aberto, setAberto] = useState(false);
  const q = useQuery(
    () => (aberto ? api.get<{ id: number; nome: string }[]>(`/portal/turmas/${id}/alunos`) : Promise.resolve([])),
    [aberto, id],
  );
  return (
    <div>
      <Button variant="outline" onClick={() => setAberto(!aberto)}>
        {aberto ? 'Ocultar alunos' : 'Ver alunos'}
      </Button>
      {aberto &&
        (q.error ? (
          <EstadoErro erro={q.error} />
        ) : (
          <ul className="mt-3 space-y-1">
            {q.data?.map((a) => (
              <li key={a.id}>{a.nome}</li>
            ))}
          </ul>
        ))}
    </div>
  );
}
export function MinhasMensalidades() {
  const q = useQuery(() => api.get<Mensalidade[]>('/portal/mensalidades'), []);
  return q.error ? (
    <EstadoErro erro={q.error} aoRecarregar={q.reload} />
  ) : !q.data ? (
    <p>Carregando…</p>
  ) : (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Minhas mensalidades</h2>
      {q.data.length === 0 ? (
        <p>Nenhuma mensalidade.</p>
      ) : (
        <div className="overflow-auto">
          <table className="w-full text-left">
            <thead>
              <tr>
                <th>Competência</th>
                <th>Vencimento</th>
                <th>Valor</th>
                <th>Situação</th>
              </tr>
            </thead>
            <tbody>
              {q.data.map((m) => (
                <tr key={m.id} className="border-b">
                  <td className="py-3">{m.competencia}</td>
                  <td>{data(m.vencimento)}</td>
                  <td>{brl(m.valor_atualizado)}</td>
                  <td>{m.status === 'paga' ? 'Paga' : m.atrasada ? 'Em atraso' : m.status === 'cancelada' ? 'Cancelada' : 'Em aberto'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-sm text-muted-foreground">Valores em reais. Para dúvidas e regularização, procure a secretaria.</p>
    </section>
  );
}
