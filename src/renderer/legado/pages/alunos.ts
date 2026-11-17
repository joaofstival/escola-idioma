// Alunos: lista com busca e filtro, cadastro em modal, inativar/reativar e detalhe com histórico (#/alunos/:id).
import type { Page, PageParams } from '../page.ts';
import type { Aluno, Conversao, HistoricoAluno, Mensalidade, MatriculaStatus } from '../../../shared/types.ts';
import { api } from '../api.ts';
import { $, brl, competencia, confirmDialog, date, empty, esc, formData, money, nivel, pill, showError, toast } from '../ui.ts';
import { MOEDAS, carregando, debounce, estadoErro, formModal, semVazios } from '../comum.ts';

// ---------- Formulário ----------

function abrirForm(aluno: Aluno | null, aoSalvar: () => void): void {
  const moeda = aluno?.moeda_origem || 'BRL';
  const moedas = MOEDAS.includes(moeda) ? MOEDAS : [...MOEDAS, moeda];
  formModal({
    title: aluno ? `Editar ${aluno.nome}` : 'Novo aluno',
    body: `<div class="form-grid">
      <label class="field full">Nome completo *<input name="nome" required maxlength="150" value="${esc(aluno?.nome)}"></label>
      <label class="field">Data de nascimento<input name="data_nascimento" type="date" value="${esc(aluno?.data_nascimento)}"></label>
      <label class="field">Documento (CPF, RNE ou passaporte)<input name="documento" maxlength="30" value="${esc(aluno?.documento)}"></label>
      <label class="field">E-mail<input name="email" type="email" maxlength="150" value="${esc(aluno?.email)}"></label>
      <label class="field">Telefone<input name="telefone" type="tel" maxlength="30" value="${esc(aluno?.telefone)}"></label>
      <label class="field full">Endereço<input name="endereco" maxlength="300" value="${esc(aluno?.endereco)}"></label>
      <label class="field">País de origem<input name="pais_origem" maxlength="60" value="${esc(aluno?.pais_origem)}" placeholder="Ex.: Brasil, Argentina"></label>
      <label class="field">Moeda de origem<select name="moeda_origem">${moedas.map((m) => `<option ${m === moeda ? 'selected' : ''}>${m}</option>`).join('')}</select></label>
      <p class="full muted ac-nota">Para alunos estrangeiros, o histórico mostra as mensalidades também na moeda de origem (cotação do dia).</p>
      ${aluno ? `<label class="check full"><input type="checkbox" name="ativo" ${aluno.ativo ? 'checked' : ''}> Aluno ativo</label>` : ''}
    </div>`,
    async onSubmit(form) {
      const d = semVazios(formData<Record<string, unknown>>(form));
      if (aluno) await api.put(`/alunos/${aluno.id}`, d);
      else await api.post('/alunos', d);
      toast(aluno ? 'Dados do aluno atualizados' : 'Aluno cadastrado');
      aoSalvar();
    },
  });
}

async function alternarAtivo(aluno: Aluno, aoSalvar: () => void): Promise<void> {
  if (aluno.ativo) {
    const ok = await confirmDialog(`Inativar ${aluno.nome}? O aluno deixa de aparecer nas matrículas, mas o histórico é mantido.`,
      { title: 'Inativar aluno', confirmLabel: 'Inativar', danger: true });
    if (!ok) return;
  }
  try {
    await api.put(`/alunos/${aluno.id}`, { ativo: !aluno.ativo });
    toast(aluno.ativo ? 'Aluno inativado' : 'Aluno reativado');
    aoSalvar();
  } catch (err) { showError(err); }
}

// ---------- Lista ----------

