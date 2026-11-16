// Turmas: filtros por ano/idioma/nível, cards com ocupação, cadastro em modal (professor filtrado pelo idioma)
// e detalhe em #/turmas/:id com alunos e materiais didáticos.
import type { Page, PageParams } from '../page.ts';
import type { Idioma, Material, Matricula, Professor, Turma } from '../../shared/types.ts';
import { api } from '../api.ts';
import { $, brl, cefr, confirmDialog, empty, esc, formData, nivel, pill, showError, toast } from '../ui.ts';
import { anoAtual, barraOcupacao, carregando, estadoErro, formModal, opcoesAno, opcoesNivel, semVazios } from '../comum.ts';

const TIPO_MATERIAL: Record<string, string> = { livro: 'Livro', apostila: 'Apostila', audio: 'Áudio', video: 'Vídeo', link: 'Link', outro: 'Outro' };

/** Professores que podem dar aula no idioma (ativos e habilitados). O atual da turma é mantido mesmo se inativo. */
function opcoesProfessor(profs: Professor[], idiomaId: number | null, selecionado: number | null): string {
  if (!idiomaId) return '<option value="">Escolha o idioma primeiro</option>';
  const aptos = profs.filter((p) => p.idiomas.some((i) => i.id === idiomaId) && (p.ativo || p.id === selecionado));
  if (!aptos.length) return '<option value="">Nenhum professor habilitado neste idioma</option>';
  return '<option value="">Sem professor (definir depois)</option>' + aptos.map((p) =>
    `<option value="${p.id}" ${p.id === selecionado ? 'selected' : ''}>${esc(p.nome)}${p.ativo ? '' : ' (inativo)'}</option>`).join('');
}

async function abrirForm(turma: Turma | null, aoSalvar: (t: Turma) => void, padrao: { ano?: number; idioma_id?: number } = {}): Promise<void> {
  let idiomas: Idioma[]; let profs: Professor[];
  try { [idiomas, profs] = await Promise.all([api.get<Idioma[]>('/idiomas'), api.get<Professor[]>('/professores')]); }
  catch (err) { showError(err); return; }
  const idiomaId = turma?.idioma_id ?? padrao.idioma_id ?? null;
  formModal({
    title: turma ? `Editar ${turma.nome}` : 'Nova turma',
    body: `<div class="form-grid">
      <label class="field full">Nome da turma *<input name="nome" required maxlength="80" value="${esc(turma?.nome)}" placeholder="Ex.: Inglês 2 - Noite"></label>
      <label class="field">Idioma *<select name="idioma_id" required>${idiomas.length ? '<option value="">Selecione…</option>' : '<option value="">Cadastre um idioma</option>'}
        ${idiomas.map((i) => `<option value="${i.id}" ${i.id === idiomaId ? 'selected' : ''}>${esc(i.nome)} · ${brl(i.mensalidade)}/mês</option>`).join('')}</select></label>
      <label class="field">Nível *<select name="nivel" required>${opcoesNivel(turma?.nivel ?? 1)}</select></label>
      <label class="field">Ano letivo *<input name="ano_letivo" type="number" required min="2000" max="2100" value="${esc(turma?.ano_letivo ?? padrao.ano ?? anoAtual())}"></label>
      <label class="field">Capacidade (vagas) *<input name="capacidade" type="number" required min="1" max="500" value="${esc(turma?.capacidade ?? 12)}"></label>
      <label class="field">Professor<select name="professor_id" data-prof>${opcoesProfessor(profs, idiomaId, turma?.professor_id ?? null)}</select></label>
      <label class="field">Horário<input name="horario" maxlength="120" value="${esc(turma?.horario)}" placeholder="Ex.: Seg e Qua 19h–20h30"></label>
      <p class="full muted ac-nota">A lista de professores mostra apenas quem está ativo e habilitado no idioma escolhido.
        ${turma?.ocupacao ? `A capacidade não pode ficar abaixo dos ${turma.ocupacao} alunos matriculados.` : ''}</p>
    </div>`,
    onOpen(form) {
      const sel = $<HTMLSelectElement>(form, '[name="idioma_id"]');
      const prof = $<HTMLSelectElement>(form, '[data-prof]');
      sel.onchange = () => { prof.innerHTML = opcoesProfessor(profs, Number(sel.value) || null, Number(prof.value) || null); };
    },
    async onSubmit(form) {
      const d = semVazios(formData<Record<string, unknown>>(form));
      const corpo = { ...d, idioma_id: Number(d.idioma_id) || null, nivel: Number(d.nivel), professor_id: d.professor_id ? Number(d.professor_id) : null };
      const salvo = turma ? await api.put<Turma>(`/turmas/${turma.id}`, corpo) : await api.post<Turma>('/turmas', corpo);
      toast(turma ? 'Turma atualizada' : 'Turma criada');
      aoSalvar(salvo);
    },
  });
}

