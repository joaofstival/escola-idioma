// Roteador por hash. Cada tela é um módulo em ./pages/<rota>.ts que exporta default um Page.
// params = segmentos após a rota (#/alunos/5 → ['5']) e params.query com a query string.
import { esc, showError } from './ui.ts';
import type { Page } from './page.ts';

import dashboard from './pages/dashboard.ts';
import alunos from './pages/alunos.ts';
import professores from './pages/professores.ts';
import idiomas from './pages/idiomas.ts';
import turmas from './pages/turmas.ts';
import matriculas from './pages/matriculas.ts';
import materiais from './pages/materiais.ts';
import avaliacoes from './pages/avaliacoes.ts';
import financeiro from './pages/financeiro.ts';
import cotacao from './pages/cotacao.ts';
import traducao from './pages/traducao.ts';

const PAGES: Record<string, Page> = { dashboard, alunos, professores, idiomas, turmas, matriculas, materiais, avaliacoes, financeiro, cotacao, traducao };

const view = document.getElementById('view')!;
const titleEl = document.getElementById('pageTitle')!;

async function route() {
  const raw = location.hash.replace(/^#\/?/, '') || 'dashboard';
  const [path, query = ''] = raw.split('?');
  const [name, ...rest] = path.split('/');
  const key = name in PAGES ? name : 'dashboard';
  const page = PAGES[key];

  document.querySelectorAll<HTMLAnchorElement>('#nav a').forEach((a) => a.classList.toggle('active', a.dataset.route === key));
  document.body.classList.remove('nav-open');
  titleEl.textContent = page.title;
  document.title = `${page.title} — Escola de Idiomas`;
  view.innerHTML = '<div class="loading">Carregando…</div>';
  try {
    const container = document.createElement('div');
    await page.render(container, { segments: rest, query: Object.fromEntries(new URLSearchParams(query)) });
    view.replaceChildren(container);
  } catch (err) {
    console.error(err);
    view.innerHTML = `<div class="empty">Não foi possível carregar esta tela.<br><small>${esc((err as Error).message)}</small></div>`;
    showError(err);
  }
}

document.getElementById('menuToggle')!.onclick = () => document.body.classList.toggle('nav-open');
window.addEventListener('hashchange', route);
route();
