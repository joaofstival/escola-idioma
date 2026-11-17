import { Ellipsis, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export interface AcaoLinha {
  rotulo: string;
  icone?: LucideIcon;
  aoClicar: () => void;
  destrutiva?: boolean;
  desabilitada?: boolean;
}

/** Menu ⋯ da linha da tabela (botão 36×36). Ações destrutivas vão separadas, no fim. */
export function MenuAcoes({ item, acoes }: { item: string; acoes: AcaoLinha[] }) {
  const normais = acoes.filter((a) => !a.destrutiva);
  const destrutivas = acoes.filter((a) => a.destrutiva);
  const render = (a: AcaoLinha) => (
    <DropdownMenuItem key={a.rotulo} disabled={a.desabilitada} onSelect={a.aoClicar} className={cn('h-9', a.destrutiva && 'text-destructive focus:bg-danger-soft focus:text-danger-deep')}>
      {a.icone && <a.icone className="size-4" aria-hidden="true" />}
      {a.rotulo}
    </DropdownMenuItem>
  );
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Ações de ${item}`}>
          <Ellipsis />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {normais.map(render)}
        {normais.length > 0 && destrutivas.length > 0 && <DropdownMenuSeparator />}
        {destrutivas.map(render)}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