// ---------- Lista ----------

async function renderLista(container: HTMLElement, query: Record<string, string>): Promise<void> {
  const ano = Number(query.ano) || anoAtual();
  container.innerHTML = `
    <div class="toolbar ac-filtros">
      <label class="field">Ano letivo<select data-f="ano">${opcoesAno(ano)}</select></label>
      <label class="field">Idioma<select data-f="idioma_id"><option value="">Todos os idiomas</option></select></label>
      <label class="field">Nível<select data-f="nivel">${opcoesNivel(query.nivel, 'Todos os níveis')}</select></label>
      ${query.professor_id ? `<span class="pill pill-info ac-filtro-pill">Filtrado por professor <a href="#/turmas" aria-label="Remover filtro de professor">✕</a></span>` : ''}
      <div class="spacer"></div>
      <span class="muted" data-total aria-live="polite"></span>
      <button class="btn btn-primary" type="button" data-novo>Nova turma</button>
    </div>
    <div data-lista>${carregando()}</div>`;
  const lista = $(container, '[data-lista]');
  const total = $(container, '[data-total]');
  const f = (k: string) => $<HTMLSelectElement>(container, `[data-f="${k}"]`);

  try {
    const idiomas = await api.get<Idioma[]>('/idiomas');
    f('idioma_id').insertAdjacentHTML('beforeend', idiomas.map((i) =>
      `<option value="${i.id}" ${String(i.id) === query.idioma_id ? 'selected' : ''}>${esc(i.nome)}</option>`).join(''));
  } catch { /* o filtro de idioma fica só com "Todos"; a lista abaixo mostra o erro, se houver */ }

  const recarregar = async () => {
    lista.classList.add('ac-atualizando');
    let turmas: Turma[];
    try {
      turmas = await api.get<Turma[]>('/turmas', { ano: f('ano').value, idioma_id: f('idioma_id').value, nivel: f('nivel').value, professor_id: query.professor_id });
    } catch (err) { estadoErro(lista, err, () => void recarregar()); return; }
    finally { lista.classList.remove('ac-atualizando'); }
    const vagas = turmas.reduce((s, t) => s + Math.max(0, t.capacidade - (t.ocupacao ?? 0)), 0);
    total.textContent = `${turmas.length} turma(s) · ${vagas} vaga(s) livre(s)`;
    if (!turmas.length) { lista.innerHTML = empty(`Nenhuma turma em ${f('ano').value} com esses filtros.`); return; }
    lista.innerHTML = `<div class="ac-cards">${turmas.map((t) => {
      const cheia = (t.ocupacao ?? 0) >= t.capacidade;
      return `<article class="card ac-turma-card">
        <header><a href="#/turmas/${t.id}" class="ac-turma-titulo">${esc(t.nome)}</a>${cheia ? pill('Lotada', 'danger') : ''}</header>
        <div class="ac-turma-meta"><span class="ac-chip">${esc(t.idioma_nome)}</span><span class="ac-chip ac-chip-nivel" title="${nivel(t.nivel)}">${nivel(t.nivel)}</span></div>
        <dl class="ac-mini-dl">
          <div><dt>Professor</dt><dd>${t.professor_nome ? esc(t.professor_nome) : '<span class="muted">Não definido</span>'}</dd></div>
          <div><dt>Horário</dt><dd>${t.horario ? esc(t.horario) : '<span class="muted">—</span>'}</dd></div>
        </dl>
        <div class="ac-turma-ocup"><span class="muted">Ocupação</span>${barraOcupacao(t.ocupacao, t.capacidade)}</div>
        <footer><a class="btn btn-soft btn-sm" href="#/turmas/${t.id}">Ver alunos e materiais</a>
          <button class="btn btn-ghost btn-sm" type="button" data-editar="${t.id}">Editar</button></footer>
      </article>`;
    }).join('')}</div>`;
    lista.querySelectorAll<HTMLButtonElement>('[data-editar]').forEach((b) => {
      b.onclick = () => void abrirForm(turmas.find((t) => t.id === Number(b.dataset.editar))!, () => void recarregar());
    });
  };

  container.querySelectorAll<HTMLSelectElement>('[data-f]').forEach((s) => { s.onchange = () => void recarregar(); });
  $<HTMLButtonElement>(container, '[data-novo]').onclick = () => void abrirForm(null, (t) => {
    if (String(t.ano_letivo) !== f('ano').value) f('ano').innerHTML = opcoesAno(t.ano_letivo);
    void recarregar();
  }, { ano: Number(f('ano').value), idioma_id: Number(f('idioma_id').value) || undefined });
  await recarregar();
}

