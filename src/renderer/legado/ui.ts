// Helpers de interface compartilhados por todas as telas.
import type { ApiError } from './api.ts';

/** Escapa texto para interpolar em HTML. Use SEMPRE em dados vindos da API ou do usuário. */
export function esc(v: unknown): string {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export const brl = (n: number | null | undefined) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const money = (n: number | null | undefined, currency = 'BRL') => {
  try { return Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency }); }
  catch { return `${currency} ${Number(n || 0).toFixed(2)}`; }
};
export const date = (iso: string | null | undefined) =>
  iso ? new Date(iso.length === 10 ? iso + 'T12:00:00' : iso).toLocaleDateString('pt-BR') : '—';
export const competencia = (ym: string | null | undefined) => { if (!ym) return '—'; const [y, m] = ym.split('-'); return `${m}/${y}`; };
export const today = () => new Date().toISOString().slice(0, 10);

export type PillKind = 'ok' | 'warn' | 'danger' | 'info' | 'muted';
/** Pílula de status. */
export const pill = (text: string, kind: PillKind = 'muted') => `<span class="pill pill-${kind}">${esc(text)}</span>`;

/** Faixa QECR para o nível numérico (12 níveis, 2 por faixa — ver docs/pesquisa.md). */
export const cefr = (n: number | string) => ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'][Math.min(5, Math.max(0, Math.ceil(Number(n) / 2) - 1))];
/** Rótulo de nível numérico (ex.: "Nível 3 (A2)"). */
export const nivel = (n: number | string) => `Nível ${esc(n)} (${cefr(n)})`;

/** Estado vazio padrão. */
export const empty = (msg: string) => `<div class="empty">${esc(msg)}</div>`;

/** Seleciona elemento obrigatório (lança se não existir). */
export function $<T extends Element = HTMLElement>(root: ParentNode, sel: string): T {
  const el = root.querySelector<T>(sel);
  if (!el) throw new Error(`Elemento não encontrado: ${sel}`);
  return el;
}

export function toast(msg: string, kind: 'ok' | 'danger' = 'ok', opts: { action?: string; onAction?: () => void; timeout?: number } = {}) {
  const root = document.getElementById('toastRoot')!;
  const el = document.createElement('div');
  el.className = `toast toast-${kind}`;
  el.innerHTML = `<span>${esc(msg)}</span>${opts.action ? `<button class="btn-link">${esc(opts.action)}</button>` : ''}`;
  if (opts.action) el.querySelector('button')!.onclick = () => { opts.onAction?.(); el.remove(); };
  root.appendChild(el);
  setTimeout(() => el.remove(), opts.timeout ?? 3500);
}

/** Mostra erro (inclui detalhes de validação 422). */
export function showError(err: unknown) {
  const e = err as Partial<ApiError> & { message?: string };
  const det = e?.detalhes?.length ? ': ' + e.detalhes.join('; ') : '';
  toast((e?.message || 'Erro inesperado') + det, 'danger', { timeout: 6000 });
}

export interface ModalAction { label: string; kind?: 'primary' | 'soft' | 'ghost' | 'danger'; onClick?: (close: () => void) => void }
export interface ModalHandle { el: HTMLElement; close: () => void }

/** Abre um modal. */
export function modal(opts: { title: string; body?: string; size?: 'sm' | 'md' | 'lg'; actions?: ModalAction[]; onClose?: () => void }): ModalHandle {
  const { title, body = '', size = 'md', actions = [] } = opts;
  const root = document.getElementById('modalRoot')!;
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.innerHTML = `
    <div class="modal modal-${size}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <header class="modal-head"><h2>${esc(title)}</h2><button class="btn-icon" data-close aria-label="Fechar">✕</button></header>
      <div class="modal-body">${body}</div>
      ${actions.length ? '<footer class="modal-foot"></footer>' : ''}
    </div>`;
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
  const close = () => { if (!wrap.isConnected) return; wrap.remove(); document.removeEventListener('keydown', onKey); opts.onClose?.(); };
  document.addEventListener('keydown', onKey);
  wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) close(); });
  wrap.querySelector<HTMLButtonElement>('[data-close]')!.onclick = close;
  const foot = wrap.querySelector('.modal-foot');
  actions.forEach((a) => {
    const b = document.createElement('button');
    b.className = `btn btn-${a.kind || 'soft'}`;
    b.textContent = a.label;
    b.onclick = () => (a.onClick ? a.onClick(close) : close());
    foot!.appendChild(b);
  });
  root.appendChild(wrap);
  wrap.querySelector<HTMLElement>('input, select, textarea')?.focus();
  return { el: wrap.querySelector<HTMLElement>('.modal')!, close };
}

export function confirmDialog(message: string, o: { title?: string; confirmLabel?: string; danger?: boolean } = {}): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v: boolean) => { if (!done) { done = true; resolve(v); } };
    modal({
      title: o.title ?? 'Confirmar', size: 'sm', body: `<p>${esc(message)}</p>`, onClose: () => finish(false),
      actions: [
        { label: 'Cancelar', kind: 'soft', onClick: (c) => { finish(false); c(); } },
        { label: o.confirmLabel ?? 'Confirmar', kind: o.danger ? 'danger' : 'primary', onClick: (c) => { finish(true); c(); } },
      ],
    });
  });
}

/** Lê um <form> como objeto: number → Number|null, checkbox → boolean, select multiple → array. */
export function formData<T = Record<string, unknown>>(form: HTMLFormElement): T {
  const out: Record<string, unknown> = {};
  for (const node of Array.from(form.elements)) {
    const el = node as HTMLInputElement;
    if (!el.name) continue;
    if (el.type === 'checkbox') out[el.name] = el.checked;
    else if (el.type === 'radio') { if (el.checked) out[el.name] = el.value; }
    else if (node instanceof HTMLSelectElement && node.multiple) out[el.name] = Array.from(node.selectedOptions).map((o) => (isNaN(Number(o.value)) ? o.value : Number(o.value)));
    else if (el.type === 'number') out[el.name] = el.value === '' ? null : Number(el.value);
    else out[el.name] = el.value;
  }
  return out as T;
}

/** Opções de <select> a partir de lista. */
export function options<T extends Record<string, unknown>>(
  list: T[], o: { value?: keyof T; label?: keyof T | ((i: T) => string); selected?: unknown; empty?: string } = {},
): string {
  const value = (o.value ?? 'id') as keyof T;
  const label = o.label ?? ('nome' as keyof T);
  return (o.empty !== undefined ? `<option value="">${esc(o.empty)}</option>` : '') +
    list.map((i) => {
      const v = String(i[value]);
      const l = typeof label === 'function' ? label(i) : String(i[label]);
      return `<option value="${esc(v)}" ${v === String(o.selected) ? 'selected' : ''}>${esc(l)}</option>`;
    }).join('');
}
