import { useId } from 'react';
import { Star } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { pedePorque, type Preenchimento } from '@/lib/avaliacao';
import { cn } from '@/lib/utils';
import type { Question } from '../../shared/types.ts';

interface Props {
  pergunta: Question;
  numero: number;
  valor: Preenchimento;
  erro?: string;
  aoMudar: (v: Preenchimento) => void;
  desabilitado?: boolean;
}

const OPCAO = 'flex min-h-9 cursor-pointer items-center gap-2 rounded-lg border border-input px-3 py-1.5 has-[:checked]:border-primary has-[:checked]:bg-accent has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring';

/** Uma pergunta como o participante a vê. Serve à prévia e ao preenchimento real. */
export function PerguntaParticipante({ pergunta: q, numero, valor, erro, aoMudar, desabilitado }: Props) {
  const id = useId();
  const nome = `p-${id}`;
  const erroId = `${nome}-erro`;
  const set = (p: Preenchimento) => aoMudar({ ...valor, ...p });
  const mostraPorque = (q.type === 'single' && pedePorque(q, valor.opcao)) || (q.type === 'rating' && pedePorque(q, valor.nota));

  return (
    <fieldset disabled={desabilitado} className="space-y-3" aria-describedby={erro ? erroId : undefined}>
      <legend className="text-base font-semibold">
        {numero}. {q.title || <span className="text-muted-foreground">(sem enunciado)</span>}
        {q.required && <span className="ml-1 text-danger-deep" title="Obrigatória"> *<span className="sr-only"> obrigatória</span></span>}
      </legend>
      {q.description && <p className="text-muted-foreground">{q.description}</p>}

      {q.type === 'open' && (q.length === 'long' ? (
        <Textarea aria-label={q.title} rows={4} maxLength={q.maxChars ?? undefined} value={valor.texto ?? ''} onChange={(e) => set({ texto: e.target.value })} />
      ) : (
        <Input aria-label={q.title} maxLength={q.maxChars ?? undefined} value={valor.texto ?? ''} onChange={(e) => set({ texto: e.target.value })} />
      ))}

      {q.type === 'single' && (
        <div className="grid gap-2" role="radiogroup" aria-label={q.title}>
          {q.options?.map((o) => (
            <label key={o.id} className={OPCAO}>
              <input type="radio" name={nome} value={o.id} checked={valor.opcao === o.id} onChange={() => set({ opcao: o.id })} />
              {o.label}
            </label>
          ))}
        </div>
      )}

      {q.type === 'multiple' && (
        <div className="grid gap-2" role="group" aria-label={q.title}>
          {q.options?.map((o) => (
            <label key={o.id} className={OPCAO}>
              <input type="checkbox" checked={valor.opcoes?.includes(o.id) ?? false}
                onChange={(e) => set({ opcoes: e.target.checked ? [...(valor.opcoes ?? []), o.id] : (valor.opcoes ?? []).filter((x) => x !== o.id) })} />
              {o.label}
            </label>
          ))}
          {q.allowOther && (
            <div className="space-y-2">
              <label className={OPCAO}>
                <input type="checkbox" checked={valor.opcoes?.includes('other') ?? false}
                  onChange={(e) => set({ opcoes: e.target.checked ? [...(valor.opcoes ?? []), 'other'] : (valor.opcoes ?? []).filter((x) => x !== 'other') })} />
                Outro
              </label>
              {valor.opcoes?.includes('other') && <Input aria-label="Descreva a opção Outro" placeholder="Descreva" value={valor.texto ?? ''} onChange={(e) => set({ texto: e.target.value })} />}
            </div>
          )}
          {q.maxChoices && <p className="text-xs text-muted-foreground">Escolha até {q.maxChoices}.</p>}
        </div>
      )}

      {q.type === 'rating' && q.scale && (
        <div>
          <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label={q.title}>
            {q.scale.minLabel && <span className="text-xs text-muted-foreground">{q.scale.minLabel}</span>}
            {Array.from({ length: q.scale.max - q.scale.min + 1 }, (_, i) => q.scale!.min + i).map((n) => {
              const marcado = valor.nota !== undefined && (q.scale!.style === 'stars' ? n <= valor.nota : n === valor.nota);
              return (
                <label key={n} className={cn('flex size-9 cursor-pointer items-center justify-center rounded-lg border border-input has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring', marcado && q.scale!.style === 'numbers' && 'border-primary bg-accent text-primary')}>
                  <input type="radio" className="sr-only" name={nome} value={n} checked={valor.nota === n} onChange={() => set({ nota: n })} aria-label={`Nota ${n}`} />
                  {q.scale!.style === 'stars' ? <Star className={cn('size-5', marcado ? 'fill-warning-deep text-warning-deep' : 'text-muted-foreground')} aria-hidden="true" /> : n}
                </label>
              );
            })}
            {q.scale.maxLabel && <span className="text-xs text-muted-foreground">{q.scale.maxLabel}</span>}
          </div>
        </div>
      )}

      {q.type === 'grid' && (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead><tr className="bg-inset"><th className="p-2 text-left font-medium"><span className="sr-only">Item</span></th>
              {q.options?.map((o) => <th key={o.id} className="p-2 text-center font-medium">{o.label}</th>)}</tr></thead>
            <tbody>
              {q.rows?.map((r) => (
                <tr key={r.id} className="border-t">
                  <th scope="row" className="p-2 text-left font-normal">{r.label || '—'}</th>
                  {q.options?.map((o) => (
                    <td key={o.id} className="p-2 text-center">
                      <input type="radio" name={`${nome}-${r.id}`} aria-label={`${r.label}: ${o.label}`} checked={valor.linhas?.[r.id] === o.id}
                        onChange={() => set({ linhas: { ...valor.linhas, [r.id]: o.id } })} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {mostraPorque && (
        <div className="space-y-1.5">
          <label className="text-sm font-medium" htmlFor={`${nome}-porque`}>Conte o porquê</label>
          <Textarea id={`${nome}-porque`} rows={2} value={valor.porque ?? ''} onChange={(e) => set({ porque: e.target.value })} />
        </div>
      )}
      {erro && <p id={erroId} role="alert" className="text-sm text-danger-deep">{erro}</p>}
    </fieldset>
  );
}
