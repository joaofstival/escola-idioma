// Borda dos testes de interface: window.escola.request é a única coisa falsa (o contrato REST já é testado no backend).
import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { Toaster } from '@/components/ui/sonner';
import type { ApiResponse } from '../../shared/types.ts';

export type Resposta =
  | { data: unknown }
  | { status: number; erro: string; detalhes?: string[] }
  | ((corpo: unknown) => { data: unknown } | { status: number; erro: string; detalhes?: string[] });
export type Rotas = Record<string, Resposta | Resposta[]>;

/** Instala window.escola com rotas "MÉTODO /caminho" (sem query). Lista de respostas = uma por chamada (a última se repete). */
export function instalarEscola(rotas: Rotas) {
  const chamadas: { metodo: string; caminho: string; corpo: unknown }[] = [];
  const contagem = new Map<string, number>();
  const request = vi.fn(async ({ method, path, body }: { method: string; path: string; body?: unknown }): Promise<ApiResponse<unknown>> => {
    const caminho = path.split('?')[0];
    const chave = `${method} ${caminho}`;
    chamadas.push({ metodo: method, caminho, corpo: body });
    let r = rotas[chave];
    if (Array.isArray(r)) {
      const n = contagem.get(chave) ?? 0;
      contagem.set(chave, n + 1);
      r = r[Math.min(n, r.length - 1)];
    }
    if (r === undefined) return { ok: false, status: 404, erro: `rota não simulada: ${chave}` };
    const out = typeof r === 'function' ? r(body) : r;
    return 'data' in out
      ? { ok: true, status: 200, data: out.data }
      : { ok: false, status: out.status, erro: out.erro, detalhes: 'detalhes' in out ? out.detalhes : undefined };
  });
  (window as unknown as { escola: unknown }).escola = { request, saveFile: vi.fn(), exportarBackup: vi.fn(), restaurarBackup: vi.fn() };
  return {
    chamadas,
    request,
    de: (metodo: string, caminho: string) => chamadas.filter((c) => c.metodo === metodo && c.caminho === caminho),
  };
}

export function renderizar(ui: ReactElement, rota = '/') {
  return render(
    <MemoryRouter initialEntries={[rota]}>
      {ui}
      <Toaster />
    </MemoryRouter>,
  );
}
