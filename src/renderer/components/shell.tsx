import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  BookOpen, ClipboardCheck, Coins, GraduationCap, Languages, LayoutDashboard, Menu, Presentation,
  ScrollText, Users, UserRound, Wallet, X, type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Item { rota: string; rotulo: string; icone: LucideIcon }
export const NAVEGACAO: { grupo: string; itens: Item[] }[] = [
  { grupo: 'Geral', itens: [{ rota: 'dashboard', rotulo: 'Painel', icone: LayoutDashboard }] },
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
      { rota: 'matriculas', rotulo: 'Matrículas', icone: GraduationCap },
      { rota: 'materiais', rotulo: 'Materiais didáticos', icone: BookOpen },
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
  { grupo: 'Ferramentas', itens: [{ rota: 'traducao', rotulo: 'Tradutor', icone: ScrollText }] },
];

function Navegacao({ aoNavegar }: { aoNavegar?: () => void }) {
  return (
    <nav aria-label="Principal" className="flex flex-col gap-4 px-3 pb-4">
      {NAVEGACAO.map((g) => (
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
export function Shell() {
  const { pathname } = useLocation();
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
        <Navegacao aoNavegar={() => setAberto(false)} />
      </aside>
      {aberto && <div className="fixed inset-0 z-20 bg-foreground/30 md:hidden" onClick={() => setAberto(false)} aria-hidden="true" />}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-14 items-center border-b px-4 md:hidden">
          <Button variant="ghost" size="icon" aria-label={aberto ? 'Fechar menu' : 'Abrir menu'} onClick={() => setAberto(!aberto)}>
            {aberto ? <X /> : <Menu />}
          </Button>
        </div>
        <main className="mx-auto w-full max-w-[1200px] flex-1 p-4 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
