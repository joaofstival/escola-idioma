// Idiomas e valores: cada idioma tem um valor fixo de mensalidade, usado ao gerar as mensalidades das matrículas.
import type { Page } from '../page.ts';
import type { Idioma } from '../../../shared/types.ts';
import { api } from '../api.ts';
import { $, brl, confirmDialog, empty, esc, formData, showError, toast } from '../ui.ts';
import { carregando, estadoErro, formModal } from '../comum.ts';

function abrirForm(idioma: Idioma | null, recarregar: () => void): void {
  formModal({
    title: idioma ? `Editar ${idioma.nome}` : 'Novo idioma',
    size: 'sm',
    body: `<div class="stack">
      <label class="field">Nome *<input name="nome" required maxlength="60" value="${esc(idioma?.nome)}" placeholder="Ex.: Inglês"></label>
      <label class="field">Código (ISO 639-1) *<input name="codigo" required maxlength="12" value="${esc(idioma?.codigo)}" placeholder="Ex.: en, es, pt-br"></label>
      <label class="field">Mensalidade (R$) *<input name="mensalidade" type="number" required min="0" step="0.01" value="${esc(idioma?.mensalidade ?? '')}" placeholder="0,00"></label>
      <p class="muted ac-nota">Valor fixo usado nas mensalidades. Uma alteração vale para as próximas matrículas; as mensalidades já geradas não mudam.</p>
    </div>`,
    async onSubmit(form) {
      const d = formData<{ nome: string; codigo: string; mensalidade: number | null }>(form);
      const corpo = { nome: d.nome.trim(), codigo: d.codigo.trim().toLowerCase(), mensalidade: d.mensalidade };
      if (idioma) await api.put(`/idiomas/${idioma.id}`, corpo);
      else await api.post('/idiomas', corpo);
      toast(idioma ? 'Idioma atualizado' : 'Idioma cadastrado');
      recarregar();
    },
  });
}

async function excluir(idioma: Idioma, recarregar: () => void): Promise<void> {
  const ok = await confirmDialog(`Excluir o idioma "${idioma.nome}"? Só é possível se não houver turmas, materiais ou professores vinculados.`,
    { title: 'Excluir idioma', confirmLabel: 'Excluir', danger: true });
  if (!ok) return;
  try { await api.del(`/idiomas/${idioma.id}`); toast('Idioma excluído'); recarregar(); }
  catch (err) { showError(err); }
}

async function render(container: HTMLElement): Promise<void> {
  container.className = 'ac-page';
  container.innerHTML = `
    <div class="ac-callout" role="note">
      <strong>Valor fixo usado nas mensalidades.</strong>
      Ao matricular um aluno, todas as mensalidades do ano são geradas com o valor do idioma da turma.
    </div>
    <div class="toolbar"><span class="muted" data-total></span><div class="spacer"></div>
      <button class="btn btn-primary" type="button" data-novo>Novo idioma</button></div>
    <div data-lista>${carregando()}</div>`;
  const lista = $(container, '[data-lista]');
  const total = $(container, '[data-total]');

  const recarregar = async () => {
    lista.innerHTML = carregando();
    let idiomas: Idioma[];
    try { idiomas = await api.get<Idioma[]>('/idiomas'); }
    catch (err) { estadoErro(lista, err, () => void recarregar()); return; }
    total.textContent = `${idiomas.length} idioma(s)`;
    if (!idiomas.length) { lista.innerHTML = empty('Nenhum idioma cadastrado. Clique em "Novo idioma" para começar.'); return; }
    lista.innerHTML = `<div class="table-wrap"><table>
      <thead><tr><th>Idioma</th><th>Código</th><th class="num">Mensalidade</th><th class="num">Anual (12×)</th><th><span class="ac-sr-only">Ações</span></th></tr></thead>
      <tbody>${idiomas.map((i) => `<tr>
        <td><strong>${esc(i.nome)}</strong></td>
        <td><span class="pill pill-muted">${esc(i.codigo)}</span></td>
        <td class="num"><span class="ac-valor">${brl(i.mensalidade)}</span></td>
        <td class="num muted">${brl(i.mensalidade * 12)}</td>
        <td class="actions">
          <button class="btn btn-ghost btn-sm" type="button" data-editar="${i.id}">Editar</button>
          <button class="btn btn-ghost btn-sm ac-btn-danger" type="button" data-excluir="${i.id}">Excluir</button>
        </td></tr>`).join('')}</tbody></table></div>`;
    lista.querySelectorAll<HTMLButtonElement>('[data-editar]').forEach((b) => {
      b.onclick = () => abrirForm(idiomas.find((i) => i.id === Number(b.dataset.editar))!, () => void recarregar());
    });
    lista.querySelectorAll<HTMLButtonElement>('[data-excluir]').forEach((b) => {
      b.onclick = () => void excluir(idiomas.find((i) => i.id === Number(b.dataset.excluir))!, () => void recarregar());
    });
  };

  $<HTMLButtonElement>(container, '[data-novo]').onclick = () => abrirForm(null, () => void recarregar());
  await recarregar();
}

const page: Page = { title: 'Idiomas e valores', render };
export default page;
