import { useState, type ReactNode } from 'react';
import type { FieldValues, UseFormReturn } from 'react-hook-form';
import { CircleAlert, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form } from '@/components/ui/form';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';

/**
 * Diálogo de formulário: Enter envia, "Cancelar" e "Salvar x" no rodapé, botão com spinner mantendo o rótulo,
 * erro de validação do servidor (422) mostrado no topo. Monte-o só quando aberto (o `useForm` do pai nasce limpo).
 * `aoEnviar` lança erro para manter o diálogo aberto; ao terminar sem erro, chame-se `aoFechar` aqui dentro.
 */
export function FormDialog<T extends FieldValues>({
  titulo, descricao, form, aoEnviar, aoFechar, rotuloSalvar, children, larga,
}: {
  titulo: string;
  descricao?: string;
  form: UseFormReturn<T>;
  aoEnviar: (valores: T) => Promise<void>;
  aoFechar: () => void;
  rotuloSalvar: string;
  children: ReactNode;
  larga?: boolean;
}) {
  const [erro, setErro] = useState<string[] | null>(null);
  const enviando = form.formState.isSubmitting;

  const enviar = form.handleSubmit(async (valores) => {
    setErro(null);
    try {
      await aoEnviar(valores);
      aoFechar();
    } catch (e) {
      const api = e instanceof ApiError && e.detalhes.length ? e.detalhes : null;
      setErro(api ?? [(e as Error)?.message || 'Erro inesperado.']);
    }
  });

  return (
    <Dialog open onOpenChange={(aberto) => !aberto && !enviando && aoFechar()}>
      <DialogContent className={cn(larga ? 'sm:max-w-2xl' : 'sm:max-w-md')}>
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          {descricao ? <DialogDescription>{descricao}</DialogDescription> : <DialogDescription className="sr-only">{titulo}</DialogDescription>}
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={enviar} noValidate className="flex flex-col gap-4">
            {erro && (
              <div role="alert" className="flex gap-2 rounded-lg border border-danger-deep/30 bg-danger-soft p-3 text-danger-deep">
                <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <div>
                  <p className="font-medium">Não foi possível salvar.</p>
                  {erro.length === 1 ? <p>{erro[0]}</p> : <ul className="list-disc pl-4">{erro.map((m) => <li key={m}>{m}</li>)}</ul>}
                </div>
              </div>
            )}
            <div className={cn('grid gap-4', larga && 'sm:grid-cols-2')}>{children}</div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={aoFechar} disabled={enviando}>
                Cancelar
              </Button>
              <Button type="submit" disabled={enviando}>
                {enviando && <Loader2 className="animate-spin" aria-hidden="true" />}
                {rotuloSalvar}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
