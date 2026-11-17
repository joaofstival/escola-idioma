import { cn } from '@/lib/utils';

/** Barra "x/capacidade": primário normal, âmbar a partir de 80%, vermelho quando lotada (sempre com o número ao lado). */
export function Ocupacao({ ocupacao, capacidade }: { ocupacao: number | undefined; capacidade: number }) {
  const oc = ocupacao ?? 0;
  const pct = capacidade ? Math.min(100, Math.round((oc / capacidade) * 100)) : 0;
  const cheia = oc >= capacidade;
  return (
    <div className="flex items-center gap-2" title={`${oc} de ${capacidade} vagas ocupadas`}>
      <div
        className="h-2 w-24 overflow-hidden rounded-full bg-border"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={capacidade}
        aria-valuenow={oc}
        aria-label="Ocupação"
      >
        <div
          className={cn('h-full rounded-full', cheia ? 'bg-danger-deep' : pct >= 80 ? 'bg-warning-deep' : 'bg-primary')}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs tabular-nums text-muted-foreground">
        {oc}/{capacidade}
      </span>
    </div>
  );
}
