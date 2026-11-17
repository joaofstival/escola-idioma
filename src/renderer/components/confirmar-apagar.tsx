import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
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
}

/** Confirmação de ação destrutiva citando o nome do item. `alvo` nulo = fechado. */
export function ConfirmarApagar({
  alvo,
  aoCancelar,
  aoConfirmar,
  rotuloConfirmar,
  rotuloCancelar,
  titulo,
}: {
  alvo: AlvoApagar | null;
  aoCancelar: () => void;
  aoConfirmar: () => void;
  rotuloConfirmar?: string;
  rotuloCancelar?: string;
  titulo?: (a: AlvoApagar) => string;
}) {
  // mantém o último alvo durante a animação de fechar (evita texto vazio piscando)
  const [ultimo, setUltimo] = useState<AlvoApagar | null>(alvo);
  if (alvo && alvo !== ultimo) setUltimo(alvo);
  const a = alvo ?? ultimo;
  return (
    <AlertDialog open={alvo !== null} onOpenChange={(aberto) => !aberto && aoCancelar()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{a ? (titulo ? titulo(a) : `Apagar ${a.tipo} “${a.nome}”?`) : ''}</AlertDialogTitle>
          <AlertDialogDescription>{a?.aviso ?? 'Esta ação não pode ser desfeita.'}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{rotuloCancelar ?? 'Cancelar'}</AlertDialogCancel>
          <AlertDialogAction className={cn(buttonVariants({ variant: 'destructive' }))} onClick={aoConfirmar}>
            {rotuloConfirmar ?? `Apagar ${a?.tipo}`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
