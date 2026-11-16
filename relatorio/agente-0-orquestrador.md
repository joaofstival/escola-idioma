# Agente 0 — Orquestrador (sessão principal)

## Parte 1/8
- Analisei os requisitos do cliente e o arquivo "Avaliação configurável.html" (protótipo HTML de estudo de produto, não PDF); extraí regras do editor de avaliações configurável e as apliquei ao módulo Avaliações por turma.
- Escrevi `PLANO.md`: arquitetura, modelo de dados, contrato da API, divisão entre agentes e entrega em 8 partes.
- Mudança de stack a pedido do usuário: de Express web para **Electron + TypeScript** (sql.js, IPC com mini-roteador REST, esbuild).
- Criei a base: `package.json`, `tsconfig.json`, `scripts/build.mjs`, `src/shared/types.ts` (contrato), `src/preload/preload.ts`, e no renderer `index.html`, `styles.css`, `app.ts`, `api.ts`, `ui.ts`, `page.ts` e telas provisórias.
- Disparei e acompanhei o Agente de Pesquisa; incorporei as decisões (APIs, 12 níveis QECR, multa 2% e juros 1% a.m.).
