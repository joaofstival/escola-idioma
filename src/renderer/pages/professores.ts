// Professores: lista com os idiomas habilitados, cadastro em modal (checkboxes de idiomas) e ativar/inativar.
import type { Page } from '../page.ts';
import type { Idioma, Professor } from '../../shared/types.ts';
import { api } from '../api.ts';
import { $, confirmDialog, empty, esc, formData, pill, showError, toast } from '../ui.ts';
import { carregando, estadoErro, formModal, semVazios } from '../comum.ts';

function abrirForm(prof: Professor | null, idiomas: Idioma[], aoSalvar: () => void): void {
  const habilitados = new Set((prof?.idiomas ?? []).map((i) => i.id));
  formModal({
    title: prof ? `Editar ${prof.nome}` : 'Novo professor',
    body: `<div class="form-grid">
      <label class="field full">Nome completo *<input name="nome" required maxlength="150" value="${esc(prof?.nome)}"></label>
      <label class="field">E-mail<input name="email" type="email" maxlength="150" value="${esc(prof?.email)}"></label>
      <label class="field">Telefone<input name="telefone" type="tel" maxlength="30" value="${esc(prof?.telefone)}"></label>
      <fieldset class="full ac-fieldset">
        <legend>Idiomas em que está habilitado</legend>
        ${idiomas.length ? `<div class="ac-checks">${idiomas.map((i) => `
          <label class="check ac-check-card"><input type="checkbox" data-idioma="${i.id}" ${habilitados.has(i.id) ? 'checked' : ''}> ${esc(i.nome)}</label>`).join('')}</div>`
          : '<p class="muted">Cadastre idiomas primeiro.</p>'}
        <p class="muted ac-nota">Só professores habilitados no idioma podem ser alocados nas turmas desse idioma.</p>
      </fieldset>
      ${prof ? `<label class="check full"><input type="checkbox" name="ativo" ${prof.ativo ? 'checked' : ''}> Professor ativo</label>` : ''}
    </div>`,
    async onSubmit(form) {
      const d = semVazios(formData<Record<string, unknown>>(form));
      const ids = Array.from(form.querySelectorAll<HTMLInputElement>('[data-idioma]:checked')).map((c) => Number(c.dataset.idioma));
      const corpo = { ...d, idiomas: ids };
      if (prof) await api.put(`/professores/${prof.id}`, corpo);
      else await api.post('/professores', corpo);
      toast(prof ? 'Professor atualizado' : 'Professor cadastrado');
      aoSalvar();
    },
  });
}

async function alternarAtivo(prof: Professor, aoSalvar: () => void): Promise<void> {
  if (prof.ativo) {
    const ok = await confirmDialog(`Inativar ${prof.nome}? Ele continua nas turmas atuais, mas não poderá ser alocado em novas turmas.`,
      { title: 'Inativar professor', confirmLabel: 'Inativar', danger: true });
    if (!ok) return;
  }
  try {
    await api.put(`/professores/${prof.id}`, { ativo: !prof.ativo });
    toast(prof.ativo ? 'Professor inativado' : 'Professor reativado');
    aoSalvar();
  } catch (err) { showError(err); }
}

async function render(container: HTMLElement): Promise<void> {
  container.className = 'ac-page';
  container.innerHTML = `
    <div class="toolbar ac-filtros">
      <label class="field">Situação<select data-ativo>
        <option value="">Todos</option><option value="true">Ativos</option><option value="false">Inativos</option></select></label>
      <label class="field">Idioma<select data-idioma-filtro><option value="">Todos os idiomas</option></select></label>
      <div class="spacer"></div>
      <span class="muted" data-total aria-live="polite"></span>
      <button class="btn btn-primary" type="button" data-novo>Novo professor</button>
    </div>
    <div data-lista>${carregando()}</div>`;
  const lista = $(container, '[data-lista]');
  const total = $(container, '[data-total]');
  const fAtivo = $<HTMLSelectElement>(container, '[data-ativo]');
  const fIdioma = $<HTMLSelectElement>(container, '[data-idioma-filtro]');
  let idiomas: Idioma[] = [];

  const recarregar = async () => {
    lista.classList.add('ac-atualizando');
    let profs: Professor[];
    try {
      if (!idiomas.length) {
        idiomas = await api.get<Idioma[]>('/idiomas');
        fIdioma.insertAdjacentHTML('beforeend', idiomas.map((i) => `<option value="${i.id}">${esc(i.nome)}</option>`).join(''));
      }
      profs = await api.get<Professor[]>('/professores', { ativo: fAtivo.value, idioma_id: fIdioma.value });
    } catch (err) { estadoErro(lista, err, () => void recarregar()); return; }
    finally { lista.classList.remove('ac-atualizando'); }
    total.textContent = `${profs.length} professor(es)`;
    if (!profs.length) { lista.innerHTML = empty('Nenhum professor encontrado com esses filtros.'); return; }
    lista.innerHTML = `<div class="table-wrap"><table>
      <thead><tr><th>Professor</th><th class="ac-col-opc">Telefone</th><th>Idiomas habilitados</th><th>Situação</th><th><span class="ac-sr-only">Ações</span></th></tr></thead>
      <tbody>${profs.map((p) => `<tr>
        <td><strong>${esc(p.nome)}</strong>${p.email ? `<div class="muted ac-sub">${esc(p.email)}</div>` : ''}</td>
        <td class="ac-nowrap ac-col-opc">${esc(p.telefone || '—')}</td>
        <td><div class="ac-chips">${p.idiomas.length ? p.idiomas.map((i) => `<span class="ac-chip">${esc(i.nome)}</span>`).join('') : '<span class="muted">Nenhum</span>'}</div></td>
        <td>${p.ativo ? pill('Ativo', 'ok') : pill('Inativo', 'muted')}</td>
        <td class="actions">
          <a class="btn btn-ghost btn-sm" href="#/turmas?professor_id=${p.id}">Turmas</a>
          <button class="btn btn-ghost btn-sm" type="button" data-editar="${p.id}">Editar</button>
          <button class="btn btn-ghost btn-sm ${p.ativo ? 'ac-btn-danger' : ''}" type="button" data-alternar="${p.id}">${p.ativo ? 'Inativar' : 'Ativar'}</button>
        </td></tr>`).join('')}</tbody></table></div>`;
    const achar = (id?: string) => profs.find((p) => p.id === Number(id))!;
    lista.querySelectorAll<HTMLButtonElement>('[data-editar]').forEach((b) => { b.onclick = () => abrirForm(achar(b.dataset.editar), idiomas, () => void recarregar()); });
    lista.querySelectorAll<HTMLButtonElement>('[data-alternar]').forEach((b) => { b.onclick = () => void alternarAtivo(achar(b.dataset.alternar), () => void recarregar()); });
  };

  fAtivo.onchange = fIdioma.onchange = () => void recarregar();
  $<HTMLButtonElement>(container, '[data-novo]').onclick = async () => {
    if (!idiomas.length) { try { idiomas = await api.get<Idioma[]>('/idiomas'); } catch (err) { showError(err); return; } }
    abrirForm(null, idiomas, () => void recarregar());
  };
  await recarregar();
}

const page: Page = { title: 'Professores', render };
export default page;
