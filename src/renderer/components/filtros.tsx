import { useId, type ReactNode } from 'react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { OpcaoSelect } from '@/components/campos';
import { cn } from '@/lib/utils';

const TODOS = '__todos__';

/** Select de filtro com rótulo visível. Valor '' = sem filtro (primeira opção deve ter valor ''). */
export function FiltroSelect({
  rotulo,
  valor,
  aoMudar,
  opcoes,
  className,
}: {
  rotulo: string;
  valor: string;
  aoMudar: (v: string) => void;
  opcoes: OpcaoSelect[];
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <Label htmlFor={id}>{rotulo}</Label>
      <Select value={valor || TODOS} onValueChange={(v) => aoMudar(v === TODOS ? '' : v)}>
        <SelectTrigger id={id} className="w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {opcoes.map((o) => (
            <SelectItem key={o.valor || TODOS} value={o.valor || TODOS}>
              {o.rotulo}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** Barra de filtros acima da tabela: filtros à esquerda, contagem à direita. */
export function BarraFiltros({ children, total }: { children: ReactNode; total?: string }) {
  return (
    <div className="mb-4 flex flex-wrap items-end gap-4">
      {children}
      <div className="flex-1" />
      {total && (
        <span className="pb-2 text-muted-foreground" aria-live="polite">
          {total}
        </span>
      )}
    </div>
  );
}
