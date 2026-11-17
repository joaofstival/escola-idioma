// Matrículas: abas "Matrículas do ano" (filtros e cancelamento), "Nova matrícula" e "Rematrículas" (sugestões do ano anterior).
// Aba inicial e pré-seleção pela query: #/matriculas?aba=nova&aluno_id=1&turma_id=2 | ?aba=rematriculas
import type { Page, PageParams } from '../page.ts';
import type { Aluno, Idioma, Matricula, MatriculaStatus, SugestaoRematricula, Turma } from '../../../shared/types.ts';
import { api } from '../api.ts';
import { $, brl, confirmDialog, date, empty, esc, nivel, pill, showError, toast } from '../ui.ts';
import { anoAtual, barraOcupacao, carregando, estadoErro, opcoesAno } from '../comum.ts';

type Aba = 'lista' | 'nova' | 'rematriculas';
const ABAS: [Aba, string][] = [['lista', 'Matrículas do ano'], ['nova', 'Nova matrícula'], ['rematriculas', 'Rematrículas']];

const STATUS: Record<MatriculaStatus, [string, 'ok' | 'info' | 'muted']> = {
  ativa: ['Ativa', 'ok'], concluida: ['Concluída', 'info'], cancelada: ['Cancelada', 'muted'],
};

const vagas = (t: Pick<Turma, 'capacidade' | 'ocupacao'>) => Math.max(0, t.capacidade - (t.ocupacao ?? 0));

// ---------- Aba: lista ----------

async function abaLista(el: HTMLElement, query: Record<string, string>): Promise<void> {
  const ano = Number(query.ano) || anoAtual();
  el.innerHTML = `
    <div class="toolbar ac-filtros">
      <label class="field">Ano letivo<select data-f="ano">${opcoesAno(ano)}</select></label>
      <label class="field ac-campo-largo">Turma<select data-f="turma_id"><option value="">Todas as turmas</option></select></label>
      <label class="field">Situação<select data-f="status">
        <option value="">Todas</option><option value="ativa">Ativas</option><option value="concluida">Concluídas</option><option value="cancelada">Canceladas</option></select></label>
      <div class="spacer"></div>
      <span class="muted" data-total aria-live="polite"></span>
    </div>
    <div data-lista>${carregando()}</div>`;
  const lista = $(el, '[data-lista]');
  const total = $(el, '[data-total]');
  const f = (k: string) => $<HTMLSelectElement>(el, `[data-f="${k}"]`);

  const carregarTurmas = async () => {
    try {
      const turmas = await api.get<Turma[]>('/turmas', { ano: f('ano').value });
      f('turma_id').innerHTML = '<option value="">Todas as turmas</option>' +
        turmas.map((t) => `<option value="${t.id}" ${String(t.id) === query.turma_id ? 'selected' : ''}>${esc(t.nome)}</option>`).join('');
    } catch { f('turma_id').innerHTML = '<option value="">Todas as turmas</option>'; }
  };

  const recarregar = async () => {
    lista.classList.add('ac-atualizando');
    let mats: Matricula[];
    try { mats = await api.get<Matricula[]>('/matriculas', { ano: f('ano').value, turma_id: f('turma_id').value, status: f('status').value }); }
    catch (err) { estadoErro(lista, err, () => void recarregar()); return; }
    finally { lista.classList.remove('ac-atualizando'); }
    const ativas = mats.filter((m) => m.status === 'ativa').length;
    total.textContent = `${mats.length} matrícula(s) · ${ativas} ativa(s)`;
    if (!mats.length) { lista.innerHTML = empty(`Nenhuma matrícula em ${f('ano').value} com esses filtros.`); return; }
    lista.innerHTML = `<div class="table-wrap"><table>
      <thead><tr><th>Aluno</th><th>Turma</th><th>Tipo</th><th class="num ac-col-opc">Data</th><th>Situação</th><th><span class="ac-sr-only">Ações</span></th></tr></thead>
      <tbody>${mats.map((m) => `<tr class="${m.status === 'cancelada' ? 'ac-linha-apagada' : ''}">
        <td><a href="#/alunos/${m.aluno_id}" class="ac-strong-link">${esc(m.aluno_nome)}</a></td>
        <td class="ac-nowrap"><a href="#/turmas/${m.turma_id}">${esc(m.turma_nome)}</a>
          <div class="muted ac-sub">${esc(m.idioma_nome || '')}${m.nivel ? ` · ${nivel(m.nivel)}` : ''}</div></td>
        <td>${m.tipo === 'rematricula' ? pill('Rematrícula', 'info') : 'Matrícula'}</td>
        <td class="num ac-col-opc">${date(m.data)}</td>
        <td>${pill(STATUS[m.status][0], STATUS[m.status][1])}</td>
        <td class="actions">${m.status === 'ativa' ? `<button class="btn btn-ghost btn-sm ac-btn-danger" type="button" data-cancelar="${m.id}">Cancelar</button>` : ''}</td>
      </tr>`).join('')}</tbody></table></div>`;
    lista.querySelectorAll<HTMLButtonElement>('[data-cancelar]').forEach((b) => {
      b.onclick = async () => {
        const m = mats.find((x) => x.id === Number(b.dataset.cancelar))!;
        const ok = await confirmDialog(
          `Cancelar a matrícula de ${m.aluno_nome} na turma ${m.turma_nome}? As mensalidades futuras pendentes serão canceladas. ` +
          'As mensalidades já vencidas continuam devidas e as pagas não mudam.',
          { title: 'Cancelar matrícula', confirmLabel: 'Cancelar matrícula', danger: true });
        if (!ok) return;
        try {
          const r = await api.put<Matricula>(`/matriculas/${m.id}/cancelar`);
          toast(`Matrícula cancelada · ${r.mensalidades_canceladas ?? 0} mensalidade(s) futura(s) cancelada(s)`);
          void recarregar();
        } catch (err) { showError(err); }
      };
    });
  };

  f('ano').onchange = async () => { query.turma_id = ''; await carregarTurmas(); void recarregar(); };
  f('turma_id').onchange = f('status').onchange = () => void recarregar();
  await carregarTurmas();
  await recarregar();
}