async function renderLista(container: HTMLElement): Promise<void> {
  container.innerHTML = `
    <div class="toolbar ac-filtros">
      <label class="field ac-busca">Buscar<input type="search" data-busca placeholder="Nome, e-mail, documento ou telefone"></label>
      <label class="field">Situação<select data-ativo>
        <option value="true">Ativos</option><option value="false">Inativos</option><option value="">Todos</option></select></label>
      <div class="spacer"></div>
      <span class="muted" data-total aria-live="polite"></span>
      <button class="btn btn-primary" type="button" data-novo>Novo aluno</button>
    </div>
    <div data-lista>${carregando()}</div>`;
  const lista = $(container, '[data-lista]');
  const busca = $<HTMLInputElement>(container, '[data-busca]');
  const ativo = $<HTMLSelectElement>(container, '[data-ativo]');
  const total = $(container, '[data-total]');
  let seq = 0;

  const recarregar = async () => {
    const meu = ++seq;
    lista.classList.add('ac-atualizando');
    let alunos: Aluno[];
    try { alunos = await api.get<Aluno[]>('/alunos', { busca: busca.value.trim(), ativo: ativo.value }); }
    catch (err) { if (meu === seq) estadoErro(lista, err, () => void recarregar()); return; }
    finally { lista.classList.remove('ac-atualizando'); }
    if (meu !== seq) return; // resposta antiga (o usuário continuou digitando)
    total.textContent = `${alunos.length} aluno(s)`;
    if (!alunos.length) {
      lista.innerHTML = empty(busca.value.trim() ? `Nenhum aluno encontrado para "${busca.value.trim()}".` : 'Nenhum aluno nesta situação.');
      return;
    }
    lista.innerHTML = `<div class="table-wrap"><table>
      <thead><tr><th>Aluno</th><th>Documento</th><th class="ac-col-opc">Telefone</th><th>Origem</th><th>Situação</th><th><span class="ac-sr-only">Ações</span></th></tr></thead>
      <tbody>${alunos.map((a) => `<tr>
        <td><a href="#/alunos/${a.id}" class="ac-strong-link">${esc(a.nome)}</a>${a.email ? `<div class="muted ac-sub">${esc(a.email)}</div>` : ''}</td>
        <td class="ac-nowrap">${esc(a.documento || '—')}</td>
        <td class="ac-nowrap ac-col-opc">${esc(a.telefone || '—')}</td>
        <td>${esc(a.pais_origem || '—')}${a.moeda_origem !== 'BRL' ? ` <span class="pill pill-info">${esc(a.moeda_origem)}</span>` : ''}</td>
        <td>${a.ativo ? pill('Ativo', 'ok') : pill('Inativo', 'muted')}</td>
        <td class="actions">
          <button class="btn btn-ghost btn-sm" type="button" data-editar="${a.id}">Editar</button>
          <button class="btn btn-ghost btn-sm ${a.ativo ? 'ac-btn-danger' : ''}" type="button" data-ativo="${a.id}">${a.ativo ? 'Inativar' : 'Reativar'}</button>
        </td></tr>`).join('')}</tbody></table></div>`;
    const achar = (id?: string) => alunos.find((a) => a.id === Number(id))!;
    lista.querySelectorAll<HTMLButtonElement>('[data-editar]').forEach((b) => { b.onclick = () => abrirForm(achar(b.dataset.editar), () => void recarregar()); });
    lista.querySelectorAll<HTMLButtonElement>('[data-ativo]').forEach((b) => { b.onclick = () => void alternarAtivo(achar(b.dataset.ativo), () => void recarregar()); });
  };

  busca.addEventListener('input', debounce(() => void recarregar(), 300));
  busca.addEventListener('keydown', (e) => { if (e.key === 'Enter') void recarregar(); });
  ativo.onchange = () => void recarregar();
  $<HTMLButtonElement>(container, '[data-novo]').onclick = () => abrirForm(null, () => void recarregar());
  await recarregar();
}

// ---------- Detalhe / histórico ----------

const STATUS_MAT: Record<MatriculaStatus, [string, 'ok' | 'muted' | 'info']> = {
  ativa: ['Ativa', 'ok'], concluida: ['Concluída', 'info'], cancelada: ['Cancelada', 'muted'],
};

function statusMensalidade(m: Mensalidade): string {
  if (m.status === 'paga') return `${pill('Paga', 'ok')}<div class="muted ac-sub">em ${date(m.data_pagamento)}</div>`;
  if (m.status === 'cancelada') return pill('Cancelada', 'muted');
  if (m.atrasada) return `${pill('Atrasada', 'danger')}<div class="ac-sub ac-danger">${m.dias_atraso} ${m.dias_atraso === 1 ? 'dia' : 'dias'} de atraso</div>`;
  return pill('A vencer', 'warn');
}

/** Valor que importa em cada situação: pago, atualizado (atrasada) ou original. */
function valorRelevante(m: Mensalidade): number | null {
  if (m.status === 'cancelada') return null;
  if (m.status === 'paga') return m.valor_pago ?? m.valor;
  return m.atrasada ? m.valor_atualizado : m.valor;
}

