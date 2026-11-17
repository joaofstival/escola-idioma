import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface AlvoApagar {
  /** Nome do item, citado no diálogo ("Apagar aluno Maria"). */
  nome: string;
  /** Texto do tipo, no singular minúsculo: "aluno", "turma"... */
  tipo: string;
  /** Aviso extra (efeitos colaterais). */
  aviso?: string;
  /** Verbo do título, padrão "Apagar" (ex.: "Estornar"). */
  verbo?: string;
}

/** Confirmação de ação destrutiva citando o nome do item. `alvo` nulo = fechado. */
export function ConfirmarApagar({
  alvo, aoCancelar, aoConfirmar, rotuloConfirmar,
}: { alvo: AlvoApagar | null; aoCancelar: () => void; aoConfirmar: () => void; rotuloConfirmar?: string }) {
  return (
    <AlertDialog open={alvo !== null} onOpenChange={(aberto) => !aberto && aoCancelar()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {alvo?.verbo ?? 'Apagar'} {alvo?.tipo} “{alvo?.nome}”?
          </AlertDialogTitle>
          <AlertDialogDescription>{alvo?.aviso ?? 'Esta ação não pode ser desfeita.'}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction className={cn(buttonVariants({ variant: 'destructive' }))} onClick={aoConfirmar}>
            {rotuloConfirmar ?? `Apagar ${alvo?.tipo}`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
