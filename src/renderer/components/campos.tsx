import { useId, useMemo, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { useFormContext, type FieldPath, type FieldValues } from 'react-hook-form';
import { Checkbox } from '@/components/ui/checkbox';
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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
export function CampoTexto<T extends FieldValues>({
  nome,
  rotulo,
  dica,
  obrigatorio,
  className,
  ...input
}: Base<T> & Omit<ComponentProps<typeof Input>, 'name' | 'value' | 'onChange'>) {
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

export function CampoTextarea<T extends FieldValues>({
  nome,
  rotulo,
  dica,
  obrigatorio,
  className,
  ...area
}: Base<T> & Omit<ComponentProps<typeof Textarea>, 'name' | 'value' | 'onChange'>) {
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
  nome,
  rotulo,
  dica,
  obrigatorio,
  className,
  opcoes,
  placeholder = 'Selecione',
  disabled,
}: Base<T> & { opcoes: OpcaoSelect[]; placeholder?: string; disabled?: boolean }) {
  const { control } = useFormContext<T>();
  return (
    <FormField
      control={control}
      name={nome}
      render={({ field }) => (
        <FormItem className={className}>
          <Rotulo texto={rotulo} obrigatorio={obrigatorio} />
          <Select
            value={field.value ? String(field.value) : opcoes.some((o) => !o.valor) ? VAZIO_INTERNO : ''}
            onValueChange={(v) => field.onChange(v === VAZIO_INTERNO ? '' : v)}
            disabled={disabled}
          >
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

const semAcento = (t: string) =>
  t
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

/** Seleção com busca: digite parte do nome (sem acento, maiúscula ou minúscula) e escolha na lista. Para listas grandes. */
export function CampoBusca<T extends FieldValues>({
  nome,
  rotulo,
  dica,
  obrigatorio,
  className,
  opcoes,
  placeholder = 'Selecione',
  buscaPlaceholder = 'Digite para buscar',
  semResultado = 'Nada encontrado.',
}: Base<T> & { opcoes: OpcaoSelect[]; placeholder?: string; buscaPlaceholder?: string; semResultado?: string }) {
  const { control } = useFormContext<T>();
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState('');
  const [ativo, setAtivo] = useState(0);
  const idLista = useId();
  const campoBusca = useRef<HTMLInputElement>(null);
  const filtradas = useMemo(() => {
    const termo = semAcento(busca.trim());
    return termo ? opcoes.filter((o) => semAcento(o.rotulo).includes(termo)) : opcoes;
  }, [opcoes, busca]);

  return (
    <FormField
      control={control}
      name={nome}
      render={({ field }) => {
        const escolhida = opcoes.find((o) => o.valor === String(field.value ?? ''));
        const escolher = (o: OpcaoSelect) => {
          field.onChange(o.valor);
          setAberto(false);
        };
        return (
          <FormItem className={className}>
            <Rotulo texto={rotulo} obrigatorio={obrigatorio} />
            <Popover
              open={aberto}
              onOpenChange={(a) => {
                setAberto(a);
                if (a) {
                  setBusca('');
                  setAtivo(0);
                } else field.onBlur();
              }}
            >
              <FormControl>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    role="combobox"
                    aria-expanded={aberto}
                    aria-controls={idLista}
                    className="flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 text-sm whitespace-nowrap aria-invalid:border-destructive"
                  >
                    <span className={cn('truncate', !escolhida && 'text-muted-foreground')}>{escolhida?.rotulo ?? placeholder}</span>
                    <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </button>
                </PopoverTrigger>
              </FormControl>
              <PopoverContent
                onOpenAutoFocus={(e) => {
                  e.preventDefault();
                  campoBusca.current?.focus();
                }}
              >
                <div className="flex items-center gap-2 border-b px-2 pb-1">
                  <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <input
                    ref={campoBusca}
                    aria-label={`Buscar: ${rotulo}`}
                    aria-controls={idLista}
                    value={busca}
                    placeholder={buscaPlaceholder}
                    onChange={(e) => {
                      setBusca(e.target.value);
                      setAtivo(0);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        setAtivo((i) => Math.min(i + 1, filtradas.length - 1));
                      } else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        setAtivo((i) => Math.max(i - 1, 0));
                      } else if (e.key === 'Enter') {
                        e.preventDefault();
                        const o = filtradas[ativo];
                        if (o && !o.desabilitada) escolher(o);
                      }
                    }}
                    className="h-8 w-full bg-transparent text-sm outline-hidden placeholder:text-muted-foreground"
                  />
                </div>
                <ul id={idLista} role="listbox" aria-label={rotulo} className="max-h-60 overflow-y-auto pt-1">
                  {filtradas.length === 0 && <li className="px-2 py-3 text-sm text-muted-foreground">{semResultado}</li>}
                  {filtradas.map((o, i) => (
                    // teclado: tratado no campo de busca (padrão combobox, foco fica no input)
                    // eslint-disable-next-line jsx-a11y/click-events-have-key-events
                    <li
                      key={o.valor}
                      role="option"
                      aria-selected={o.valor === String(field.value ?? '')}
                      aria-disabled={o.desabilitada || undefined}
                      ref={(el) => {
                        if (el && i === ativo) el.scrollIntoView?.({ block: 'nearest' });
                      }}
                      onMouseEnter={() => setAtivo(i)}
                      onClick={() => !o.desabilitada && escolher(o)}
                      className={cn(
                        'flex cursor-pointer items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-sm',
                        i === ativo && 'bg-accent text-accent-foreground',
                        o.desabilitada && 'cursor-not-allowed opacity-50',
                      )}
                    >
                      <span className="truncate">{o.rotulo}</span>
                      {o.valor === String(field.value ?? '') && <Check className="size-4 shrink-0" aria-hidden="true" />}
                    </li>
                  ))}
                </ul>
              </PopoverContent>
            </Popover>
            {dica && <FormDescription>{dica}</FormDescription>}
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
}