function dado(rotulo: string, valor: string | null | undefined): string {
  return `<div><dt>${esc(rotulo)}</dt><dd>${valor ? esc(valor) : '<span class="muted">—</span>'}</dd></div>`;
}

async function renderDetalhe(container: HTMLElement, id: number): Promise<void> {
  container.innerHTML = carregando('Carregando histórico…');
  let h: HistoricoAluno;
  try { h = await api.get<HistoricoAluno>(`/alunos/${id}/historico`); }
  catch (err) {
    container.innerHTML = '<p class="ac-voltar-p"><a href="#/alunos" class="ac-voltar">← Voltar para alunos</a></p><div data-erro></div>';
    estadoErro($(container, '[data-erro]'), err, () => void renderDetalhe(container, id));
    return;
  }
  const { aluno, matriculas, resumo } = h;
  const mensalidades = [...h.mensalidades].sort((a, b) => b.competencia.localeCompare(a.competencia) || b.id - a.id);
  const estrangeiro = aluno.moeda_origem && aluno.moeda_origem !== 'BRL';
  const recarregar = () => void renderDetalhe(container, id);

  container.innerHTML = `
    <p class="ac-voltar-p"><a href="#/alunos" class="ac-voltar">← Voltar para alunos</a></p>
    <div class="card ac-perfil">
      <div class="ac-perfil-head">
        <div>
          <h2>${esc(aluno.nome)} ${aluno.ativo ? pill('Ativo', 'ok') : pill('Inativo', 'muted')}
            ${estrangeiro ? pill(`Estrangeiro · ${aluno.moeda_origem}`, 'info') : ''}</h2>
          <div class="muted">Cadastrado em ${date(aluno.criado_em)}</div>
        </div>
        <div class="row">
          <button class="btn btn-ghost" type="button" data-editar>Editar</button>
          <button class="btn btn-ghost ${aluno.ativo ? 'ac-btn-danger' : ''}" type="button" data-ativo>${aluno.ativo ? 'Inativar' : 'Reativar'}</button>
          ${aluno.ativo ? `<a class="btn btn-primary" href="#/matriculas?aba=nova&aluno_id=${aluno.id}">Nova matrícula</a>` : ''}
        </div>
      </div>
      <dl class="ac-dl">
        ${dado('Data de nascimento', aluno.data_nascimento ? date(aluno.data_nascimento) : null)}
        ${dado('Documento', aluno.documento)}
        ${dado('E-mail', aluno.email)}
        ${dado('Telefone', aluno.telefone)}
        ${dado('Endereço', aluno.endereco)}
        ${dado('País de origem', aluno.pais_origem)}
        ${dado('Moeda de origem', aluno.moeda_origem)}
      </dl>
    </div>

    <div class="grid grid-3 ac-resumo">
      <div class="card kpi"><div class="label">Pago</div><div class="value ac-ok">${brl(resumo.pago)}</div><div class="hint" data-conv="pago"></div></div>
      <div class="card kpi"><div class="label">A vencer</div><div class="value">${brl(resumo.pendente)}</div><div class="hint" data-conv="pendente"></div></div>
      <div class="card kpi"><div class="label">Em atraso <span class="muted">(valor original)</span></div>
        <div class="value ${resumo.atrasado ? 'ac-danger' : ''}">${brl(resumo.atrasado)}</div><div class="hint" data-conv="atrasado"></div></div>
    </div>

    <section class="ac-secao" aria-labelledby="h-mat">
      <h3 id="h-mat">Matrículas</h3>
      ${matriculas.length ? `<div class="table-wrap"><table>
        <thead><tr><th class="num">Ano</th><th>Idioma</th><th>Turma</th><th>Nível</th><th>Tipo</th><th>Situação</th><th class="num">Data</th></tr></thead>
        <tbody>${[...matriculas].sort((a, b) => b.ano_letivo - a.ano_letivo || b.id - a.id).map((m) => `<tr>
          <td class="num">${esc(m.ano_letivo)}</td>
          <td>${esc(m.idioma_nome || '—')}</td>
          <td><a href="#/turmas/${m.turma_id}">${esc(m.turma_nome || 'Turma ' + m.turma_id)}</a></td>
          <td>${m.nivel ? nivel(m.nivel) : '—'}</td>
          <td>${m.tipo === 'rematricula' ? 'Rematrícula' : 'Matrícula'}</td>
          <td>${pill(STATUS_MAT[m.status][0], STATUS_MAT[m.status][1])}</td>
          <td class="num">${date(m.data)}</td></tr>`).join('')}</tbody></table></div>`
        : empty('Este aluno ainda não tem matrículas.')}
    </section>

    <section class="ac-secao" aria-labelledby="h-mens">
      <div class="ac-card-head"><h3 id="h-mens">Mensalidades</h3><span class="muted ac-sub" data-cotacao>${estrangeiro ? `Convertendo para ${esc(aluno.moeda_origem)}…` : ''}</span></div>
      ${mensalidades.length ? `<div class="table-wrap"><table class="ac-tabela-mens">
        <thead><tr><th>Competência</th><th class="num">Vencimento</th><th class="num">Valor</th>
          <th class="num">Pago / atualizado</th>${estrangeiro ? `<th class="num">Em ${esc(aluno.moeda_origem)}</th>` : ''}<th>Situação</th></tr></thead>
        <tbody>${mensalidades.map((m) => {
          const rel = valorRelevante(m);
          return `<tr class="${m.status === 'cancelada' ? 'ac-linha-apagada' : ''}">
          <td title="${esc(m.turma_nome)}">${competencia(m.competencia)}<div class="muted ac-sub">${esc(m.idioma_nome || '')}</div></td>
          <td class="num">${date(m.vencimento)}</td>
          <td class="num">${brl(m.valor)}</td>
          <td class="num ${m.atrasada ? 'ac-danger' : ''}" ${m.atrasada ? `title="Multa ${brl(m.multa)} + juros ${brl(m.juros)}"` : ''}>${rel === null ? '—' : brl(rel)}${m.atrasada ? '<div class="muted ac-sub">com multa e juros</div>' : ''}</td>
          ${estrangeiro ? `<td class="num" data-conv-valor="${rel ?? ''}">${rel === null ? '—' : '<span class="muted">…</span>'}</td>` : ''}
          <td>${statusMensalidade(m)}</td></tr>`;
        }).join('')}</tbody></table></div>`
        : empty('Nenhuma mensalidade gerada para este aluno.')}
    </section>`;

  $<HTMLButtonElement>(container, '[data-editar]').onclick = () => abrirForm(aluno, recarregar);
  $<HTMLButtonElement>(container, '[data-ativo]').onclick = () => void alternarAtivo(aluno, recarregar);

  if (estrangeiro) void converter(container, aluno.moeda_origem, resumo);
}