// ---------- Aba: nova matrícula ----------

async function abaNova(el: HTMLElement, query: Record<string, string>): Promise<void> {
  el.innerHTML = carregando();
  let alunos: Aluno[]; let idiomas: Idioma[]; let turmas: Turma[] = [];
  let preTurma: Turma | null = null;
  try {
    if (query.turma_id) preTurma = await api.get<Turma>(`/turmas/${Number(query.turma_id)}`).catch(() => null);
    [alunos, idiomas] = await Promise.all([api.get<Aluno[]>('/alunos', { ativo: true }), api.get<Idioma[]>('/idiomas')]);
  } catch (err) { estadoErro(el, err, () => void abaNova(el, query)); return; }
  const ano = preTurma?.ano_letivo ?? anoAtual();
  const mensalidade = new Map(idiomas.map((i) => [i.id, i.mensalidade]));

  el.innerHTML = `
    <div class="ac-nova">
      <form class="card ac-nova-form" novalidate>
        <h3>Dados da matrícula</h3>
        <div class="stack">
          <label class="field">Aluno *<select name="aluno_id" required>
            <option value="">Selecione o aluno…</option>
            ${alunos.map((a) => `<option value="${a.id}" ${String(a.id) === query.aluno_id ? 'selected' : ''}>${esc(a.nome)}${a.documento ? ` · ${esc(a.documento)}` : ''}</option>`).join('')}
          </select></label>
          <label class="field">Ano letivo *<select name="ano_letivo">${opcoesAno(ano)}</select></label>
          <label class="field">Turma *<select name="turma_id" required></select></label>
          <div data-info class="ac-info-turma"></div>
          <div class="row"><button class="btn btn-primary" type="submit">Matricular</button>
            <span class="muted ac-sub">As mensalidades do mês atual até dezembro são geradas automaticamente.</span></div>
        </div>
      </form>
      <div data-resultado class="ac-nova-resultado"></div>
    </div>`;
  const form = $<HTMLFormElement>(el, 'form');
  const selAluno = $<HTMLSelectElement>(form, '[name="aluno_id"]');
  const selAno = $<HTMLSelectElement>(form, '[name="ano_letivo"]');
  const selTurma = $<HTMLSelectElement>(form, '[name="turma_id"]');
  const info = $(el, '[data-info]');
  const resultado = $(el, '[data-resultado]');
  const botao = $<HTMLButtonElement>(form, 'button[type="submit"]');
  resultado.innerHTML = `<div class="card ac-dica"><h3>Como funciona</h3><ul>
    <li>Escolha um aluno ativo e uma turma com vagas.</li>
    <li>O valor de cada mensalidade é o valor fixo do idioma da turma (veja <a href="#/idiomas">Idiomas e valores</a>).</li>
    <li>Vencimento no dia 10; se a matrícula for depois do dia 10, a 1ª parcela vence em 5 dias.</li>
    <li>Um aluno só pode ter uma matrícula ativa por idioma no ano.</li></ul></div>`;

  const mostrarInfo = () => {
    const t = turmas.find((x) => String(x.id) === selTurma.value);
    if (!t) { info.innerHTML = ''; return; }
    const v = vagas(t);
    info.innerHTML = `<dl class="ac-mini-dl ac-mini-dl-2">
      <div><dt>Idioma e nível</dt><dd>${esc(t.idioma_nome)} · ${nivel(t.nivel)}</dd></div>
      <div><dt>Mensalidade</dt><dd><strong class="ac-valor">${brl(mensalidade.get(t.idioma_id))}</strong></dd></div>
      <div><dt>Professor</dt><dd>${esc(t.professor_nome || '—')}</dd></div>
      <div><dt>Horário</dt><dd>${esc(t.horario || '—')}</dd></div>
      <div class="full"><dt>Vagas</dt><dd>${barraOcupacao(t.ocupacao, t.capacidade)} <span class="${v ? 'muted' : 'ac-danger'} ac-sub">${v ? `${v} vaga(s) livre(s)` : 'Turma lotada'}</span></dd></div>
    </dl>`;
  };

  const carregarTurmas = async (selecionar?: string) => {
    selTurma.innerHTML = '<option value="">Carregando turmas…</option>';
    try { turmas = await api.get<Turma[]>('/turmas', { ano: selAno.value }); }
    catch (err) { turmas = []; selTurma.innerHTML = '<option value="">Erro ao carregar turmas</option>'; showError(err); return; }
    selTurma.innerHTML = (turmas.length ? '<option value="">Selecione a turma…</option>' : '<option value="">Nenhuma turma neste ano</option>') +
      turmas.map((t) => {
        const v = vagas(t);
        return `<option value="${t.id}" ${v ? '' : 'disabled'} ${String(t.id) === selecionar && v ? 'selected' : ''}>${esc(t.nome)} — ${v ? `${v} vaga(s)` : 'lotada'} · ${brl(mensalidade.get(t.idioma_id))}/mês</option>`;
      }).join('');
    mostrarInfo();
  };

  selAno.onchange = () => void carregarTurmas();
  selTurma.onchange = mostrarInfo;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!selAluno.value) { selAluno.focus(); toast('Selecione o aluno', 'danger'); return; }
    if (!selTurma.value) { selTurma.focus(); toast('Selecione a turma', 'danger'); return; }
    botao.disabled = true;
    try {
      const m = await api.post<Matricula>('/matriculas', { aluno_id: Number(selAluno.value), turma_id: Number(selTurma.value), ano_letivo: Number(selAno.value) });
      const t = turmas.find((x) => x.id === m.turma_id);
      const valor = t ? mensalidade.get(t.idioma_id) : undefined;
      const n = m.mensalidades_geradas ?? 0;
      resultado.innerHTML = `<div class="card ac-sucesso" role="status">
        <h3>Matrícula realizada</h3>
        <p><strong>${esc(m.aluno_nome)}</strong> foi matriculado(a) na turma <strong>${esc(m.turma_nome)}</strong> (${esc(m.ano_letivo)}).</p>
        <div class="ac-sucesso-num"><span>${n}</span> mensalidade(s) gerada(s)${valor !== undefined ? ` de ${brl(valor)} · total ${brl(valor * n)}` : ''}</div>
        <div class="row"><a class="btn btn-soft" href="#/alunos/${m.aluno_id}">Ver histórico do aluno</a>
          <a class="btn btn-ghost" href="#/financeiro?aluno_id=${m.aluno_id}">Ver mensalidades</a></div></div>`;
      toast(`Matrícula realizada · ${n} mensalidade(s) gerada(s)`);
      selAluno.value = '';
      await carregarTurmas(String(m.turma_id));
    } catch (err) { showError(err); }
    finally { botao.disabled = false; }
  });

  await carregarTurmas(query.turma_id);
  (selAluno.value ? selTurma : selAluno).focus();
}

