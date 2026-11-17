import { ArrowDown, ArrowUp, ChevronDown, ChevronUp, Plus, Trash2, X } from 'lucide-react';
import { FiltroSelect } from '@/components/filtro-select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LIMITES, OPCOES_PRONTAS, novoId, opcoesDe, rotuloTipo } from '@/lib/avaliacao';
import { cn } from '@/lib/utils';
import type { Question, QuestionOption } from '../../shared/types.ts';

const ESCALAS = [
  { valor: '1-5', rotulo: '1 a 5' },
  { valor: '1-10', rotulo: '1 a 10' },
  { valor: '0-10', rotulo: '0 a 10' },
];

function Check({ rotulo, marcado, aoMudar, dica }: { rotulo: string; marcado: boolean; aoMudar: (v: boolean) => void; dica?: string }) {
  return (
    <label className="flex min-h-9 cursor-pointer items-center gap-2" title={dica}>
      <input type="checkbox" checked={marcado} onChange={(e) => aoMudar(e.target.checked)} />
      {rotulo}
    </label>
  );
}

function Opcoes({ q, aoMudar, rotulo, comPontos }: { q: Question; aoMudar: (q: Question) => void; rotulo: string; comPontos: boolean }) {
  const ops = q.options ?? [];
  const set = (options: QuestionOption[]) => aoMudar({ ...q, options });
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label>{rotulo}</Label>
        <FiltroSelect
          rotulo="Aplicar opções prontas"
          valor=""
          aoMudar={(v) => {
            const p = OPCOES_PRONTAS.find((x) => x.id === v);
            if (p) set(opcoesDe(p));
          }}
          placeholder="Aplicar opções prontas…"
          opcoes={OPCOES_PRONTAS.map((p) => ({ valor: p.id, rotulo: p.rotulo }))}
          className="w-64"
        />
      </div>
      {ops.map((o, i) => (
        <div key={o.id} className="flex items-center gap-2">
          <Input
            aria-label={`Texto da opção ${i + 1}`}
            value={o.label}
            maxLength={LIMITES.rotulo}
            onChange={(e) => set(ops.map((x) => (x.id === o.id ? { ...x, label: e.target.value } : x)))}
          />
          {comPontos && (
            <Input
              aria-label={`Pontos da opção ${i + 1} (0 a 10)`}
              type="number"
              min={0}
              max={10}
              step={0.5}
              className="w-24 tabular-nums"
              placeholder="Pontos"
              value={o.points ?? ''}
              onChange={(e) =>
                set(ops.map((x) => (x.id === o.id ? { ...x, points: e.target.value === '' ? null : Number(e.target.value) } : x)))
              }
            />
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Remover opção ${i + 1}`}
            disabled={ops.length <= LIMITES.opcoesMin}
            title={ops.length <= LIMITES.opcoesMin ? `Mantenha pelo menos ${LIMITES.opcoesMin} opções` : undefined}
            onClick={() => set(ops.filter((x) => x.id !== o.id))}
          >
            <X aria-hidden="true" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={ops.length >= LIMITES.opcoesMax}
        onClick={() => set([...ops, { id: novoId('o'), label: '', points: comPontos ? null : undefined }])}
      >
        <Plus aria-hidden="true" />
        Adicionar opção
      </Button>
    </div>
  );
}

interface Props {
  pergunta: Question;
  indice: number;
  total: number;
  aberta: boolean;
  erros: string[];
  somenteLeitura: boolean;
  aoAbrir: () => void;
  aoMudar: (q: Question) => void;
  aoMover: (delta: -1 | 1) => void;
  aoRemover: () => void;
}

/** Cartão de pergunta: resumido quando fechado, editável no lugar quando aberto. */
export function PerguntaEditor({ pergunta: q, indice, total, aberta, erros, somenteLeitura, aoAbrir, aoMudar, aoMover, aoRemover }: Props) {
  const mudar = (p: Partial<Question>) => aoMudar({ ...q, ...p });
  const idBase = `perg-${q.id}`;
  const resumo = [rotuloTipo(q.type), q.required ? 'obrigatória' : 'opcional', q.countsInScore ? 'conta na nota' : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <li className={cn('rounded-xl border bg-card', aberta && 'border-primary', erros.length > 0 && !aberta && 'border-danger-deep')}>
      <div className="flex items-center gap-2 p-3">
        <button
          type="button"
          onClick={aoAbrir}
          aria-expanded={aberta}
          aria-controls={`${idBase}-corpo`}
          className="flex min-h-9 flex-1 items-center gap-3 rounded-lg text-left outline-offset-2 hover:bg-inset"
        >
          <span className="w-6 text-center font-semibold tabular-nums">{indice + 1}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">
              {q.title || <span className="text-muted-foreground">Pergunta sem enunciado</span>}
            </span>
            <span className="block text-xs text-muted-foreground">
              {resumo}
              {erros.length > 0 && !aberta && <span className="text-danger-deep"> · precisa de ajustes</span>}
            </span>
          </span>
          {aberta ? <ChevronUp className="size-4" aria-hidden="true" /> : <ChevronDown className="size-4" aria-hidden="true" />}
        </button>
        {!somenteLeitura && (
          <div className="flex items-center">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Mover pergunta ${indice + 1} para cima`}
              disabled={indice === 0}
              onClick={() => aoMover(-1)}
            >
              <ArrowUp aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Mover pergunta ${indice + 1} para baixo`}
              disabled={indice === total - 1}
              onClick={() => aoMover(1)}
            >
              <ArrowDown aria-hidden="true" />
            </Button>
            <Button type="button" variant="ghost" size="icon" aria-label={`Remover pergunta ${indice + 1}`} onClick={aoRemover}>
              <Trash2 aria-hidden="true" />
            </Button>
          </div>
        )}
      </div>

      {aberta && (
        <fieldset id={`${idBase}-corpo`} disabled={somenteLeitura} className="space-y-4 border-t p-4">
          <div className="space-y-1.5">
            <Label htmlFor={`${idBase}-t`}>Enunciado</Label>
            <Input id={`${idBase}-t`} value={q.title} maxLength={LIMITES.titulo} onChange={(e) => mudar({ title: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${idBase}-d`}>Descrição de apoio (opcional)</Label>
            <Input id={`${idBase}-d`} value={q.description ?? ''} onChange={(e) => mudar({ description: e.target.value })} />
          </div>

          {q.type === 'open' && (
            <div className="flex flex-wrap items-end gap-4">
              <div className="space-y-1.5">
                <Label>Tamanho da resposta</Label>
                <FiltroSelect
                  rotulo="Tamanho da resposta"
                  valor={q.length ?? 'short'}
                  aoMudar={(v) => mudar({ length: v as 'short' | 'long' })}
                  className="w-40"
                  opcoes={[
                    { valor: 'short', rotulo: 'Curta (uma linha)' },
                    { valor: 'long', rotulo: 'Longa (parágrafo)' },
                  ]}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${idBase}-m`}>Limite de caracteres</Label>
                <Input
                  id={`${idBase}-m`}
                  type="number"
                  min={1}
                  max={5000}
                  className="w-32 tabular-nums"
                  placeholder="Sem limite"
                  value={q.maxChars ?? ''}
                  onChange={(e) => mudar({ maxChars: e.target.value === '' ? null : Number(e.target.value) })}
                />
              </div>
            </div>
          )}

          {(q.type === 'single' || q.type === 'multiple') && (
            <Opcoes q={q} aoMudar={aoMudar} rotulo="Opções" comPontos={q.type === 'single' && q.countsInScore === true} />
          )}

          {q.type === 'multiple' && (
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <Check rotulo="Incluir a opção “Outro”" marcado={q.allowOther === true} aoMudar={(v) => mudar({ allowOther: v })} />
              <div className="flex items-center gap-2">
                <Label htmlFor={`${idBase}-mc`}>Máximo de escolhas</Label>
                <Input
                  id={`${idBase}-mc`}
                  type="number"
                  min={1}
                  max={q.options?.length ?? 1}
                  className="w-24 tabular-nums"
                  placeholder="Sem limite"
                  value={q.maxChoices ?? ''}
                  onChange={(e) => mudar({ maxChoices: e.target.value === '' ? null : Number(e.target.value) })}
                />
              </div>
            </div>
          )}

          {q.type === 'rating' && q.scale && (
            <div className="flex flex-wrap items-end gap-4">
              <div className="space-y-1.5">
                <Label>Escala</Label>
                <FiltroSelect
                  rotulo="Escala da nota"
                  valor={`${q.scale.min}-${q.scale.max}`}
                  className="w-28"
                  opcoes={ESCALAS}
                  aoMudar={(v) => {
                    const [min, max] = v.split('-').map(Number);
                    mudar({ scale: { ...q.scale!, min: min as 0 | 1, max: max as 5 | 10 }, reasonOnMax: null });
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Aparência</Label>
                <FiltroSelect
                  rotulo="Aparência da nota"
                  valor={q.scale.style}
                  className="w-32"
                  opcoes={[
                    { valor: 'stars', rotulo: 'Estrelas' },
                    { valor: 'numbers', rotulo: 'Números' },
                  ]}
                  aoMudar={(v) => mudar({ scale: { ...q.scale!, style: v as 'stars' | 'numbers' } })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${idBase}-min`}>Rótulo da ponta baixa</Label>
                <Input
                  id={`${idBase}-min`}
                  className="w-44"
                  value={q.scale.minLabel ?? ''}
                  onChange={(e) => mudar({ scale: { ...q.scale!, minLabel: e.target.value } })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${idBase}-max`}>Rótulo da ponta alta</Label>
                <Input
                  id={`${idBase}-max`}
                  className="w-44"
                  value={q.scale.maxLabel ?? ''}
                  onChange={(e) => mudar({ scale: { ...q.scale!, maxLabel: e.target.value } })}
                />
              </div>
            </div>
          )}

          {q.type === 'grid' && (
            <>
              <Opcoes q={q} aoMudar={aoMudar} rotulo="Escala da grade (colunas)" comPontos={q.countsInScore === true} />
              <div className="space-y-2">
                <Label>Itens da grade (linhas)</Label>
                {q.rows?.map((r, i) => (
                  <div key={r.id} className="flex items-center gap-2">
                    <Input
                      aria-label={`Texto do item ${i + 1}`}
                      value={r.label}
                      onChange={(e) => mudar({ rows: q.rows!.map((x) => (x.id === r.id ? { ...x, label: e.target.value } : x)) })}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Remover item ${i + 1}`}
                      disabled={q.rows!.length <= 1}
                      onClick={() => mudar({ rows: q.rows!.filter((x) => x.id !== r.id) })}
                    >
                      <X aria-hidden="true" />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={(q.rows?.length ?? 0) >= LIMITES.linhasMax}
                  onClick={() => mudar({ rows: [...(q.rows ?? []), { id: novoId('r'), label: '' }] })}
                >
                  <Plus aria-hidden="true" />
                  Adicionar item
                </Button>
              </div>
            </>
          )}

          <div className="flex flex-wrap gap-x-6 gap-y-1 border-t pt-3">
            <Check rotulo="Resposta obrigatória" marcado={q.required} aoMudar={(v) => mudar({ required: v })} />
            {q.countsInScore !== undefined && (
              <Check
                rotulo="Conta na nota média"
                marcado={q.countsInScore}
                aoMudar={(v) => mudar({ countsInScore: v })}
                dica={q.type === 'rating' ? 'A nota é convertida para 0–10' : 'Cada opção precisa de pontos de 0 a 10'}
              />
            )}
            {q.askReason !== undefined && <Check rotulo="Pedir o porquê" marcado={q.askReason} aoMudar={(v) => mudar({ askReason: v })} />}
          </div>

          {q.askReason && q.type === 'single' && (
            <fieldset className="space-y-1">
              <legend className="text-sm font-medium">Pedir o porquê quando a resposta for (nenhuma marcada = sempre)</legend>
              <div className="flex flex-wrap gap-x-4">
                {q.options?.map((o) => (
                  <Check
                    key={o.id}
                    rotulo={o.label || '(sem texto)'}
                    marcado={q.reasonOn?.includes(o.id) ?? false}
                    aoMudar={(v) => mudar({ reasonOn: v ? [...(q.reasonOn ?? []), o.id] : (q.reasonOn ?? []).filter((x) => x !== o.id) })}
                  />
                ))}
              </div>
            </fieldset>
          )}
          {q.askReason && q.type === 'rating' && q.scale && (
            <div className="flex items-center gap-2">
              <Label htmlFor={`${idBase}-rm`}>Pedir o porquê quando a nota for até</Label>
              <Input
                id={`${idBase}-rm`}
                type="number"
                min={q.scale.min}
                max={q.scale.max}
                className="w-24 tabular-nums"
                placeholder="Sempre"
                value={q.reasonOnMax ?? ''}
                onChange={(e) => mudar({ reasonOnMax: e.target.value === '' ? null : Number(e.target.value) })}
              />
            </div>
          )}

          {erros.length > 0 && (
            <ul role="alert" className="list-disc space-y-0.5 pl-5 text-sm text-danger-deep">
              {erros.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
        </fieldset>
      )}
    </li>
  );
}
