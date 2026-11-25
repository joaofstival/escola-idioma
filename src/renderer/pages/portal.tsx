import { ResumoPortal } from '@/components/resumo-portal';
import Traducao from './traducao';
import { MinhaConta } from '@/components/minha-conta';
import Comunicacao from './comunicacao';
import {
  BookOpen,
  ClipboardCheck,
  GraduationCap,
  Languages,
  LayoutDashboard,
  Presentation,
  ScrollText,
  UserRound,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { Routes, Route, useLocation, Link, useNavigate } from 'react-router-dom';
import { AvaliacaoDetalhe, AvaliacaoNova } from './avaliacao-detalhe';
import MinhasAvaliacoes from './minhas-avaliacoes';
import Avaliacoes from './avaliacoes';
import Atividades from './atividades';
import Biblioteca from './biblioteca';
import Agenda from './agenda';
import { ExtratoFinanceiro } from './extrato-financeiro';
import { useState } from 'react';
import { useSessao } from '@/auth/sessao';
import { useQuery } from '@/hooks/use-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/page-header';
import { Moldura, classeItemMenu } from '@/components/shell';
import { StatusBadge } from '@/components/status-badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { valorRelevante } from '@/lib/financeiro';
import { EstadoErro, EstadoVazio, TabelaCarregando } from '@/components/estados';
import { brl, competencia, data } from '@/lib/format';
import type { Mensalidade } from '../../shared/types';
type Turma = { id: number; nome: string; idioma_nome: string; nivel: number; ano_letivo: number; horario: string | null };
type ItemPortal = { aba: string; rotulo: string; icone: LucideIcon; so?: 'aluno' | 'professor' };
const GRUPOS: { grupo: string; itens: ItemPortal[] }[] = [
  {
    grupo: 'Geral',
    itens: [
      { aba: 'inicio', rotulo: 'Início', icone: LayoutDashboard },
      { aba: 'comunicacao', rotulo: 'Avisos e secretaria', icone: ScrollText },
    ],
  },
  {
    grupo: 'Acadêmico',
    itens: [
      { aba: 'turmas', rotulo: 'Minhas turmas', icone: Presentation },
      { aba: 'agenda', rotulo: 'Agenda e frequência', icone: GraduationCap },
      { aba: 'biblioteca', rotulo: 'Meus materiais', icone: BookOpen },
      { aba: 'atividades', rotulo: 'Atividades e notas', icone: ClipboardCheck },
      { aba: 'avaliacoes', rotulo: 'Avaliações e feedback', icone: ClipboardCheck },
    ],
  },
  { grupo: 'Financeiro', itens: [{ aba: 'mensalidades', rotulo: 'Minhas mensalidades', icone: Wallet, so: 'aluno' }] },
  {
    grupo: 'Ferramentas',
    itens: [
      { aba: 'traducao', rotulo: 'Tradutor de estudo', icone: Languages },
      { aba: 'conta', rotulo: 'Minha conta', icone: UserRound },
    ],
  },
];

export default function Portal() {
  const { usuario } = useSessao();
  const location = useLocation();
  const [aba, alterarAba] = useState('inicio');
  const navigate = useNavigate();
  const setAba = (valor: string) => {
    alterarAba(valor);
    if (location.pathname.startsWith('/avaliacoes')) navigate('/');
  };
  const q = useQuery(() => api.get<Turma[]>('/portal/turmas'), []);
  const ativa = location.pathname.startsWith('/avaliacoes') ? 'avaliacoes' : aba;
  const navegacao = (aoNavegar: () => void) => (
    <nav aria-label="Minha área" className="flex flex-col gap-4 px-3 pb-4">
      {GRUPOS.map((g) => ({ ...g, itens: g.itens.filter((i) => !i.so || i.so === usuario?.papel) }))
        .filter((g) => g.itens.length > 0)
        .map((g) => (
          <div key={g.grupo} className="flex flex-col gap-1">
            <div className="px-3 text-xs font-medium text-muted-foreground">{g.grupo}</div>
            {g.itens.map(({ aba: id, rotulo, icone: Icone }) => (
              <button
                key={id}
                type="button"
                aria-current={ativa === id ? 'page' : undefined}
                className={classeItemMenu(ativa === id)}
                onClick={() => {
                  setAba(id);
                  aoNavegar();
                }}
              >
                <Icone className="size-4 shrink-0" aria-hidden="true" />
                {rotulo}
              </button>
            ))}
          </div>
        ))}
    </nav>
  );
  return (
    <Moldura navegacao={navegacao}>
      {ativa === 'avaliacoes' ? (
        usuario?.papel === 'aluno' ? (
          <MinhasAvaliacoes />
        ) : (
          <ProfessorAvaliacoes />
        )
      ) : ativa === 'inicio' ? (
        <>
          <PageHeader
            title={`Olá, ${usuario?.nome ?? ''}`}
            description={usuario?.papel === 'aluno' ? 'Área do aluno' : 'Área do professor'}
          />
          <ResumoPortal abrir={setAba} />
        </>
      ) : ativa === 'traducao' ? (
        <Traducao />
      ) : ativa === 'comunicacao' ? (
        <Comunicacao />
      ) : ativa === 'atividades' ? (
        <Atividades />
      ) : ativa === 'biblioteca' ? (
        <Biblioteca />
      ) : ativa === 'agenda' ? (
        <Agenda />
      ) : ativa === 'mensalidades' ? (
        <MinhasMensalidades />
      ) : ativa === 'conta' ? (
        <>
          <PageHeader title="Minha conta" description="Altere a senha de acesso." />
          <MinhaConta />
        </>
      ) : (
        <>
          <PageHeader title="Minhas turmas" />
          {q.error ? (
            <EstadoErro erro={q.error} aoRecarregar={q.reload} />
          ) : !q.data ? (
            <p>Carregando turmas…</p>
          ) : q.data.length === 0 ? (
            <EstadoVazio titulo="Nenhuma turma vinculada." descricao="A secretaria precisa vincular sua matrícula ou atribuição docente." />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {q.data.map((t) => (
                <section key={t.id} className="space-y-2 rounded-xl border p-5">
                  <h2 className="text-base font-semibold">{t.nome}</h2>
                  <p>
                    {t.idioma_nome} · Nível {t.nivel} · {t.ano_letivo}
                  </p>
                  <p className="text-muted-foreground">{t.horario ?? 'Horário a confirmar'}</p>
                  {usuario?.papel === 'professor' && <AlunosTurma id={t.id} />}
                </section>
              ))}
            </div>
          )}
        </>
      )}
    </Moldura>
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
  const [extrato, setExtrato] = useState<number | null>(null);
  const q = useQuery(() => api.get<Mensalidade[]>('/portal/mensalidades'), []);
  return (
    <>
      <PageHeader title="Minhas mensalidades" description="Valores em reais. Para dúvidas e regularização, procure a secretaria." />
      {extrato !== null && <ExtratoFinanceiro id={extrato} somenteLeitura fechar={() => setExtrato(null)} />}
      {q.error ? (
        <EstadoErro erro={q.error} aoRecarregar={q.reload} />
      ) : q.data && q.data.length === 0 ? (
        <EstadoVazio titulo="Nenhuma mensalidade." />
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Competência</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead className="w-px">
                  <span className="sr-only">Ações</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            {!q.data ? (
              <TabelaCarregando colunas={5} />
            ) : (
              <TableBody>
                {q.data.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>{competencia(m.competencia)}</TableCell>
                    <TableCell>{data(m.vencimento)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {brl(valorRelevante(m))}
                      {m.parcial && <div className="text-xs text-muted-foreground">Pagamento parcial</div>}
                    </TableCell>
                    <TableCell>
                      {m.status === 'paga' ? (
                        <StatusBadge tom="ok">Paga</StatusBadge>
                      ) : m.status === 'cancelada' ? (
                        <StatusBadge tom="neutro">Cancelada</StatusBadge>
                      ) : m.atrasada ? (
                        <StatusBadge tom="perigo">Em atraso</StatusBadge>
                      ) : (
                        <StatusBadge tom="info">Em aberto</StatusBadge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" onClick={() => setExtrato(m.id)}>
                        Ver histórico
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            )}
          </Table>
        </div>
      )}
    </>
  );
}

function ProfessorAvaliacoes() {
  return (
    <>
      <Button variant="link" asChild>
        <Link to="/avaliacoes">Lista de avaliações</Link>
      </Button>
      <Routes>
        <Route path="/avaliacoes/nova" element={<AvaliacaoNova />} />
        <Route path="/avaliacoes/:id" element={<AvaliacaoDetalhe />} />
        <Route path="*" element={<Avaliacoes />} />
      </Routes>
    </>
  );
}