/** Mostra os valores na moeda do aluno. Se a cotação falhar, só exibe um aviso discreto. */
async function converter(container: HTMLElement, moeda: string, resumo: HistoricoAluno['resumo']): Promise<void> {
  const aviso = container.querySelector<HTMLElement>('[data-cotacao]');
  try {
    const c = await api.get<Conversao>('/cotacao/converter', { valor: 1, de: 'BRL', para: moeda });
    if (!container.isConnected) return;
    const taxa = c.taxa || c.resultado;
    const fmt = (v: number) => money(v * taxa, moeda);
    container.querySelectorAll<HTMLElement>('[data-conv-valor]').forEach((td) => {
      const v = td.dataset.convValor;
      if (v) td.textContent = fmt(Number(v));
    });
    (['pago', 'pendente', 'atrasado'] as const).forEach((k) => {
      const el = container.querySelector<HTMLElement>(`[data-conv="${k}"]`);
      if (el) el.textContent = `≈ ${fmt(resumo[k])}`;
    });
    if (aviso) {
      aviso.textContent = `Cotação: 1 BRL = ${money(taxa, moeda)} · ${c.fonte} · ${date(c.data)}${c.desatualizada ? ' (desatualizada)' : ''}`;
    }
  } catch {
    if (!container.isConnected) return;
    container.querySelectorAll<HTMLElement>('[data-conv-valor]').forEach((td) => { td.innerHTML = '<span class="muted">—</span>'; });
    if (aviso) {
      aviso.textContent = `Cotação para ${moeda} indisponível no momento; valores somente em BRL.`;
      aviso.classList.add('ac-aviso');
    }
  }
}

const page: Page = {
  title: 'Alunos',
  async render(container: HTMLElement, params: PageParams) {
    container.className = 'ac-page';
    const id = Number(params.segments[0]);
    if (params.segments[0] && Number.isInteger(id) && id > 0) await renderDetalhe(container, id);
    else await renderLista(container);
  },
};
export default page;
