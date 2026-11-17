import type { ComponentProps, ReactNode } from 'react';
import { useFormContext, type FieldPath, type FieldValues } from 'react-hook-form';
import { Checkbox } from '@/components/ui/checkbox';
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

interface Base<T extends FieldValues> {
  nome: FieldPath<T>;
  rotulo: string;
  dica?: ReactNode;
  obrigatorio?: boolean;
  className?: string;
}

const Rotulo = ({ texto, obrigatorio }: { texto: string; obrigatorio?: boolean }) => (
  <FormLabel>
    {texto}
    {obrigatorio && <span aria-hidden="true"> *</span>}
  </FormLabel>
);

/** Campo de texto ligado ao react-hook-form: rótulo sempre visível, erro inline ligado ao campo (aria-describedby). */
export function CampoTexto<T extends FieldValues>({ nome, rotulo, dica, obrigatorio, className, ...input }: Base<T> & Omit<ComponentProps<typeof Input>, 'name' | 'value' | 'onChange'>) {
  const { control } = useFormContext<T>();
  return (
    <FormField
      control={control}
      name={nome}
      render={({ field }) => (
        <FormItem className={className}>
          <Rotulo texto={rotulo} obrigatorio={obrigatorio} />
          <FormControl>
            <Input {...input} {...field} value={field.value ?? ''} />
          </FormControl>
          {dica && <FormDescription>{dica}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

export function CampoTextarea<T extends FieldValues>({ nome, rotulo, dica, obrigatorio, className, ...area }: Base<T> & Omit<ComponentProps<typeof Textarea>, 'name' | 'value' | 'onChange'>) {
  const { control } = useFormContext<T>();
  return (
    <FormField
      control={control}
      name={nome}
      render={({ field }) => (
        <FormItem className={className}>
          <Rotulo texto={rotulo} obrigatorio={obrigatorio} />
          <FormControl>
            <Textarea {...area} {...field} value={field.value ?? ''} />
          </FormControl>
          {dica && <FormDescription>{dica}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

export interface OpcaoSelect {
  valor: string;
  rotulo: string;
  desabilitada?: boolean;
}

/** Select (valores sempre string; a tela converte). Item vazio: passe uma opção com valor "" e ela vira o texto de "nenhum". */
export function CampoSelect<T extends FieldValues>({
  nome, rotulo, dica, obrigatorio, className, opcoes, placeholder = 'Selecione', disabled,
}: Base<T> & { opcoes: OpcaoSelect[]; placeholder?: string; disabled?: boolean }) {
  const { control } = useFormContext<T>();
  return (
    <FormField
      control={control}
      name={nome}
      render={({ field }) => (
        <FormItem className={className}>
          <Rotulo texto={rotulo} obrigatorio={obrigatorio} />
          <Select value={field.value ? String(field.value) : VAZIO_INTERNO} onValueChange={(v) => field.onChange(v === VAZIO_INTERNO ? '' : v)} disabled={disabled}>
            <FormControl>
              <SelectTrigger className="w-full" onBlur={field.onBlur}>
                <SelectValue placeholder={placeholder} />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {opcoes.map((o) => (
                <SelectItem key={o.valor || VAZIO_INTERNO} value={o.valor || VAZIO_INTERNO} disabled={o.desabilitada}>
                  {o.rotulo}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {dica && <FormDescription>{dica}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
// Radix não aceita valor "" em item de select; "__vazio__" representa "nenhum".
const VAZIO_INTERNO = '__vazio__';

export function CampoCheck<T extends FieldValues>({ nome, rotulo, dica, className }: Omit<Base<T>, 'obrigatorio'>) {
  const { control } = useFormContext<T>();
  return (
    <FormField
      control={control}
      name={nome}
      render={({ field }) => (
        <FormItem className={cn('flex flex-col gap-1', className)}>
          <div className="flex items-center gap-2">
            <FormControl>
              <Checkbox checked={!!field.value} onCheckedChange={(v) => field.onChange(v === true)} />
            </FormControl>
            <FormLabel className="font-normal">{rotulo}</FormLabel>
          </div>
          {dica && <FormDescription>{dica}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