// ---------- Aba: rematrículas ----------

async function abaRematriculas(el: HTMLElement, query: Record<string, string>): Promise<void> {
  const ano = Number(query.ano) || anoAtual();
  el.innerHTML = `
    <div class="toolbar ac-filtros">
      <label class="field">Rematricular para o ano<select data-ano>${opcoesAno(ano)}</select></label>
      <p class="muted ac-sub ac-explica">Alunos ativos que estudaram no ano anterior e ainda não foram rematriculados no idioma.
        A turma sugerida é a do nível seguinte. Alunos com mensalidade em atraso não podem ser rematriculados.</p>
    </div>
    <div data-lista>${carregando()}</div>`;
  const lista = $(el, '[data-lista]');
  const selAno = $<HTMLSelectElement>(el, '[data-ano]');

  const recarregar = async () => {
    lista.classList.add('ac-atualizando');
    let sugs: SugestaoRematricula[]; let turmas: Turma[];
    try {
      [sugs, turmas] = await Promise.all([
        api.get<SugestaoRematricula[]>('/matriculas/sugestoes-rematricula', { ano: selAno.value }),
        api.get<Turma[]>('/turmas', { ano: selAno.value }),
      ]);
    } catch (err) { estadoErro(lista, err, () => void recarregar()); return; }
    finally { lista.classList.remove('ac-atualizando'); }
    if (!sugs.length) { lista.innerHTML = empty(`Nenhuma rematrícula pendente para ${selAno.value}.`); return; }
    const bloqueados = sugs.filter((s) => s.inadimplente).length;

    const opcoesDestino = (s: SugestaoRematricula) => {
      const sugIds = new Set(s.turmas_sugeridas.map((t) => t.id));
      const outras = turmas.filter((t) => t.idioma_id === s.idioma_id && !sugIds.has(t.id) && vagas(t) > 0)
        .sort((a, b) => a.nivel - b.nivel);
      if (!s.turmas_sugeridas.length && !outras.length) return '<option value="">Nenhuma turma com vaga</option>';
      return (s.turmas_sugeridas.length
        ? `<optgroup label="Sugeridas · ${nivel(s.nivel_sugerido)}">${s.turmas_sugeridas.map((t, i) =>
          `<option value="${t.id}" ${i === 0 ? 'selected' : ''}>${esc(t.nome)} (${vagas(t)} vaga(s))</option>`).join('')}</optgroup>`
        : '<option value="">Escolha uma turma…</option>') +
        (outras.length ? `<optgroup label="Outras turmas de ${esc(s.idioma_nome)}">${outras.map((t) =>
          `<option value="${t.id}">${esc(t.nome)} · ${nivel(t.nivel)} (${vagas(t)} vaga(s))</option>`).join('')}</optgroup>` : '');
    };

    lista.innerHTML = `
      <div class="ac-resumo-linha"><strong>${sugs.length}</strong> aluno(s) para rematricular
        ${bloqueados ? ` · <span class="ac-danger"><strong>${bloqueados}</strong> bloqueado(s) por inadimplência</span>` : ''}</div>
      <div class="table-wrap"><table>
      <thead><tr><th>Aluno</th><th>Idioma: nível atual → sugerido</th><th>Turma de destino</th><th><span class="ac-sr-only">Ações</span></th></tr></thead>
      <tbody>${sugs.map((s, i) => `<tr data-linha="${i}" class="${s.inadimplente ? 'ac-linha-alerta' : ''}">
        <td><a href="#/alunos/${s.aluno_id}" class="ac-strong-link">${esc(s.aluno_nome)}</a>
          ${s.inadimplente ? `<div><span title="Há mensalidade em atraso: a rematrícula é bloqueada até a regularização">${pill('Inadimplente · bloqueada', 'danger')}</span></div>` : ''}</td>
        <td><strong>${esc(s.idioma_nome)}</strong><div class="ac-nowrap ac-sub">${nivel(s.nivel_atual)} <span class="ac-seta" aria-label="para">→</span> <strong>${nivel(s.nivel_sugerido)}</strong></div></td>
        <td><label class="ac-sr-only" for="dest-${i}">Turma de destino de ${esc(s.aluno_nome)}</label>
          <select id="dest-${i}" class="ac-select-destino" ${s.inadimplente ? 'disabled' : ''}>${opcoesDestino(s)}</select></td>
        <td class="actions">${s.inadimplente
          ? `<a class="btn btn-ghost btn-sm" href="#/financeiro?aluno_id=${s.aluno_id}">Regularizar</a>`
          : `<button class="btn btn-primary btn-sm" type="button" data-remat="${i}">Rematricular</button>`}</td>
      </tr>`).join('')}</tbody></table></div>`;

    lista.querySelectorAll<HTMLButtonElement>('[data-remat]').forEach((b) => {
      b.onclick = async () => {
        const i = Number(b.dataset.remat);
        const s = sugs[i];
        const destino = $<HTMLSelectElement>(lista, `#dest-${i}`).value;
        if (!destino) { toast('Escolha a turma de destino', 'danger'); return; }
        b.disabled = true;
        try {
          const m = await api.post<Matricula>('/matriculas/rematricula', { aluno_id: s.aluno_id, turma_id_destino: Number(destino), ano_letivo: Number(selAno.value) });
          toast(`${s.aluno_nome} rematriculado(a) em ${m.turma_nome} · ${m.mensalidades_geradas ?? 0} mensalidade(s) gerada(s)`);
          void recarregar();
        } catch (err) { showError(err); b.disabled = false; }
      };
    });
  };

  selAno.onchange = () => void recarregar();
  await recarregar();
}

