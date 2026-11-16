// Painel inicial: KPIs, atalhos, inadimplentes e ocupação das turmas do ano.
import type { Page } from '../page.ts';
import type { Dashboard, Inadimplente, Turma } from '../../shared/types.ts';
import { api } from '../api.ts';
import { $, brl, esc, empty, nivel, showError } from '../ui.ts';
import { anoAtual, barraOcupacao, carregando, estadoErro } from '../comum.ts';

// ---------- Tela do painel ----------

function kpi(label: string, value: string, hint: string, href: string, tom = ''): string {
  return `<a class="card kpi ac-kpi ${tom}" href="${href}"><div class="label">${esc(label)}</div>
    <div class="value">${value}</div><div class="hint">${hint}</div></a>`;
}

async function carregar(root: HTMLElement): Promise<void> {
  root.innerHTML = carregando();
  const ano = anoAtual();
  let d: Dashboard;
  try { d = await api.get<Dashboard>('/dashboard'); }
  catch (err) { estadoErro(root, err, () => void carregar(root)); return; }

  root.innerHTML = `
    <div class="toolbar">
      <div><strong>Ano letivo ${esc(d.ano)}</strong> <span class="muted">· visão geral da escola</span></div>
      <div class="spacer"></div>
      <a class="btn btn-ghost" href="#/financeiro?status=atrasada">Ver inadimplentes</a>
      <a class="btn btn-primary" href="#/matriculas?aba=nova">Nova matrícula</a>
    </div>
    <div class="grid grid-4 ac-kpis">
      ${kpi('Alunos ativos', esc(d.alunos_ativos), `${esc(d.professores_ativos)} professores ativos`, '#/alunos')}
      ${kpi(`Turmas em ${d.ano}`, esc(d.turmas_ano), `${esc(d.matriculas_ano)} matrículas ativas`, '#/turmas')}
      ${kpi('Receita do mês', brl(d.receita_mes), `A receber no mês: ${brl(d.a_receber_mes)}`, '#/financeiro')}
      ${kpi('Inadimplentes', esc(d.inadimplentes), d.inadimplentes ? 'alunos com mensalidade atrasada' : 'nenhum atraso no momento',
        '#/financeiro?status=atrasada', d.inadimplentes ? 'ac-kpi-danger' : 'ac-kpi-ok')}
    </div>
    <div class="grid grid-2 ac-dash-cols">
      <section class="card" aria-labelledby="h-inad">
        <div class="ac-card-head"><h3 id="h-inad">Inadimplentes</h3><a href="#/financeiro?status=atrasada">Ver todos</a></div>
        <div data-inad>${carregando()}</div>
      </section>
      <section class="card" aria-labelledby="h-turmas">
        <div class="ac-card-head"><h3 id="h-turmas">Turmas de ${esc(d.ano)}</h3><a href="#/turmas">Gerenciar</a></div>
        <div data-turmas>${carregando()}</div>
      </section>
    </div>`;

  const inadEl = $(root, '[data-inad]');
  const turmasEl = $(root, '[data-turmas]');

  const [inad, turmas] = await Promise.allSettled([
    api.get<Inadimplente[]>('/financeiro/inadimplentes'),
    api.get<Turma[]>('/turmas', { ano: d.ano || ano }),
  ]);

  if (inad.status === 'rejected') estadoErro(inadEl, inad.reason);
  else if (!inad.value.length) inadEl.innerHTML = empty('Nenhum aluno com mensalidade em atraso.');
  else {
    const lista = inad.value.slice(0, 6);
    inadEl.innerHTML = `<table class="ac-compact"><thead><tr><th>Aluno</th><th class="num">Parcelas</th><th class="num">Maior atraso</th><th class="num">Total atualizado</th></tr></thead>
      <tbody>${lista.map((i) => `<tr>
        <td><a href="#/alunos/${i.aluno_id}">${esc(i.aluno_nome)}</a>${i.acima_90_dias ? ' <span class="pill pill-danger">+90 dias</span>' : ''}</td>
        <td class="num">${esc(i.qtd)}</td>
        <td class="num">${esc(i.dias_max_atraso)} dias</td>
        <td class="num"><strong>${brl(i.total_atualizado)}</strong></td></tr>`).join('')}</tbody></table>
      ${inad.value.length > lista.length ? `<p class="muted ac-mais">+ ${inad.value.length - lista.length} outro(s)</p>` : ''}`;
  }

  if (turmas.status === 'rejected') estadoErro(turmasEl, turmas.reason);
  else if (!turmas.value.length) turmasEl.innerHTML = empty(`Nenhuma turma cadastrada em ${d.ano}.`);
  else {
    turmasEl.innerHTML = `<ul class="ac-turma-lista">${turmas.value.map((t) => `<li>
      <a href="#/turmas/${t.id}" class="ac-turma-nome">${esc(t.nome)}</a>
      <span class="muted">${nivel(t.nivel)}</span>
      ${barraOcupacao(t.ocupacao, t.capacidade)}</li>`).join('')}</ul>`;
  }
}

const page: Page = {
  title: 'Painel',
  async render(container) {
    container.className = 'ac-page';
    await carregar(container);
  },
};
export default page;
