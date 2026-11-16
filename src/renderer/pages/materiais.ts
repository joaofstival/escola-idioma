// Materiais didáticos: filtros (idioma, nível, tipo, busca), agrupamento idioma → nível e cadastro em modal.
// Links http(s) abrem no navegador padrão (o processo main intercepta target=_blank).
import type { Page, PageParams } from '../page.ts';
import type { Idioma, Material, MaterialTipo } from '../../shared/types.ts';
import { api } from '../api.ts';
import { $, cefr, confirmDialog, empty, esc, formData, showError, toast } from '../ui.ts';
import { carregando, debounce, estadoErro, formModal, opcoesNivel, semVazios } from '../comum.ts';

const TIPOS: [MaterialTipo, string, string][] = [
  ['livro', 'Livro', 'LIV'], ['apostila', 'Apostila', 'APO'], ['audio', 'Áudio', 'ÁUD'],
  ['video', 'Vídeo', 'VÍD'], ['link', 'Link', 'URL'], ['outro', 'Outro', 'OUT'],
];
const rotuloTipo = (t: string) => TIPOS.find((x) => x[0] === t)?.[1] ?? t;
const iconeTipo = (t: string) => TIPOS.find((x) => x[0] === t)?.[2] ?? 'OUT';
const ehUrl = (s: string | null) => !!s && /^https?:\/\/\S+$/i.test(s);

function abrirForm(mat: Material | null, idiomas: Idioma[], aoSalvar: () => void, padrao: { idioma_id?: string; nivel?: string } = {}): void {
  const idiomaSel = mat?.idioma_id ?? (Number(padrao.idioma_id) || null);
  formModal({
    title: mat ? 'Editar material' : 'Novo material',
    body: `<div class="form-grid">
      <label class="field full">Título *<input name="titulo" required maxlength="200" value="${esc(mat?.titulo)}"></label>
      <label class="field">Tipo *<select name="tipo" required>${TIPOS.map(([v, r]) => `<option value="${v}" ${mat?.tipo === v ? 'selected' : ''}>${r}</option>`).join('')}</select></label>
      <label class="field">Autor / editora<input name="autor" maxlength="150" value="${esc(mat?.autor)}"></label>
      <label class="field">Idioma *<select name="idioma_id" required><option value="">Selecione…</option>
        ${idiomas.map((i) => `<option value="${i.id}" ${i.id === idiomaSel ? 'selected' : ''}>${esc(i.nome)}</option>`).join('')}</select></label>
      <label class="field">Nível *<select name="nivel" required>${opcoesNivel(mat?.nivel ?? (padrao.nivel || 1))}</select></label>
      <label class="field full">Referência<input name="referencia" maxlength="500" value="${esc(mat?.referencia)}" placeholder="ISBN, local na biblioteca ou endereço https://…" data-ref></label>
      <label class="field full">Descrição<textarea name="descricao" maxlength="2000" rows="3">${esc(mat?.descricao)}</textarea></label>
      <p class="full muted ac-nota">O material aparece automaticamente nas turmas do mesmo idioma e nível. Para o tipo "Link", a referência deve começar com http:// ou https://.</p>
    </div>`,
    onOpen(form) {
      const tipo = $<HTMLSelectElement>(form, '[name="tipo"]');
      const ref = $<HTMLInputElement>(form, '[data-ref]');
      const ajustar = () => { ref.required = tipo.value === 'link'; ref.type = tipo.value === 'link' ? 'url' : 'text'; };
      tipo.onchange = ajustar; ajustar();
    },
    async onSubmit(form) {
      const d = semVazios(formData<Record<string, unknown>>(form));
      const corpo = { ...d, idioma_id: Number(d.idioma_id) || null, nivel: Number(d.nivel) };
      if (mat) await api.put(`/materiais/${mat.id}`, corpo);
      else await api.post('/materiais', corpo);
      toast(mat ? 'Material atualizado' : 'Material cadastrado');
      aoSalvar();
    },
  });
}

function itemMaterial(m: Material): string {
  const ref = m.referencia
    ? ehUrl(m.referencia)
      ? `<a class="ac-ref" href="${esc(m.referencia)}" target="_blank" rel="noopener noreferrer" title="Abrir no navegador">${esc(m.referencia)} ↗</a>`
      : `<span class="ac-ref muted">${esc(m.referencia)}</span>`
    : '';
  return `<li class="ac-mat">
    <span class="ac-mat-icone ac-tipo-${esc(m.tipo)}" title="${esc(rotuloTipo(m.tipo))}">${iconeTipo(m.tipo)}<span class="ac-sr-only"> (${esc(rotuloTipo(m.tipo))})</span></span>
    <div class="ac-mat-corpo">
      <div class="ac-mat-titulo"><strong>${esc(m.titulo)}</strong></div>
      ${m.autor ? `<div class="muted ac-sub">${esc(m.autor)}</div>` : ''}
      ${m.descricao ? `<p class="ac-mat-desc">${esc(m.descricao)}</p>` : ''}
      ${ref}
    </div>
    <div class="ac-mat-acoes">
      <button class="btn btn-ghost btn-sm" type="button" data-editar="${m.id}">Editar</button>
      <button class="btn btn-ghost btn-sm ac-btn-danger" type="button" data-excluir="${m.id}">Excluir</button>
    </div></li>`;
}

