// Tela "Mensalidades" (Financeiro). Dono: agente Frontend — Financeiro e Ferramentas.
// Resumo do ano (KPIs + gráfico previsto × recebido), filtros, tabela com pagar/estornar, inadimplentes e CSV.
// Atraso, multa e juros vêm calculados do main (GET /mensalidades); aqui só se repete a conta para sugerir o
// valor quando o usuário muda a data do pagamento no modal.
import type { Page } from '../page.ts';
import { api, ApiError } from '../api.ts';
import {
  $, brl, competencia as fmtCompetencia, confirmDialog, date, empty, esc, modal, options, pill, showError, toast,
} from '../ui.ts';
import type { Inadimplente, Mensalidade, ResumoFinanceiro } from '../../../shared/types.ts';

type FiltroStatus = '' | 'pendente' | 'paga' | 'atrasada' | 'cancelada';
type Aba = 'mensalidades' | 'inadimplentes';

const STATUS: { valor: FiltroStatus; rotulo: string }[] = [
  { valor: '', rotulo: 'Todas' },
  { valor: 'pendente', rotulo: 'Pendentes' },
  { valor: 'paga', rotulo: 'Pagas' },
  { valor: 'atrasada', rotulo: 'Atrasadas' },
  { valor: 'cancelada', rotulo: 'Canceladas' },
];
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const MESES_CURTOS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

/** Formas aceitas no modal (texto livre no backend). As da seed (cartao_credito etc.) também têm rótulo. */
const FORMAS: { valor: string; rotulo: string }[] = [
  { valor: 'pix', rotulo: 'PIX' },
  { valor: 'cartao', rotulo: 'Cartão' },
  { valor: 'boleto', rotulo: 'Boleto' },
  { valor: 'dinheiro', rotulo: 'Dinheiro' },
  { valor: 'transferencia', rotulo: 'Transferência' },
];
const ROTULO_FORMA: Record<string, string> = {
  pix: 'PIX', cartao: 'Cartão', cartao_credito: 'Cartão de crédito', cartao_debito: 'Cartão de débito',
  boleto: 'Boleto', dinheiro: 'Dinheiro', transferencia: 'Transferência',
};
const formaRotulo = (f: string | null) => (f ? ROTULO_FORMA[f] ?? f : '—');

// Mesmas regras de src/main/services/financeiro.ts (só para sugerir o valor no modal).
const MULTA = 0.02;
const JUROS_MES = 0.01;
const arred = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
function diasEntre(de: string, ate: string): number {
  const utc = (iso: string) => { const [a, m, d] = iso.split('-').map(Number); return Date.UTC(a, m - 1, d); };
  return Math.round((utc(ate) - utc(de)) / 86_400_000);
}
function encargosEm(m: Mensalidade, dataRef: string) {
  const dias = m.vencimento < dataRef ? diasEntre(m.vencimento, dataRef) : 0;
  if (dias <= 0) return { dias: 0, multa: 0, juros: 0, total: arred(m.valor) };
  const multa = arred(m.valor * MULTA);
  const juros = arred(m.valor * JUROS_MES * (dias / 30));
  return { dias, multa, juros, total: arred(m.valor + multa + juros) };
}

/** Data local (o main valida "não futura" pela data local, não UTC). */
function hojeLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const diasTxt = (n: number) => `${n} ${n === 1 ? 'dia' : 'dias'}`;
const compacto = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 });

function explicacaoEncargos(m: Mensalidade): string {
  return `Valor original ${brl(m.valor)}\n+ multa de 2% = ${brl(m.multa)}\n+ juros de 1% ao mês pro rata (${diasTxt(m.dias_atraso)} ÷ 30) = ${brl(m.juros)}\n= ${brl(m.valor_atualizado)} (calculado para hoje)`;
}

