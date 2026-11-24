import { useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { api, mensagemErro } from '@/lib/api';
import { brl, competencia, data } from '@/lib/format';
import { FORMAS_PAGAMENTO, lerValor, diasTxt, encargosEm, hojeLocal } from '@/lib/financeiro';
import { cn } from '@/lib/utils';
import type { Mensalidade } from '../../shared/types.ts';

const numero = lerValor;

function esquema(hoje: string) {
  return z.object({
    valor_pago: z.string().refine((v) => numero(v) > 0, 'Informe um valor pago maior que zero.'),
    data_pagamento: z
      .string()
      .min(1, 'Informe a data do pagamento.')
      .refine((v) => v <= hoje, 'A data do pagamento não pode ser futura.'),
    forma_pagamento: z.string().min(1, 'Escolha a forma de pagamento.'),
  });
}
type Valores = z.infer<ReturnType<typeof esquema>>;

interface Props {
  mensalidade: Mensalidade | null;
  aoFechar: () => void;
  aoPagar: () => void;
  aoDesfazer: (m: Mensalidade) => void;
}

/** Registrar pagamento. O conteúdo só existe com o diálogo aberto, então o estado reinicia a cada abertura. */
export function PagamentoDialog({ mensalidade, aoFechar, aoPagar, aoDesfazer }: Props) {
  return (
    <Dialog open={mensalidade !== null} onOpenChange={(a) => !a && aoFechar()}>
      <DialogContent className="sm:max-w-md">
        {mensalidade && <PagamentoConteudo m={mensalidade} aoFechar={aoFechar} aoPagar={aoPagar} aoDesfazer={aoDesfazer} />}
      </DialogContent>
    </Dialog>
  );
}

/** O valor sugerido acompanha a data (multa e juros), até o usuário editá-lo. */
function PagamentoConteudo({ m, aoFechar, aoPagar, aoDesfazer }: Omit<Props, 'mensalidade'> & { m: Mensalidade }) {
  const hoje = hojeLocal();
  const form = useForm<Valores>({
    resolver: zodResolver(esquema(hoje)),
    defaultValues: { valor_pago: m.valor_atualizado.toFixed(2), data_pagamento: hoje, forma_pagamento: 'pix' },
  });
  const [editado, setEditado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const dataEscolhida = useWatch({ control: form.control, name: 'data_pagamento' });

  const calc = encargosEm(m, /^\d{4}-\d{2}-\d{2}$/.test(dataEscolhida) ? dataEscolhida : hoje);
  useEffect(() => {
    if (!editado) form.setValue('valor_pago', calc.total.toFixed(2));
  }, [calc.total, editado]); // eslint-disable-line react-hooks/exhaustive-deps

  async function enviar(v: Valores) {
    if (enviando) return;
    if (Math.round(numero(v.valor_pago) * 100) < Math.round(calc.total * 100)) {
      form.setError('valor_pago', {
        message: `Pagamento insuficiente. Informe pelo menos ${brl(calc.total)} para quitar esta mensalidade.`,
      });
      return;
    }
    setEnviando(true);
    try {
      const paga = await api.post<Mensalidade>(`/mensalidades/${m.id}/pagar`, {
        valor_pago: numero(v.valor_pago),
        forma_pagamento: v.forma_pagamento,
        data_pagamento: v.data_pagamento,
      });
      toast.success(`Pagamento de ${brl(paga.valor_pago)} registrado — ${m.aluno_nome ?? ''}, ${competencia(m.competencia)}`, {
        action: { label: 'Desfazer', onClick: () => aoDesfazer({ ...m, ...paga }) },
        duration: 6000,
      });
      aoPagar();
    } catch (err) {
      form.setError('root', { message: mensagemErro(err) }); // erro do servidor (já paga, data futura…) mantém o diálogo aberto
    } finally {
      setEnviando(false);
    }
  }

  const sugerido = editado && Math.abs(numero(form.getValues('valor_pago')) - calc.total) >= 0.005;
  return (
    <>
      <DialogHeader>
        <DialogTitle>Registrar pagamento</DialogTitle>
        <DialogDescription>
          {m.aluno_nome} · {m.idioma_nome ?? '—'}
          {m.turma_nome ? ` · ${m.turma_nome}` : ''}. Competência {competencia(m.competencia)}, vence em {data(m.vencimento)}.
        </DialogDescription>
      </DialogHeader>
      <Form {...form}>
        <form id="form-pagamento" noValidate onSubmit={form.handleSubmit(enviar)} className="grid gap-4">
          <p className="text-sm text-muted-foreground">
            Nesta versão, o pagamento deve quitar o valor integral na data escolhida. Pagamentos parciais ainda não estão disponíveis.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="valor_pago"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Valor pago (R$)</FormLabel>
                  <FormControl>
                    <Input
                      inputMode="decimal"
                      className="tabular-nums"
                      {...field}
                      onChange={(e) => {
                        setEditado(true);
                        field.onChange(e);
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="data_pagamento"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Data do pagamento</FormLabel>
                  <FormControl>
                    <Input type="date" max={hoje} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <FormField
            control={form.control}
            name="forma_pagamento"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Forma de pagamento</FormLabel>
                <div role="radiogroup" aria-label="Forma de pagamento" className="flex flex-wrap gap-2">
                  {FORMAS_PAGAMENTO.map((f) => (
                    <label
                      key={f.valor}
                      className={cn(
                        'flex h-9 cursor-pointer items-center rounded-lg border border-input px-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-accent has-[:checked]:text-primary has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
                      )}
                    >
                      <input
                        type="radio"
                        className="sr-only"
                        name={field.name}
                        value={f.valor}
                        checked={field.value === f.valor}
                        onChange={() => field.onChange(f.valor)}
                      />
                      {f.rotulo}
                    </label>
                  ))}
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
          {
            <div aria-live="polite" className="rounded-lg bg-inset p-3 text-sm">
              {calc.dias > 0 ? (
                <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 tabular-nums">
                  <dt>Valor original</dt>
                  <dd className="text-right">{brl(m.valor)}</dd>
                  <dt>Multa (2%)</dt>
                  <dd className="text-right">{brl(calc.multa)}</dd>
                  <dt>Juros 1% a.m. ({diasTxt(calc.dias)})</dt>
                  <dd className="text-right">{brl(calc.juros)}</dd>
                  <dt className="font-semibold">Atualizado em {data(dataEscolhida)}</dt>
                  <dd className="text-right font-semibold">{brl(calc.total)}</dd>
                </dl>
              ) : (
                <p className="text-muted-foreground">Pagamento até o vencimento: sem multa nem juros ({brl(m.valor)}).</p>
              )}
              {sugerido && (
                <Button
                  type="button"
                  variant="link"
                  className="h-auto p-0"
                  onClick={() => {
                    setEditado(false);
                    form.setValue('valor_pago', calc.total.toFixed(2));
                  }}
                >
                  Usar {brl(calc.total)}
                </Button>
              )}
            </div>
          }
          {form.formState.errors.root && (
            <p role="alert" className="text-sm text-danger-deep">
              {form.formState.errors.root.message}
            </p>
          )}
        </form>
      </Form>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={aoFechar} disabled={enviando}>
          Cancelar
        </Button>
        <Button type="submit" form="form-pagamento" disabled={enviando}>
          {enviando ? 'Registrando…' : 'Registrar pagamento'}
        </Button>
      </DialogFooter>
    </>
  );
}
