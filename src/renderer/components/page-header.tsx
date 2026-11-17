import { useEffect, type ReactNode } from 'react';

/** Cabeçalho de página: título à esquerda, ações à direita (secundária antes da primária). Também ajusta o título da janela. */
export function PageHeader({ title, description, children }: { title: string; description?: string; children?: ReactNode }) {
  useEffect(() => {
    document.title = `${title} — Escola de Idiomas`;
  }, [title]);
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold">{title}</h1>
        {description && <p className="mt-1 text-muted-foreground">{description}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </header>
  );
}
