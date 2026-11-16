export interface PageParams { segments: string[]; query: Record<string, string> }

/** Contrato de toda tela. render recebe um container vazio e o preenche. Para navegar: location.hash = '#/rota/…'. */
export interface Page {
  title: string;
  render(container: HTMLElement, params: PageParams): void | Promise<void>;
}
