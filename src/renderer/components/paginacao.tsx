import { Button } from '@/components/ui/button';
export function Paginacao({
  pagina,
  total,
  tamanho = 25,
  mudar,
  carregando,
}: {
  pagina: number;
  total: number;
  tamanho?: number;
  mudar: (pagina: number) => void;
  carregando?: boolean;
}) {
  const paginas = Math.max(1, Math.ceil(total / tamanho));
  return (
    <nav aria-label="Paginação" className="flex items-center justify-between gap-3 py-4">
      <span className="text-sm text-muted-foreground">
        {total} registro(s) · Página {pagina} de {paginas}
      </span>
      <div className="flex gap-2">
        <Button variant="outline" disabled={carregando || pagina <= 1} onClick={() => mudar(pagina - 1)}>
          Anterior
        </Button>
        <Button variant="outline" disabled={carregando || pagina >= paginas} onClick={() => mudar(pagina + 1)}>
          Próxima
        </Button>
      </div>
    </nav>
  );
}