async function render(container: HTMLElement, params: PageParams): Promise<void> {
  container.className = 'ac-page';
  const q = params.query;
  container.innerHTML = `
    <div class="toolbar ac-filtros">
      <label class="field ac-busca">Buscar<input type="search" data-f="busca" placeholder="Título, autor ou descrição" value="${esc(q.busca)}"></label>
      <label class="field">Idioma<select data-f="idioma_id"><option value="">Todos os idiomas</option></select></label>
      <label class="field">Nível<select data-f="nivel">${opcoesNivel(q.nivel, 'Todos os níveis')}</select></label>
      <label class="field">Tipo<select data-f="tipo"><option value="">Todos os tipos</option>
        ${TIPOS.map(([v, r]) => `<option value="${v}" ${q.tipo === v ? 'selected' : ''}>${r}</option>`).join('')}</select></label>
      <div class="spacer"></div>
      <button class="btn btn-primary" type="button" data-novo>Novo material</button>
    </div>
    <p class="muted ac-total" data-total aria-live="polite"></p>
    <div data-lista>${carregando()}</div>`;
  const lista = $(container, '[data-lista]');
  const total = $(container, '[data-total]');
  const f = <T extends HTMLElement = HTMLSelectElement>(k: string) => $<T>(container, `[data-f="${k}"]`);
  let idiomas: Idioma[] = [];
  let seq = 0;

  const recarregar = async () => {
    const meu = ++seq;
    lista.classList.add('ac-atualizando');
    let mats: Material[];
    try {
      if (!idiomas.length) {
        idiomas = await api.get<Idioma[]>('/idiomas');
        f('idioma_id').insertAdjacentHTML('beforeend', idiomas.map((i) =>
          `<option value="${i.id}" ${String(i.id) === q.idioma_id ? 'selected' : ''}>${esc(i.nome)}</option>`).join(''));
      }
      mats = await api.get<Material[]>('/materiais', {
        busca: f<HTMLInputElement>('busca').value.trim(), idioma_id: f('idioma_id').value, nivel: f('nivel').value, tipo: f('tipo').value,
      });
    } catch (err) { if (meu === seq) estadoErro(lista, err, () => void recarregar()); return; }
    finally { lista.classList.remove('ac-atualizando'); }
    if (meu !== seq) return;
    total.textContent = `${mats.length} material(is)`;
    if (!mats.length) { lista.innerHTML = empty('Nenhum material encontrado com esses filtros.'); return; }

    // Agrupa idioma → nível (a API já devolve ordenado por idioma, nível e título).
    const grupos = new Map<string, Map<number, Material[]>>();
    for (const m of mats) {
      const nome = m.idioma_nome ?? `Idioma ${m.idioma_id}`;
      if (!grupos.has(nome)) grupos.set(nome, new Map());
      const porNivel = grupos.get(nome)!;
      if (!porNivel.has(m.nivel)) porNivel.set(m.nivel, []);
      porNivel.get(m.nivel)!.push(m);
    }
    lista.innerHTML = Array.from(grupos).map(([idioma, porNivel]) => {
      const qtd = Array.from(porNivel.values()).reduce((s, l) => s + l.length, 0);
      return `<section class="card ac-grupo" aria-label="${esc(idioma)}">
        <h3>${esc(idioma)} <span class="muted ac-sub-inline">${qtd} material(is)</span></h3>
        ${Array.from(porNivel).map(([n, itens]) => `<div class="ac-nivel">
          <h4><span class="ac-chip ac-chip-nivel">${esc(cefr(n))}</span> Nível ${esc(n)}</h4>
          <ul class="ac-mat-lista">${itens.map(itemMaterial).join('')}</ul></div>`).join('')}
      </section>`;
    }).join('');

    const achar = (id?: string) => mats.find((m) => m.id === Number(id))!;
    lista.querySelectorAll<HTMLButtonElement>('[data-editar]').forEach((b) => { b.onclick = () => abrirForm(achar(b.dataset.editar), idiomas, () => void recarregar()); });
    lista.querySelectorAll<HTMLButtonElement>('[data-excluir]').forEach((b) => {
      b.onclick = async () => {
        const m = achar(b.dataset.excluir);
        if (!(await confirmDialog(`Excluir o material "${m.titulo}"?`, { title: 'Excluir material', confirmLabel: 'Excluir', danger: true }))) return;
        try { await api.del(`/materiais/${m.id}`); toast('Material excluído'); void recarregar(); }
        catch (err) { showError(err); }
      };
    });
  };

  f<HTMLInputElement>('busca').addEventListener('input', debounce(() => void recarregar(), 300));
  ['idioma_id', 'nivel', 'tipo'].forEach((k) => { f(k).onchange = () => void recarregar(); });
  $<HTMLButtonElement>(container, '[data-novo]').onclick = async () => {
    if (!idiomas.length) { try { idiomas = await api.get<Idioma[]>('/idiomas'); } catch (err) { showError(err); return; } }
    abrirForm(null, idiomas, () => void recarregar(), { idioma_id: f('idioma_id').value, nivel: f('nivel').value });
  };
  await recarregar();
}

const page: Page = { title: 'Materiais didáticos', render };
export default page;