// ---------- CSV ----------
function celulaCsv(v: unknown): string {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // evita fórmula ao abrir no Excel
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const numCsv = (n: number | null | undefined) => (n === null || n === undefined ? '' : n.toFixed(2).replace('.', ','));

function statusTexto(m: Mensalidade): string {
  if (m.status === 'paga') return 'Paga';
  if (m.status === 'cancelada') return 'Cancelada';
  return m.atrasada ? 'Atrasada' : 'Pendente';
}

export function gerarCsv(lista: Mensalidade[]): string {
  const cab = ['Aluno', 'Idioma', 'Turma', 'Competência', 'Vencimento', 'Valor', 'Status', 'Dias de atraso', 'Multa', 'Juros',
    'Valor atualizado', 'Data do pagamento', 'Valor pago', 'Forma de pagamento'];
  const linhas = lista.map((m) => [
    m.aluno_nome, m.idioma_nome, m.turma_nome, fmtCompetencia(m.competencia), date(m.vencimento), numCsv(m.valor),
    statusTexto(m), m.atrasada ? m.dias_atraso : '', numCsv(m.multa), numCsv(m.juros),
    m.status === 'cancelada' ? '' : numCsv(m.valor_atualizado),
    m.data_pagamento ? date(m.data_pagamento) : '', numCsv(m.valor_pago), m.forma_pagamento ? formaRotulo(m.forma_pagamento) : '',
  ]);
  return [cab, ...linhas].map((l) => l.map(celulaCsv).join(';')).join('\r\n') + '\r\n';
}

// ---------- Tela ----------
const page: Page = {
  title: 'Mensalidades',
  async render(container, params) {
    const anoAtual = Number(hojeLocal().slice(0, 4));
    const q = params.query;
    const statusUrl = STATUS.some((s) => s.valor === q.status) ? (q.status as FiltroStatus) : '';
    const anoUrl = Number(q.ano);
    const st = {
      anoResumo: anoUrl >= 2000 && anoUrl <= 2100 ? anoUrl : anoAtual,
      ano: q.ano === 'todos' ? 'todos' : String(anoUrl >= 2000 && anoUrl <= 2100 ? anoUrl : anoAtual),
      mes: /^(0[1-9]|1[0-2])$/.test(q.mes ?? '') ? q.mes : '',
      status: statusUrl,
      aluno: /^\d+$/.test(q.aluno_id ?? '') ? q.aluno_id : '',
      aba: (q.aba === 'inadimplentes' ? 'inadimplentes' : 'mensalidades') as Aba,
      lista: [] as Mensalidade[],
      inad: [] as Inadimplente[],
    };
    if (st.ano === 'todos') st.mes = '';

    const anos: number[] = [];
    for (let a = anoAtual + 1; a >= anoAtual - 3; a--) anos.push(a);
    if (!anos.includes(st.anoResumo)) anos.push(st.anoResumo);

    container.innerHTML = `
      <div class="fin">
        <div class="fin-head">
          <div>
            <h2 class="fin-title">Resumo de <span data-ano-titulo>${esc(st.anoResumo)}</span></h2>
            <p class="muted fin-sub">Competências do ano. Atraso = pendente com vencimento antes de hoje; multa de 2% e juros de 1% ao mês pro rata.</p>
          </div>
          <label class="fin-inline">Ano <select data-ano-resumo aria-label="Ano do resumo">
            ${anos.sort((a, b) => b - a).map((a) => `<option value="${a}" ${a === st.anoResumo ? 'selected' : ''}>${a}</option>`).join('')}
          </select></label>
        </div>
        <section data-resumo><div class="loading">Carregando resumo…</div></section>

        <div class="fin-tabbar">
          <div class="tabs fin-tabs" role="tablist">
            <button type="button" role="tab" data-aba="mensalidades">Mensalidades</button>
            <button type="button" role="tab" data-aba="inadimplentes" title="Alunos com mensalidade em atraso em qualquer ano letivo">Inadimplentes <span class="fin-badge" data-inad-count></span></button>
          </div>
          <button type="button" class="btn btn-ghost btn-sm" data-exportar title="Exporta a tabela com os filtros atuais">Exportar CSV</button>
        </div>

        <section data-painel="mensalidades">
          <div class="fin-filtros">
            <div class="fin-seg" role="group" aria-label="Status">
              ${STATUS.map((s) => `<button type="button" data-status="${esc(s.valor)}">${esc(s.rotulo)}</button>`).join('')}
            </div>
            <label class="fin-inline"><span class="sr-only">Aluno</span><select data-f="aluno"><option value="">Todos os alunos</option></select></label>
            <label class="fin-inline">Ano <select data-f="ano">
              <option value="todos">Todos</option>
              ${anos.map((a) => `<option value="${a}">${a}</option>`).join('')}
            </select></label>
            <label class="fin-inline"><span class="sr-only">Competência</span><select data-f="mes" title="Competência (mês)">
              <option value="">Todos os meses</option>
              ${MESES.map((m, i) => `<option value="${String(i + 1).padStart(2, '0')}">${m}</option>`).join('')}
            </select></label>
            <button type="button" class="btn-link fin-limpar" data-limpar>Limpar filtros</button>
          </div>
          <div data-tabela><div class="loading">Carregando mensalidades…</div></div>
        </section>

        <section data-painel="inadimplentes" hidden>
          <div data-inad><div class="loading">Carregando inadimplentes…</div></div>
        </section>
      </div>`;

    const elResumo = $(container, '[data-resumo]');
    const elTabela = $(container, '[data-tabela]');
    const elInad = $(container, '[data-inad]');
    const selAnoResumo = $<HTMLSelectElement>(container, '[data-ano-resumo]');
    const selAluno = $<HTMLSelectElement>(container, '[data-f="aluno"]');
    const selAno = $<HTMLSelectElement>(container, '[data-f="ano"]');
    const selMes = $<HTMLSelectElement>(container, '[data-f="mes"]');
    const btnExportar = $<HTMLButtonElement>(container, '[data-exportar]');

    // ----- Sincronização de controles e URL -----
    function sincronizarControles() {
      container.querySelectorAll<HTMLButtonElement>('[data-status]').forEach((b) => {
        const ativo = b.dataset.status === st.status;
        b.classList.toggle('active', ativo);
        b.setAttribute('aria-pressed', String(ativo));
      });
      selAno.value = st.ano;
      selMes.value = st.mes;
      selMes.disabled = st.ano === 'todos';
      selAluno.value = st.aluno;
      const algumFiltro = st.status !== '' || st.aluno !== '' || st.mes !== '' || st.ano !== String(st.anoResumo);
      $(container, '[data-limpar]').hidden = !algumFiltro;
      container.querySelectorAll<HTMLButtonElement>('[data-aba]').forEach((b) => {
        const ativo = b.dataset.aba === st.aba;
        b.classList.toggle('active', ativo);
        b.setAttribute('aria-selected', String(ativo));
      });
      container.querySelectorAll<HTMLElement>('[data-painel]').forEach((p) => { p.hidden = p.dataset.painel !== st.aba; });
      btnExportar.hidden = st.aba !== 'mensalidades';
      const qs = new URLSearchParams();
      if (st.status) qs.set('status', st.status);
      if (st.aluno) qs.set('aluno_id', st.aluno);
      if (st.ano !== String(anoAtual)) qs.set('ano', st.ano);
      if (st.mes) qs.set('mes', st.mes);
      if (st.aba !== 'mensalidades') qs.set('aba', st.aba);
      const hash = '#/financeiro' + (qs.size ? '?' + qs.toString() : '');
      // replaceState não dispara hashchange: a tela não é recriada, só a URL fica compartilhável.
      if (location.hash !== hash) history.replaceState(null, '', hash);
    }

    // ----- Resumo -----
    let seqResumo = 0;
    async function carregarResumo() {
      const seq = ++seqResumo;
      elResumo.setAttribute('aria-busy', 'true');
      try {
        const r = await api.get<ResumoFinanceiro>('/financeiro/resumo', { ano: st.anoResumo });
        if (seq !== seqResumo) return;
        elResumo.innerHTML = htmlResumo(r);
      } catch (err) {
        if (seq !== seqResumo) return;
        elResumo.innerHTML = htmlErro('Não foi possível carregar o resumo.', err, 'resumo');
        showError(err);
      } finally {
        if (seq === seqResumo) elResumo.removeAttribute('aria-busy');
      }
    }

    function htmlResumo(r: ResumoFinanceiro): string {
      const inadimplentes = r.alunos_inadimplentes.length;
      const previstoTotal = r.por_mes.reduce((s, m) => s + m.previsto, 0);
      const pct = previstoTotal > 0 ? Math.round((r.recebido / previstoTotal) * 100) : 0;
      const kpis = `
        <div class="fin-kpis">
          <div class="card kpi fin-kpi fin-kpi-ok"><div class="label">Recebido</div><div class="value">${esc(brl(r.recebido))}</div>
            <div class="hint">${previstoTotal > 0 ? `${pct}% do previsto no ano (${esc(brl(previstoTotal))})` : 'Nada previsto para o ano'}</div></div>
          <div class="card kpi fin-kpi fin-kpi-info"><div class="label">A receber</div><div class="value">${esc(brl(r.a_receber))}</div>
            <div class="hint">Pendentes ainda no prazo</div></div>
          <div class="card kpi fin-kpi fin-kpi-danger"><div class="label">Em atraso</div><div class="value">${esc(brl(r.em_atraso))}</div>
            <div class="hint">${inadimplentes ? `${inadimplentes} ${inadimplentes === 1 ? 'aluno' : 'alunos'} em ${r.ano} · <button type="button" class="btn-link" data-ver-atrasadas>ver atrasadas</button>` : 'Nenhum aluno em atraso'}</div></div>
        </div>`;
      return kpis + htmlGrafico(r);
    }

    function htmlGrafico(r: ResumoFinanceiro): string {
      const max = Math.max(0, ...r.por_mes.map((m) => Math.max(m.previsto, m.recebido)));
      if (max === 0) return `<div class="card fin-chart-card">${empty(`Sem mensalidades com competência em ${r.ano}.`)}</div>`;
      // Escala "redonda": 4 divisões com passo 1, 2, 2,5 ou 5 × 10^n.
      const bruto = max / 4;
      const pot = 10 ** Math.floor(Math.log10(bruto));
      const passo = [1, 2, 2.5, 5, 10].map((f) => f * pot).find((p) => p >= bruto)!;
      const topo = passo * 4;
      const linhas = [4, 3, 2, 1, 0].map((i) => `
        <div class="fin-grid-line" style="bottom:${(i / 4) * 100}%"><span>${esc(i === 0 ? 'R$ 0' : compacto.format(passo * i))}</span></div>`).join('');
      const mesAtual = hojeLocal().slice(0, 7);
      const colunas = r.por_mes.map((m) => {
        const idx = Number(m.competencia.slice(5, 7)) - 1;
        const hp = (m.previsto / topo) * 100;
        const hr = (m.recebido / topo) * 100;
        const rotulo = `${MESES[idx]}/${m.competencia.slice(0, 4)}: previsto ${brl(m.previsto)}, recebido ${brl(m.recebido)}`;
        const ativo = st.ano === m.competencia.slice(0, 4) && st.mes === m.competencia.slice(5, 7);
        return `
          <button type="button" class="fin-col ${m.competencia === mesAtual ? 'is-atual' : ''} ${ativo ? 'is-ativo' : ''}"
            data-mes="${esc(m.competencia)}" title="${esc(rotulo + '\nClique para filtrar a tabela por este mês')}" aria-label="${esc(rotulo)}">
            <span class="fin-bars">
              <span class="fin-bar fin-bar-prev" style="height:${hp.toFixed(2)}%"></span>
              <span class="fin-bar fin-bar-rec" style="height:${hr.toFixed(2)}%"></span>
            </span>
            <span class="fin-col-lbl">${MESES_CURTOS[idx]}</span>
          </button>`;
      }).join('');
      return `
        <div class="card fin-chart-card">
          <div class="fin-chart-head">
            <h3>Previsto × recebido por mês</h3>
            <div class="fin-legend"><span><i class="fin-sw fin-sw-prev"></i>Previsto</span><span><i class="fin-sw fin-sw-rec"></i>Recebido</span></div>
          </div>
          <div class="fin-chart" role="group" aria-label="Previsto e recebido por mês em ${esc(r.ano)}">
            <div class="fin-plot">${linhas}<div class="fin-cols">${colunas}</div></div>
          </div>
        </div>`;
    }

    // ----- Tabela -----
    let seqTabela = 0;
    async function carregarTabela() {
      const seq = ++seqTabela;
      elTabela.setAttribute('aria-busy', 'true');
      if (!st.lista.length) elTabela.innerHTML = '<div class="loading">Carregando mensalidades…</div>';
      btnExportar.disabled = true;
      try {
        const lista = await api.get<Mensalidade[]>('/mensalidades', {
          status: st.status || undefined,
          aluno_id: st.aluno || undefined,
          ano: st.ano !== 'todos' && !st.mes ? st.ano : undefined,
          competencia: st.ano !== 'todos' && st.mes ? `${st.ano}-${st.mes}` : undefined,
        });
        if (seq !== seqTabela) return;
        st.lista = lista;
        elTabela.innerHTML = htmlTabela(lista);
        btnExportar.disabled = lista.length === 0;
      } catch (err) {
        if (seq !== seqTabela) return;
        st.lista = [];
        elTabela.innerHTML = htmlErro('Não foi possível carregar as mensalidades.', err, 'tabela');
        showError(err);
      } finally {
        if (seq === seqTabela) elTabela.removeAttribute('aria-busy');
      }
    }

    function htmlStatus(m: Mensalidade): string {
      if (m.status === 'paga') {
        return `${pill('Paga', 'ok')}<div class="fin-sub2">${esc(date(m.data_pagamento))}<br>${esc(formaRotulo(m.forma_pagamento))}</div>`;
      }
      if (m.status === 'cancelada') return pill('Cancelada', 'muted');
      if (m.atrasada) return pill(`Atrasada · ${diasTxt(m.dias_atraso)}`, m.dias_atraso > 90 ? 'danger' : 'warn');
      return pill('Pendente', 'info');
    }

    function htmlAtualizado(m: Mensalidade): string {
      if (m.status === 'cancelada') return '<span class="muted">—</span>';
      if (m.status === 'paga') {
        return `<span title="${esc(`Valor pago em ${date(m.data_pagamento)}`)}">${esc(brl(m.valor_pago))}</span><div class="fin-sub2">pago</div>`;
      }
      if (!m.atrasada) return esc(brl(m.valor_atualizado));
      return `<span class="fin-upd" tabindex="0" title="${esc(explicacaoEncargos(m))}">${esc(brl(m.valor_atualizado))}</span>
        <div class="fin-sub2 fin-sub2-danger">+${esc(brl(m.multa + m.juros))} encargos</div>`;
    }

    function htmlAcoes(m: Mensalidade): string {
      if (m.status === 'pendente') return `<button type="button" class="btn btn-primary btn-sm" data-pagar="${m.id}" title="Registrar pagamento" aria-label="Registrar pagamento de ${esc(m.aluno_nome)} (${esc(fmtCompetencia(m.competencia))})">Pagar</button>`;
      if (m.status === 'paga') return `<button type="button" class="btn-link fin-estornar" data-estornar="${m.id}" title="Estornar pagamento" aria-label="Estornar pagamento de ${esc(m.aluno_nome)} (${esc(fmtCompetencia(m.competencia))})">Estornar</button>`;
      return '';
    }

    function htmlTabela(lista: Mensalidade[]): string {
      if (!lista.length) {
        return `<div class="table-wrap"><div class="empty">Nenhuma mensalidade encontrada com estes filtros.<br>
          <button type="button" class="btn btn-soft btn-sm fin-mt" data-limpar>Limpar filtros</button></div></div>`;
      }
      const ativas = lista.filter((m) => m.status !== 'cancelada');
      const somaValor = ativas.reduce((s, m) => s + m.valor, 0);
      const somaAtual = ativas.reduce((s, m) => s + (m.status === 'paga' ? m.valor_pago ?? 0 : m.valor_atualizado), 0);
      const linhas = lista.map((m) => `
        <tr class="${m.atrasada ? 'fin-row-late' : ''} ${m.status === 'cancelada' ? 'fin-row-off' : ''}">
          <td class="fin-td-aluno"><a href="#/alunos/${m.aluno_id}" class="fin-aluno" title="${esc(m.aluno_nome)}">${esc(m.aluno_nome)}</a></td>
          <td>${esc(m.idioma_nome ?? '—')}<div class="fin-sub2">${esc(m.turma_nome ?? '')}</div></td>
          <td>${esc(fmtCompetencia(m.competencia))}<div class="fin-sub2">vence ${esc(date(m.vencimento))}</div></td>
          <td class="num">${esc(brl(m.valor))}</td>
          <td>${htmlStatus(m)}</td>
          <td class="num">${htmlAtualizado(m)}</td>
          <td class="actions">${htmlAcoes(m)}</td>
        </tr>`).join('');
      return `
        <div class="table-wrap fin-table">
          <table>
            <thead><tr>
              <th>Aluno</th><th>Idioma / turma</th><th>Competência / vencimento</th><th class="num">Valor</th>
              <th>Status</th><th class="num" title="Com multa de 2% e juros de 1% ao mês pro rata quando atrasada">Valor atualizado</th><th class="actions"><span class="sr-only">Ações</span></th>
            </tr></thead>
            <tbody>${linhas}</tbody>
            <tfoot><tr>
              <td colspan="3">${lista.length} ${lista.length === 1 ? 'mensalidade' : 'mensalidades'}${lista.length !== ativas.length ? ` <span class="muted">(${lista.length - ativas.length} cancelada${lista.length - ativas.length === 1 ? '' : 's'} fora dos totais)</span>` : ''}</td>
              <td class="num">${esc(brl(somaValor))}</td><td></td><td class="num">${esc(brl(somaAtual))}</td><td></td>
            </tr></tfoot>
          </table>
        </div>`;
    }

    // ----- Inadimplentes -----
    let seqInad = 0;
    async function carregarInadimplentes() {
      const seq = ++seqInad;
      try {
        const inad = await api.get<Inadimplente[]>('/financeiro/inadimplentes');
        if (seq !== seqInad) return;
        st.inad = inad;
        const badge = $(container, '[data-inad-count]');
        badge.textContent = inad.length ? String(inad.length) : '';
        badge.title = `${inad.length} ${inad.length === 1 ? 'aluno' : 'alunos'} com atraso (todos os anos letivos)`;
        elInad.innerHTML = htmlInadimplentes(inad);
      } catch (err) {
        if (seq !== seqInad) return;
        elInad.innerHTML = htmlErro('Não foi possível carregar os inadimplentes.', err, 'inad');
        showError(err);
      }
    }

    function htmlInadimplentes(lista: Inadimplente[]): string {
      if (!lista.length) return `<div class="table-wrap">${empty('Nenhum aluno com mensalidade em atraso.')}</div>`;
      const total = lista.reduce((s, i) => s + i.total, 0);
      const totalAtual = lista.reduce((s, i) => s + i.total_atualizado, 0);
      return `
        <p class="muted fin-nota"><strong>${lista.length} ${lista.length === 1 ? 'aluno' : 'alunos'} (todos os anos letivos)</strong> — o KPI "Em atraso" do resumo conta só as competências do ano escolhido. Acima de 90 dias de atraso a Lei 9.870/99 admite medidas de cobrança.</p>
        <div class="table-wrap fin-table">
          <table>
            <thead><tr>
              <th>Aluno</th><th>Contato</th><th class="num">Parcelas</th><th class="num">Total original</th>
              <th class="num">Total atualizado</th><th>Atraso</th><th class="actions"><span class="sr-only">Ações</span></th>
            </tr></thead>
            <tbody>${lista.map((i) => `
              <tr>
                <td class="fin-td-aluno"><a href="#/alunos/${i.aluno_id}" class="fin-aluno" title="${esc(i.aluno_nome)}">${esc(i.aluno_nome)}</a></td>
                <td>${esc(i.email ?? '—')}<div class="fin-sub2">${esc(i.telefone ?? '')}</div></td>
                <td class="num">${i.qtd}</td>
                <td class="num">${esc(brl(i.total))}</td>
                <td class="num"><strong>${esc(brl(i.total_atualizado))}</strong></td>
                <td>${pill(diasTxt(i.dias_max_atraso), i.acima_90_dias ? 'danger' : 'warn')}
                  <div class="fin-sub2 ${i.acima_90_dias ? 'fin-sub2-danger' : ''}" title="Vencimento mais antigo em aberto">desde ${esc(date(i.vencimento_mais_antigo))}${i.acima_90_dias ? '<br>acima de 90 dias' : ''}</div></td>
                <td class="actions">
                  <button type="button" class="btn btn-soft btn-sm" data-ver-aluno="${i.aluno_id}">Ver parcelas</button>
                  <a class="fin-btn-a" href="#/alunos/${i.aluno_id}" title="Abrir o histórico do aluno">Histórico</a>
                </td>
              </tr>`).join('')}
            </tbody>
            <tfoot><tr>
              <td colspan="2">${lista.length} ${lista.length === 1 ? 'aluno' : 'alunos'}</td>
              <td class="num">${lista.reduce((s, i) => s + i.qtd, 0)}</td>
              <td class="num">${esc(brl(total))}</td><td class="num">${esc(brl(totalAtual))}</td><td colspan="2"></td>
            </tr></tfoot>
          </table>
        </div>`;
    }

    function htmlErro(msg: string, err: unknown, alvo: string): string {
      return `<div class="table-wrap"><div class="empty">${esc(msg)}<br><small>${esc((err as Error)?.message ?? '')}</small><br>
        <button type="button" class="btn btn-soft btn-sm fin-mt" data-retry="${esc(alvo)}">Tentar novamente</button></div></div>`;
    }

    async function carregarAlunos() {
      try {
        const alunos = await api.get<{ id: number; nome: string }[]>('/alunos');
        const itens = alunos.map((a) => ({ id: a.id, nome: a.nome }));
        selAluno.innerHTML = options(itens, { empty: 'Todos os alunos', selected: st.aluno });
      } catch (err) {
        showError(err);
      }
    }

    const recarregarTudo = () => Promise.all([carregarResumo(), carregarTabela(), carregarInadimplentes()]);

    // ----- Ações -----
    function abrirPagamento(m: Mensalidade) {
      const hoje = hojeLocal();
      const body = `
        <div class="fin-pay-resumo">
          <div><strong>${esc(m.aluno_nome)}</strong><div class="muted">${esc(m.idioma_nome ?? '')}${m.turma_nome ? ' · ' + esc(m.turma_nome) : ''}</div></div>
          <div class="fin-pay-meta">Competência <strong>${esc(fmtCompetencia(m.competencia))}</strong> · vence ${esc(date(m.vencimento))}</div>
        </div>
        <form class="form-grid fin-pay-form" novalidate>
          <label class="field">Valor pago (R$)
            <input name="valor_pago" type="number" inputmode="decimal" step="0.01" min="0.01" required value="${m.valor_atualizado.toFixed(2)}">
          </label>
          <label class="field">Data do pagamento
            <input name="data_pagamento" type="date" max="${hoje}" value="${hoje}" required>
          </label>
          <fieldset class="full fin-formas">
            <legend>Forma de pagamento</legend>
            ${FORMAS.map((f, i) => `<label class="fin-chip"><input type="radio" name="forma_pagamento" value="${f.valor}" ${i === 0 ? 'checked' : ''}><span>${esc(f.rotulo)}</span></label>`).join('')}
          </fieldset>
          <div class="full fin-calc" data-calc aria-live="polite"></div>
          <button type="submit" hidden></button>
        </form>`;
      let enviando = false;
      const h = modal({
        title: 'Registrar pagamento', size: 'md', body,
        actions: [
          { label: 'Cancelar', kind: 'soft' },
          { label: 'Registrar pagamento', kind: 'primary', onClick: () => void enviar() },
        ],
      });
      const form = $<HTMLFormElement>(h.el, 'form');
      const inValor = $<HTMLInputElement>(form, '[name="valor_pago"]');
      const inData = $<HTMLInputElement>(form, '[name="data_pagamento"]');
      const elCalc = $(form, '[data-calc]');
      let valorEditado = false;

      function atualizarCalculo() {
        const data = /^\d{4}-\d{2}-\d{2}$/.test(inData.value) ? inData.value : hoje;
        const e = encargosEm(m, data);
        if (!valorEditado) inValor.value = e.total.toFixed(2);
        elCalc.innerHTML = e.dias > 0
          ? `<div class="fin-calc-linhas">
               <span>Valor original</span><span>${esc(brl(m.valor))}</span>
               <span>Multa (2%)</span><span>${esc(brl(e.multa))}</span>
               <span>Juros 1% a.m. pro rata (${esc(diasTxt(e.dias))})</span><span>${esc(brl(e.juros))}</span>
               <strong>Valor atualizado em ${esc(date(data))}</strong><strong>${esc(brl(e.total))}</strong>
             </div>${valorEditado && Math.abs(Number(inValor.value) - e.total) >= 0.005 ? `<button type="button" class="btn-link" data-usar-sugerido>Usar ${esc(brl(e.total))}</button>` : ''}`
          : `<span class="muted">Pagamento até o vencimento: sem multa nem juros (${esc(brl(m.valor))}).</span>
             ${valorEditado && Math.abs(Number(inValor.value) - e.total) >= 0.005 ? ` <button type="button" class="btn-link" data-usar-sugerido>Usar ${esc(brl(e.total))}</button>` : ''}`;
      }
      inValor.addEventListener('input', () => { valorEditado = true; atualizarCalculo(); });
      inData.addEventListener('change', atualizarCalculo);
      elCalc.addEventListener('click', (ev) => {
        if ((ev.target as HTMLElement).closest('[data-usar-sugerido]')) { valorEditado = false; atualizarCalculo(); }
      });
      form.addEventListener('submit', (ev) => { ev.preventDefault(); void enviar(); });
      atualizarCalculo();
      inValor.select();

      async function enviar() {
        if (enviando) return;
        const valor = Number(inValor.value);
        const forma = form.querySelector<HTMLInputElement>('[name="forma_pagamento"]:checked')?.value;
        const erros: string[] = [];
        if (!(valor > 0)) erros.push('informe um valor pago maior que zero');
        if (!inData.value) erros.push('informe a data do pagamento');
        else if (inData.value > hoje) erros.push('a data do pagamento não pode ser futura');
        if (!forma) erros.push('escolha a forma de pagamento');
        if (erros.length) { showError(new ApiError(422, 'Confira os dados do pagamento', erros)); return; }
        enviando = true;
        h.el.querySelectorAll<HTMLButtonElement>('.modal-foot button').forEach((b) => { b.disabled = true; });
        try {
          const paga = await api.post<Mensalidade>(`/mensalidades/${m.id}/pagar`, { valor_pago: valor, forma_pagamento: forma, data_pagamento: inData.value });
          h.close();
          toast(`Pagamento de ${brl(paga.valor_pago)} registrado — ${m.aluno_nome ?? ''}, ${fmtCompetencia(m.competencia)}`, 'ok', {
            action: 'Desfazer', timeout: 6000, onAction: () => void estornar(paga, false),
          });
          await recarregarTudo();
        } catch (err) {
          showError(err); // 422 (já paga, data futura…) mantém o modal aberto para corrigir
          h.el.querySelectorAll<HTMLButtonElement>('.modal-foot button').forEach((b) => { b.disabled = false; });
        } finally {
          enviando = false;
        }
      }
    }

    async function estornar(m: Mensalidade, confirmar = true) {
      if (confirmar) {
        const ok = await confirmDialog(
          `Estornar o pagamento de ${brl(m.valor_pago)} de ${m.aluno_nome ?? 'aluno'} (competência ${fmtCompetencia(m.competencia)})? A mensalidade volta a ficar pendente e, se já venceu, volta a contar atraso.`,
          { title: 'Estornar pagamento', confirmLabel: 'Estornar', danger: true },
        );
        if (!ok) return;
      }
      try {
        await api.post<Mensalidade>(`/mensalidades/${m.id}/estornar`);
        toast(confirmar ? `Pagamento estornado — ${m.aluno_nome ?? ''}, ${fmtCompetencia(m.competencia)}` : 'Pagamento desfeito');
        await recarregarTudo();
      } catch (err) {
        showError(err);
      }
    }

    async function exportar() {
      if (!st.lista.length) return;
      try {
        const caminho = await api.saveFile('mensalidades.csv', gerarCsv(st.lista));
        if (caminho) toast(`${st.lista.length} mensalidades exportadas para ${caminho}`);
      } catch (err) {
        showError(err);
      }
    }

    // ----- Eventos -----
    const aplicarFiltros = () => { sincronizarControles(); void carregarTabela(); };

    container.addEventListener('click', (ev) => {
      const t = ev.target as HTMLElement;
      const b = <T extends HTMLElement = HTMLElement>(sel: string) => t.closest<T>(sel);
      let el: HTMLElement | null;
      if ((el = b('[data-status]'))) { st.status = el.dataset.status as FiltroStatus; aplicarFiltros(); }
      else if ((el = b('[data-aba]'))) { st.aba = el.dataset.aba as Aba; sincronizarControles(); }
      else if (b('[data-limpar]')) {
        st.status = ''; st.aluno = ''; st.mes = ''; st.ano = String(st.anoResumo);
        aplicarFiltros();
        void carregarResumo(); // remove o destaque do mês no gráfico
      }
      else if (b('[data-exportar]')) void exportar();
      else if (b('[data-ver-atrasadas]')) {
        st.status = 'atrasada'; st.aluno = ''; st.mes = ''; st.ano = String(st.anoResumo); st.aba = 'mensalidades';
        aplicarFiltros();
      }
      else if ((el = b('[data-mes]'))) {
        const [a, mm] = el.dataset.mes!.split('-');
        const mesmo = st.ano === a && st.mes === mm;
        st.ano = a; st.mes = mesmo ? '' : mm; st.aba = 'mensalidades';
        container.querySelectorAll('.fin-col').forEach((c) => c.classList.toggle('is-ativo', !mesmo && c === el));
        aplicarFiltros();
      }
      else if ((el = b('[data-pagar]'))) {
        const m = st.lista.find((x) => x.id === Number(el!.dataset.pagar));
        if (m) abrirPagamento(m);
      }
      else if ((el = b('[data-estornar]'))) {
        const m = st.lista.find((x) => x.id === Number(el!.dataset.estornar));
        if (m) void estornar(m);
      }
      else if ((el = b('[data-ver-aluno]'))) {
        st.aluno = el.dataset.verAluno!; st.status = 'atrasada'; st.ano = 'todos'; st.mes = ''; st.aba = 'mensalidades';
        aplicarFiltros();
      }
      else if ((el = b('[data-retry]'))) {
        const alvo = el.dataset.retry;
        if (alvo === 'resumo') void carregarResumo();
        else if (alvo === 'inad') void carregarInadimplentes();
        else void carregarTabela();
      }
    });

    selAnoResumo.addEventListener('change', () => {
      st.anoResumo = Number(selAnoResumo.value);
      $(container, '[data-ano-titulo]').textContent = String(st.anoResumo);
      st.ano = String(st.anoResumo); st.mes = '';
      sincronizarControles();
      void carregarResumo();
      void carregarTabela();
    });
    selAluno.addEventListener('change', () => { st.aluno = selAluno.value; aplicarFiltros(); });
    selAno.addEventListener('change', () => { st.ano = selAno.value; if (st.ano === 'todos') st.mes = ''; aplicarFiltros(); });
    selMes.addEventListener('change', () => {
      st.mes = selMes.value;
      container.querySelectorAll<HTMLElement>('.fin-col').forEach((c) => c.classList.toggle('is-ativo', c.dataset.mes === `${st.ano}-${st.mes}`));
      aplicarFiltros();
    });

    sincronizarControles();
    // O roteador só troca a tela depois que render resolve: espera a 1ª carga (sem lançar) para não piscar.
    await Promise.all([carregarAlunos(), recarregarTudo()]);
    sincronizarControles();
  },
};
export default page;
