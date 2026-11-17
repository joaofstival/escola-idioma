import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Copy, Lock, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/page-header';
import { ConfirmarApagar } from '@/components/confirmar-apagar';
import { EstadoErro, EstadoVazio, TabelaCarregando } from '@/components/estados';
import { FiltroSelect } from '@/components/filtro-select';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useQuery } from '@/hooks/use-query';
import { api, mensagemErro } from '@/lib/api';
import { data as fmtData } from '@/lib/format';
import type { Avaliacao } from '../../shared/types.ts';

export default function Avaliacoes() {
  const [turma, setTurma] = useState('todas');
  const [apagando, setApagando] = useState<Avaliacao | null>(null);
  const navigate = useNavigate();
  const turmas = useQuery(() => api.get<{ id: number; nome: string }[]>('/turmas'), []);
  const q = useQuery(() => api.get<Avaliacao[]>('/avaliacoes', { turma_id: turma === 'todas' ? undefined : turma }), [turma]);

  async function duplicar(a: Avaliacao) {
    try {
      const c = await api.post<Avaliacao>(`/avaliacoes/${a.id}/duplicar`, {});
      toast.success(`Criada a cópia “${c.titulo}”.`);
      navigate(`/avaliacoes/${c.id}`);
    } catch (err) {
      toast.error(mensagemErro(err));
    }
  }
  async function apagar(a: Avaliacao) {
    try {
      await api.del(`/avaliacoes/${a.id}`);
      toast.success(`Avaliação “${a.titulo}” apagada.`);
      q.reload();
    } catch (err) {
      toast.error(mensagemErro(err));
    }
  }

  const itens = q.data ?? [];
  return (
    <>
      <PageHeader
        title="Avaliações"
        description="Avaliações por turma, com perguntas configuráveis. Depois da primeira resposta a avaliação fica travada: para mudar, duplique."
      >
        <Button asChild>
          <Link to="/avaliacoes/nova">
            <Plus aria-hidden="true" />
            Nova avaliação
          </Link>
        </Button>
      </PageHeader>
      <div className="mb-4">
        <FiltroSelect
          rotulo="Filtrar por turma"
          valor={turma}
          aoMudar={setTurma}
          className="w-64"
          opcoes={[
            { valor: 'todas', rotulo: 'Todas as turmas' },
            ...(turmas.data ?? []).map((t) => ({ valor: String(t.id), rotulo: t.nome })),
          ]}
        />
      </div>
      {q.error ? (
        <EstadoErro erro={q.error} aoRecarregar={q.reload} titulo="Não foi possível carregar as avaliações." />
      ) : !q.loading && itens.length === 0 ? (
        <EstadoVazio
          titulo={turma === 'todas' ? 'Nenhuma avaliação criada.' : 'Esta turma não tem avaliações.'}
          descricao="Crie uma avaliação a partir de um modelo pronto ou em branco."
        >
          <Button asChild>
            <Link to="/avaliacoes/nova">
              <Plus aria-hidden="true" />
              Nova avaliação
            </Link>
          </Button>
        </EstadoVazio>
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Título</TableHead>
                <TableHead>Turma</TableHead>
                <TableHead className="text-right">Perguntas</TableHead>
                <TableHead className="text-right">Respostas</TableHead>
                <TableHead>Criada em</TableHead>
                <TableHead className="w-px">
                  <span className="sr-only">Ações</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            {!q.data ? (
              <TabelaCarregando colunas={6} />
            ) : (
              <TableBody aria-busy={q.loading}>
                {itens.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>
                      <Link to={`/avaliacoes/${a.id}`} className="font-medium text-primary hover:underline">
                        {a.titulo}
                      </Link>
                      {a.travada && (
                        <StatusBadge tom="info" className="ml-2">
                          <Lock className="mr-1 size-3" aria-hidden="true" />
                          Travada
                        </StatusBadge>
                      )}
                    </TableCell>
                    <TableCell>{a.turma_nome ?? '—'}</TableCell>
                    <TableCell className="text-right tabular-nums">{a.form.questions.length}</TableCell>
                    <TableCell className="text-right tabular-nums">{a.total_respostas}</TableCell>
                    <TableCell>{fmtData(a.criado_em)}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <Button variant="ghost" size="sm" onClick={() => void duplicar(a)} aria-label={`Duplicar avaliação ${a.titulo}`}>
                        <Copy aria-hidden="true" />
                        Duplicar
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setApagando(a)}
                        disabled={a.travada}
                        aria-label={`Apagar avaliação ${a.titulo}`}
                        title={a.travada ? 'Não é possível apagar: a avaliação já tem respostas' : undefined}
                      >
                        <Trash2 aria-hidden="true" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            )}
          </Table>
        </div>
      )}
      <ConfirmarApagar
        alvo={apagando ? { tipo: 'avaliação', nome: apagando.titulo } : null}
        aoCancelar={() => setApagando(null)}
        aoConfirmar={() => {
          const a = apagando;
          setApagando(null);
          if (a) void apagar(a);
        }}
      />
    </>
  );
}
