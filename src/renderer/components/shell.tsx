import { useSessao } from '@/auth/sessao';
import { useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  BookOpen,
  ClipboardCheck,
  Coins,
  GraduationCap,
  Languages,
  LayoutDashboard,
  Menu,
  Presentation,
  ScrollText,
  Settings,
  Users,
  UserRound,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Item {
  rota: string;
  rotulo: string;
  icone: LucideIcon;
}
export const NAVEGACAO: { grupo: string; itens: Item[] }[] = [
  {
    grupo: 'Geral',
    itens: [
      { rota: 'dashboard', rotulo: 'Painel', icone: LayoutDashboard },
      { rota: 'comunicacao', rotulo: 'Avisos e secretaria', icone: ScrollText },
    ],
  },
  {
    grupo: 'Cadastros',
    itens: [
      { rota: 'alunos', rotulo: 'Alunos', icone: Users },
      { rota: 'professores', rotulo: 'Professores', icone: UserRound },
      { rota: 'idiomas', rotulo: 'Idiomas e valores', icone: Languages },
      { rota: 'turmas', rotulo: 'Turmas', icone: Presentation },
    ],
  },
  {
    grupo: 'Ano letivo',
    itens: [
      { rota: 'agenda', rotulo: 'Agenda e frequência', icone: GraduationCap },
      { rota: 'matriculas', rotulo: 'Matrículas', icone: GraduationCap },
      { rota: 'biblioteca', rotulo: 'Biblioteca por turma', icone: BookOpen },
      { rota: 'materiais', rotulo: 'Materiais didáticos', icone: BookOpen },
      { rota: 'atividades', rotulo: 'Atividades e notas', icone: ClipboardCheck },
      { rota: 'avaliacoes', rotulo: 'Avaliações', icone: ClipboardCheck },
    ],
  },
  {
    grupo: 'Financeiro',
    itens: [
      { rota: 'financeiro', rotulo: 'Mensalidades', icone: Wallet },
      { rota: 'cotacao', rotulo: 'Cotação de moedas', icone: Coins },
    ],
  },
  {
    grupo: 'Ferramentas',
    itens: [
      { rota: 'traducao', rotulo: 'Tradutor', icone: ScrollText },
      { rota: 'usuarios', rotulo: 'Contas e acesso', icone: Users },
      { rota: 'configuracoes', rotulo: 'Configurações', icone: Settings },
    ],
  },
];

function Navegacao({ aoNavegar }: { aoNavegar?: () => void }) {
  const { usuario } = useSessao();
  const permitida = (rota: string) =>
    usuario?.papel === 'admin' ||
    (usuario?.papel === 'financeiro'
      ? ['financeiro', 'cotacao', 'traducao', 'comunicacao'].includes(rota)
      : [
          'alunos',
          'professores',
          'idiomas',
          'turmas',
          'matriculas',
          'materiais',
          'biblioteca',
          'agenda',
          'cotacao',
          'traducao',
          'comunicacao',
        ].includes(rota));
  return (
    <nav aria-label="Principal" className="flex flex-col gap-4 px-3 pb-4">
      {NAVEGACAO.map((g) => ({ ...g, itens: g.itens.filter((i) => permitida(i.rota)) }))
        .filter((g) => g.itens.length > 0)
        .map((g) => (
          <div key={g.grupo} className="flex flex-col gap-1">
            <div className="px-3 text-xs font-medium text-muted-foreground">{g.grupo}</div>
            {g.itens.map(({ rota, rotulo, icone: Icone }) => (
              <NavLink
                key={rota}
                to={`/${rota}`}
                onClick={aoNavegar}
                className={({ isActive }) =>
                  cn(
                    'flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors',
                    isActive ? 'bg-accent text-primary' : 'text-foreground hover:bg-accent/60',
                  )
                }
              >
                <Icone className="size-4 shrink-0" aria-hidden="true" />
                {rotulo}
              </NavLink>
            ))}
          </div>
        ))}
    </nav>
  );
}

/** Janela: barra lateral fixa de 240px (menu recolhível em janela estreita) + área de conteúdo branca. */
export function Moldura({ navegacao, children }: { navegacao: (aoNavegar: () => void) => ReactNode; children: ReactNode }) {
  const { pathname } = useLocation();
  const { usuario, sair } = useSessao();
  // O menu aberto vale só para a rota em que foi aberto: ao navegar, fecha sozinho.
  const [abertoEm, setAbertoEm] = useState<string | null>(null);
  const aberto = abertoEm === pathname;
  const setAberto = (v: boolean) => setAbertoEm(v ? pathname : null);

  return (
    <div className="flex min-h-screen">
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-30 flex w-60 shrink-0 flex-col overflow-y-auto border-r bg-inset transition-transform md:sticky md:top-0 md:h-screen md:translate-x-0',
          aberto ? 'translate-x-0 shadow-md' : '-translate-x-full',
        )}
      >
        <div className="flex h-14 items-center gap-2 px-6 text-base font-semibold">
          Escola<span className="text-primary">Idiomas</span>
        </div>
        {navegacao(() => setAberto(false))}
        <div className="mt-auto space-y-2 border-t p-4">
          <p className="truncate text-sm">{usuario?.nome}</p>
          <Button variant="outline" onClick={() => void sair()}>
            Sair
          </Button>
        </div>
      </aside>
      {aberto && <div className="fixed inset-0 z-20 bg-foreground/30 md:hidden" onClick={() => setAberto(false)} aria-hidden="true" />}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-14 items-center border-b px-4 md:hidden">
          <Button variant="ghost" size="icon" aria-label={aberto ? 'Fechar menu' : 'Abrir menu'} onClick={() => setAberto(!aberto)}>
            {aberto ? <X /> : <Menu />}
          </Button>
        </div>
        <main className="mx-auto w-full max-w-[1200px] flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}

export function Shell() {
  return (
    <Moldura navegacao={(aoNavegar) => <Navegacao aoNavegar={aoNavegar} />}>
      <Outlet />
    </Moldura>
  );
}

/** Item de menu no padrão da barra lateral, para navegação por estado (área do aluno/professor). */
export const classeItemMenu = (ativo: boolean) =>
  cn(
    'flex h-9 w-full items-center gap-2 rounded-md px-3 text-left text-sm font-medium transition-colors',
    ativo ? 'bg-accent text-primary' : 'text-foreground hover:bg-accent/60',
  );
