import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export type Tom = 'ok' | 'atencao' | 'perigo' | 'info' | 'neutro';

// Preenche com -soft, escreve com -deep (docs/DESIGN.md). Sempre acompanhado de texto: cor nunca é o único código.
const TONS: Record<Tom, string> = {
  ok: 'bg-success-soft text-success-deep',
  atencao: 'bg-warning-soft text-warning-deep',
  perigo: 'bg-danger-soft text-danger-deep',
  info: 'bg-info-soft text-info-deep',
  neutro: 'bg-muted text-muted-foreground',
};

export function StatusBadge({ tom, children, className }: { tom: Tom; children: ReactNode; className?: string }) {
  return <Badge className={cn('border-transparent', TONS[tom], className)}>{children}</Badge>;
}