// ---------- Detalhe ----------

const STATUS_MAT = { ativa: ['Ativa', 'ok'], concluida: ['Concluída', 'info'], cancelada: ['Cancelada', 'muted'] } as const;

/** Alunos da turma: usa as matrículas (todas as situações, útil em anos anteriores); sem elas, só os ativos. */
function listaAlunos(ativos: NonNullable<Turma['alunos']>, matriculas: Matricula[] | null): string {
  if (matriculas) {
    if (!matriculas.length) return empty('Nenhuma matrícula nesta turma.');
    const ordem = { ativa: 0, concluida: 1, cancelada: 2 };
    const lista = [...matriculas].sort((a, b) => ordem[a.status] - ordem[b.status] || String(a.aluno_nome).localeCompare(String(b.aluno_nome)));
    return `<ul class="ac-lista-alunos">${lista.map((m) => `<li><a href="#/alunos/${m.aluno_id}">${esc(m.aluno_nome)}</a>
      ${pill(STATUS_MAT[m.status][0], STATUS_MAT[m.status][1])}</li>`).join('')}</ul>`;
  }
  return ativos.length ? `<ul class="ac-lista-alunos">${ativos.map((a) => `<li><a href="#/alunos/${a.id}">${esc(a.nome)}</a></li>`).join('')}</ul>`
    : empty('Nenhum aluno com matrícula ativa nesta turma.');
}

