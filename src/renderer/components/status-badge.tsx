import { cn } from '@/lib/utils';

const TONS = {
  ok: 'bg-success-soft text-success-deep',
  aviso: 'bg-warning-soft text-warning-deep',
  perigo: 'bg-danger-soft text-danger-deep',
  info: 'bg-info-soft text-info-deep',
  neutro: 'bg-muted text-muted-foreground',
} as const;
export type Tom = keyof typeof TONS;

/** Status sempre com texto (cor nunca é o único código). Preenche com -soft e escreve com -deep. */
export function StatusBadge({ tom, children, className }: { tom: Tom; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex w-fit items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap', TONS[tom], className)}>
      {children}
    </span>
  );
}
