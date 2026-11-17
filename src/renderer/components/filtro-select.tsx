import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export interface OpcaoFiltro {
  valor: string;
  rotulo: string;
}

/** Select de filtro com rótulo acessível. O Radix não aceita valor vazio, então "sem filtro" é uma opção com valor próprio. */
export function FiltroSelect({
  valor,
  aoMudar,
  opcoes,
  rotulo,
  className,
  desabilitado,
  placeholder,
  id,
}: {
  placeholder?: string;
  id?: string;
  valor: string;
  aoMudar: (v: string) => void;
  opcoes: OpcaoFiltro[];
  rotulo: string;
  className?: string;
  desabilitado?: boolean;
}) {
  return (
    <Select value={valor} onValueChange={aoMudar} disabled={desabilitado}>
      <SelectTrigger id={id} aria-label={rotulo} className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {opcoes.map((o) => (
          <SelectItem key={o.valor} value={o.valor}>
            {o.rotulo}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
