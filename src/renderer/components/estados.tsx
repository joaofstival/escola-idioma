import type { ReactNode } from 'react';
import { CircleAlert, Inbox } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { TableBody, TableCell, TableRow } from '@/components/ui/table';

/** Erro de carga: diz o que houve e oferece tentar de novo. */
export function EstadoErro({ erro, aoRecarregar, titulo = 'Não foi possível carregar os dados.' }: { erro: Error; aoRecarregar?: () => void; titulo?: string }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3 rounded-xl border border-danger-deep/30 bg-danger-soft p-4 text-danger-deep">
      <div className="flex items-center gap-2 font-medium">
        <CircleAlert className="size-4" aria-hidden="true" />
        {titulo}
      </div>
      <p>{erro.message}</p>
      {aoRecarregar && (
        <Button variant="outline" size="sm" onClick={aoRecarregar}>
          Tentar novamente
        </Button>
      )}
    </div>
  );
}

/** Vazio: texto + a ação para criar. */
export function EstadoVazio({ titulo, descricao, children }: { titulo: string; descricao?: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-12 text-center">
      <Inbox className="size-6 text-muted-foreground" aria-hidden="true" />
      <div>
        <p className="font-medium">{titulo}</p>
        {descricao && <p className="mt-1 text-muted-foreground">{descricao}</p>}
      </div>
      {children}
    </div>
  );
}

/** Linhas de esqueleto no corpo da própria tabela, enquanto carrega. */
export function TabelaCarregando({ colunas, linhas = 5 }: { colunas: number; linhas?: number }) {
  return (
    <TableBody aria-busy="true">
      {Array.from({ length: linhas }, (_, i) => (
        <TableRow key={i}>
          {Array.from({ length: colunas }, (_, j) => (
            <TableCell key={j}>
              <Skeleton className="h-4 w-full max-w-40" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </TableBody>
  );
}