async function renderDetalhe(container: HTMLElement, id: number): Promise<void> {
  container.innerHTML = carregando('Carregando turma…');
  let turma: Turma; let materiais: Material[] | null = null; let erroMat: unknown = null; let matriculas: Matricula[] | null = null;
  try {
    const [t, m, mt] = await Promise.allSettled([api.get<Turma>(`/turmas/${id}`), api.get<Material[]>(`/turmas/${id}/materiais`),
      api.get<Matricula[]>('/matriculas', { turma_id: id })]);
    if (t.status === 'rejected') throw t.reason;
    turma = t.value;
    if (m.status === 'fulfilled') materiais = m.value; else erroMat = m.reason;
    if (mt.status === 'fulfilled') matriculas = mt.value;
  } catch (err) {
    container.innerHTML = '<p class="ac-voltar-p"><a href="#/turmas" class="ac-voltar">← Voltar para turmas</a></p><div data-erro></div>';
    estadoErro($(container, '[data-erro]'), err, () => void renderDetalhe(container, id));
    return;
  }
  const alunos = turma.alunos ?? [];
  const livres = Math.max(0, turma.capacidade - (turma.ocupacao ?? alunos.length));

  container.innerHTML = `
    <p class="ac-voltar-p"><a href="#/turmas?ano=${turma.ano_letivo}" class="ac-voltar">← Voltar para turmas de ${esc(turma.ano_letivo)}</a></p>
    <div class="card ac-perfil">
      <div class="ac-perfil-head">
        <div><h2>${esc(turma.nome)}</h2>
          <div class="ac-turma-meta"><span class="ac-chip">${esc(turma.idioma_nome)}</span><span class="ac-chip ac-chip-nivel">${nivel(turma.nivel)}</span>
          <span class="muted">Ano letivo ${esc(turma.ano_letivo)}</span></div></div>
        <div class="row">
          <button class="btn btn-ghost ac-btn-danger" type="button" data-excluir>Excluir</button>
          <button class="btn btn-ghost" type="button" data-editar>Editar</button>
          ${livres && turma.ano_letivo >= anoAtual() ? `<a class="btn btn-primary" href="#/matriculas?aba=nova&turma_id=${turma.id}">Matricular aluno</a>` : ''}
        </div>
      </div>
      <dl class="ac-dl">
        <div><dt>Professor</dt><dd>${turma.professor_nome ? esc(turma.professor_nome) : '<span class="muted">Não definido</span>'}</dd></div>
        <div><dt>Horário</dt><dd>${turma.horario ? esc(turma.horario) : '<span class="muted">—</span>'}</dd></div>
        <div><dt>Faixa QECR</dt><dd>${esc(cefr(turma.nivel))}</dd></div>
        <div><dt>Ocupação</dt><dd>${barraOcupacao(turma.ocupacao, turma.capacidade)}<span class="muted ac-sub">${turma.ano_letivo < anoAtual() ? 'Ano letivo encerrado' : livres ? `${livres} vaga(s) livre(s)` : 'Turma lotada'}</span></dd></div>
      </dl>
    </div>
    <div class="grid grid-2 ac-dash-cols">
      <section class="card" aria-labelledby="h-alunos">
        <div class="ac-card-head"><h3 id="h-alunos">Alunos (${alunos.length} ativo${alunos.length === 1 ? '' : 's'})</h3>
          <a href="#/matriculas?ano=${turma.ano_letivo}">Matrículas</a></div>
        ${listaAlunos(alunos, matriculas)}
      </section>
      <section class="card" aria-labelledby="h-mat">
        <div class="ac-card-head"><h3 id="h-mat">Materiais didáticos</h3>
          <a href="#/materiais?idioma_id=${turma.idioma_id}&nivel=${turma.nivel}">Gerenciar</a></div>
        <div data-materiais></div>
      </section>
    </div>`;

  const matEl = $(container, '[data-materiais]');
  if (erroMat) estadoErro(matEl, erroMat, () => void renderDetalhe(container, id));
  else if (!materiais?.length) matEl.innerHTML = empty(`Nenhum material para ${turma.idioma_nome ?? 'este idioma'} no ${nivel(turma.nivel)}.`);
  else matEl.innerHTML = `<ul class="ac-materiais-lista">${materiais.map((m) => `<li>
      <span class="pill pill-muted">${esc(TIPO_MATERIAL[m.tipo] ?? m.tipo)}</span>
      <div><strong>${esc(m.titulo)}</strong>${m.autor ? ` <span class="muted">· ${esc(m.autor)}</span>` : ''}
        ${m.referencia ? `<div class="ac-sub">${/^https?:\/\//i.test(m.referencia)
          ? `<a href="${esc(m.referencia)}" target="_blank" rel="noopener noreferrer">${esc(m.referencia)}</a>` : esc(m.referencia)}</div>` : ''}</div></li>`).join('')}</ul>`;

  $<HTMLButtonElement>(container, '[data-editar]').onclick = () => void abrirForm(turma, () => void renderDetalhe(container, id));
  $<HTMLButtonElement>(container, '[data-excluir]').onclick = async () => {
    const ok = await confirmDialog(`Excluir a turma "${turma.nome}"? Só é possível se ela não tiver matrículas nem avaliações.`,
      { title: 'Excluir turma', confirmLabel: 'Excluir', danger: true });
    if (!ok) return;
    try { await api.del(`/turmas/${turma.id}`); toast('Turma excluída'); location.hash = `#/turmas?ano=${turma.ano_letivo}`; }
    catch (err) { showError(err); }
  };
}

const page: Page = {
  title: 'Turmas',
  async render(container: HTMLElement, params: PageParams) {
    container.className = 'ac-page';
    const id = Number(params.segments[0]);
    if (params.segments[0] && Number.isInteger(id) && id > 0) await renderDetalhe(container, id);
    else await renderLista(container, params.query);
  },
};
export default page;
