# Agente 0 — Orquestrador (sessão principal)

## Parte 1/8
- Analisei os requisitos do cliente e o arquivo "Avaliação configurável.html" (protótipo HTML de estudo de produto, não PDF); extraí regras do editor de avaliações configurável e as apliquei ao módulo Avaliações por turma.
- Escrevi `PLANO.md`: arquitetura, modelo de dados, contrato da API, divisão entre agentes e entrega em 8 partes.
- Mudança de stack a pedido do usuário: de Express web para **Electron + TypeScript** (sql.js, IPC com mini-roteador REST, esbuild).
- Criei a base: `package.json`, `tsconfig.json`, `scripts/build.mjs`, `src/shared/types.ts` (contrato), `src/preload/preload.ts`, e no renderer `index.html`, `styles.css`, `app.ts`, `api.ts`, `ui.ts`, `page.ts` e telas provisórias.
- Disparei e acompanhei o Agente de Pesquisa; incorporei as decisões (APIs, 12 níveis QECR, multa 2% e juros 1% a.m.).
- Criei o repositório privado `joaofstival/escola-idioma` no GitHub e convidei `willcotil` como colaborador (permissão de escrita).
- Commit da parte 1/8.

## Parte 2/8
- Disparei o Agente Backend com o escopo do núcleo (banco sql.js, roteador IPC, janela Electron, seed, CRUD de idiomas/alunos/professores/turmas e testes), revisei a entrega e fiz o commit.
- Enviei as partes 1 e 2 ao GitHub pela conta dona (joaofstival), voltando depois a conta ativa do `gh`.

## Parte 3/8
- A pedido do usuário, os commits passam a usar a identidade global do git (removi o autor local do repositório).
- Disparei o Agente Backend para matrículas/rematrículas, materiais, financeiro, histórico e painel; conferi typecheck, 49 testes e build; commit.

## Parte 4/8
- Retomei o Agente Backend para cotação (AwesomeAPI → open.er-api, cache), tradução (MyMemory → Google gtx → dicionário offline) e avaliações configuráveis; conferi typecheck, 78 testes e build; commit e envio das partes 3 e 4.

## Partes 5/8 e 6/8
- Acrescentei ao `main.ts` um modo de captura de tela (`ESCOLA_SCREENSHOT`, `ESCOLA_ROTAS`, `ESCOLA_USERDATA`) para os agentes verificarem o visual no app real.
- Disparei em paralelo o Agente Frontend Acadêmico (7 telas) e o Agente Frontend Financeiro (Mensalidades).
- Revisei as capturas: pedi ao agente financeiro para corrigir botões cortados a 1280 px e a divergência "4 × 5 inadimplentes" (era diferença de período, agora explícita nos rótulos).
- Extraí os helpers comuns das telas de `pages/dashboard.ts` para `src/renderer/comum.ts`.
- A pedido do usuário, commits feitos como `LuisMagrin` e divididos por tela (10 commits) e enviados por essa conta.