// ---------- Página ----------

const page: Page = {
  title: 'Matrículas',
  async render(container: HTMLElement, params: PageParams) {
    container.className = 'ac-page';
    const q = { ...params.query };
    const inicial: Aba = q.aba === 'nova' ? 'nova' : q.aba === 'rematriculas' || q.aba === 'rematricula' ? 'rematriculas' : 'lista';
    container.innerHTML = `<div class="tabs" role="tablist">${ABAS.map(([id, rot]) =>
      `<button type="button" role="tab" id="tab-${id}" aria-controls="painel-aba" data-aba="${id}">${esc(rot)}</button>`).join('')}</div>
      <div id="painel-aba" role="tabpanel"></div>`;
    const painel = $(container, '#painel-aba');
    const botoes = Array.from(container.querySelectorAll<HTMLButtonElement>('[data-aba]'));

    const abrir = async (aba: Aba, query: Record<string, string>) => {
      botoes.forEach((b) => { const on = b.dataset.aba === aba; b.classList.toggle('active', on); b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; });
      painel.setAttribute('aria-labelledby', `tab-${aba}`);
      history.replaceState(null, '', `#/matriculas${aba === 'lista' ? '' : `?aba=${aba}`}`);
      if (aba === 'lista') await abaLista(painel, query);
      else if (aba === 'nova') await abaNova(painel, query);
      else await abaRematriculas(painel, query);
    };
    botoes.forEach((b, i) => {
      b.onclick = () => void abrir(b.dataset.aba as Aba, {});
      b.onkeydown = (e) => {
        const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (d) { const n = botoes[(i + d + botoes.length) % botoes.length]; n.focus(); n.click(); }
      };
    });
    await abrir(inicial, q);
  },
};
export default page;
