// Helpers compartilhados pelas telas (formulário em modal, estados de carregando/erro,
// barra de ocupação, níveis, anos, moedas). Extraídos do painel pelo orquestrador.
import { $, esc, modal, nivel, showError } from './ui.ts';
import type { ModalHandle } from './ui.ts';

/** Ano corrente (padrão dos filtros de ano letivo). */
export const anoAtual = () => new Date().getFullYear();

/** Moedas oferecidas no cadastro do aluno (as mesmas da cotação). */
export const MOEDAS = ['BRL', 'USD', 'EUR', 'GBP', 'ARS', 'CLP', 'JPY', 'CAD', 'CHF', 'CNY', 'PYG'];

/** <option> dos níveis 1–12 com o rótulo QECR. */
export function opcoesNivel(selected?: number | string | null, vazio?: string): string {
  const head = vazio !== undefined ? `<option value="">${esc(vazio)}</option>` : '';
  return head + Array.from({ length: 12 }, (_, i) => i + 1)
    .map((n) => `<option value="${n}" ${String(selected) === String(n) ? 'selected' : ''}>${nivel(n)}</option>`).join('');
}

/** <option> de anos letivos ao redor do ano atual. */
export function opcoesAno(selected: number, vazio?: string): string {
  const atual = anoAtual();
  const anos = [atual + 1, atual, atual - 1, atual - 2, atual - 3];
  if (!anos.includes(selected)) anos.push(selected);
  return (vazio !== undefined ? `<option value="">${esc(vazio)}</option>` : '') +
    anos.sort((a, b) => b - a).map((a) => `<option value="${a}" ${a === selected ? 'selected' : ''}>${a}</option>`).join('');
}

/** Estado "carregando". */
export const carregando = (msg = 'Carregando…') => `<div class="loading" role="status">${esc(msg)}</div>`;

/** Mostra um estado de erro com botão "Tentar novamente" dentro de `el`. */
export function estadoErro(el: HTMLElement, err: unknown, retry?: () => void): void {
  const msg = (err as Error)?.message || 'Erro inesperado';
  el.innerHTML = `<div class="ac-erro" role="alert"><strong>Não foi possível carregar os dados.</strong><span>${esc(msg)}</span>
    ${retry ? '<button class="btn btn-soft btn-sm" type="button" data-retry>Tentar novamente</button>' : ''}</div>`;
  if (retry) el.querySelector<HTMLButtonElement>('[data-retry]')!.onclick = retry;
}

/** Barra de ocupação "x/cap" colorida conforme a lotação. */
export function barraOcupacao(ocupacao: number | undefined, capacidade: number): string {
  const oc = ocupacao ?? 0;
  const pct = capacidade ? Math.min(100, Math.round((oc / capacidade) * 100)) : 0;
  const tom = oc >= capacidade ? 'cheia' : pct >= 80 ? 'quase' : '';
  return `<div class="ac-ocup ${tom}" title="${oc} de ${capacidade} vagas ocupadas">
    <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="${capacidade}" aria-valuenow="${oc}" aria-label="Ocupação"><span style="width:${pct}%"></span></div>
    <span class="ac-ocup-num">${oc}/${capacidade}</span></div>`;
}

/** Atrasa a execução até o usuário parar de digitar. */
export function debounce<A extends unknown[]>(fn: (...a: A) => void, ms = 300): (...a: A) => void {
  let t: ReturnType<typeof setTimeout> | undefined;
  return (...a: A) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

/**
 * Modal com <form>: Enter envia, o botão principal chama requestSubmit, erros (inclusive 422) vão para showError
 * e o modal só fecha se onSubmit terminar sem erro.
 */
export function formModal(opts: {
  title: string; body: string; submitLabel?: string; size?: 'sm' | 'md' | 'lg';
  onSubmit: (form: HTMLFormElement) => Promise<void>; onOpen?: (form: HTMLFormElement) => void;
}): ModalHandle {
  let form!: HTMLFormElement;
  const h = modal({
    title: opts.title, size: opts.size ?? 'md',
    body: `<form class="ac-form" novalidate>${opts.body}<button type="submit" class="ac-sr-only" tabindex="-1" aria-hidden="true">Enviar</button></form>`,
    actions: [
      { label: 'Cancelar', kind: 'ghost' },
      { label: opts.submitLabel ?? 'Salvar', kind: 'primary', onClick: () => form.requestSubmit() },
    ],
  });
  form = $<HTMLFormElement>(h.el, 'form');
  const botao = h.el.querySelector<HTMLButtonElement>('.modal-foot .btn-primary')!;
  let enviando = false;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (enviando) return;
    const invalido = form.querySelector<HTMLInputElement>(':invalid');
    if (invalido) { invalido.reportValidity(); invalido.focus(); return; }
    enviando = true; botao.disabled = true;
    try { await opts.onSubmit(form); h.close(); }
    catch (err) { showError(err); }
    finally { enviando = false; botao.disabled = false; }
  });
  opts.onOpen?.(form);
  return h;
}

/** Converte strings vazias em null (campos opcionais). */
export function semVazios<T extends Record<string, unknown>>(o: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) out[k] = typeof v === 'string' && v.trim() === '' ? null : typeof v === 'string' ? v.trim() : v;
  return out as T;
}
