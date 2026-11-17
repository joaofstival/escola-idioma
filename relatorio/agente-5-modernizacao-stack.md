# Agente 5 — Modernização do stack e front final (Gabriel)

Branch `modernizar-stack`, 16–17/11/2026. Contrato REST/IPC (PLANO.md seção 4) preservado; regras de negócio e chamadas de API não mudaram.

## Plano 01 — Banco e backup
- `sql.js` trocado por `node:sqlite` (`6c4c8aa`).
- Migrations versionadas por `PRAGMA user_version`, cada uma em transação com rollback; cópia `pre-migracao-vN` antes de migration pendente; banco de versão futura é recusado sem alteração (`fa44c72`).
- Backup automático e manual via `VACUUM INTO` (retenção de 14 automáticos, rotina ao abrir e na virada do dia) e restauração em duas fases com validação (`d9cafd4`).
- Endurecimento após revisão: fixture do banco versionada, cópias via temporário + rename, `.restaurar` validado, exportar recusa o próprio banco (`c41ef62`).

## Plano 02 — Front em React
- Vite, React, Tailwind e shadcn; padrão visual em `docs/DESIGN.md` (fundo branco, índigo, Inter) (`92c2dbe`, `a3bd82a`, `4f9450c`).
- Telas portadas: idiomas, professores, alunos (`a2f34f6`); avaliações e painel (`24e9dc3`); financeiro, cotação e tradução (`c3ce7c3`); turmas, matrículas e materiais (`0c073e1`).
- Estados de carregando, vazio e erro; validação inline com zod; confirmação citando o nome do item.
- Correções da revisão independente (`0f0ca2a`): filtro de ano, placeholder de selects obrigatórios, destinos da rematrícula, ano inválido na URL, cotação antiga durante recarga.

## Plano 03 — Qualidade e testes de interface
- ESLint 9 (typescript-eslint, react-hooks, jsx-a11y), Prettier e CI (`aa7668e`, `e02fd8b`, `f288172`).
- Tela de configurações com backup: lista, "fazer agora", exportar e restaurar (`a5016b7`).
- Testes de interface com Vitest + Testing Library (`d796bb9`); PLANO.md e README atualizados (`05b41e7`).
- Correção bloqueante da revisão (`e2ad8d5`): "Todos os anos" em mensalidades voltava ao ano do resumo.

## Ajustes finais (17/11/2026)
- Cotação: valores entre R$ 0 e R$ 0,01 (peso argentino, guarani) apareciam como "R$ 0,00"; `dinheiro()` passa a mostrar até 4 casas nesses casos. Teste em `format.test.ts`.
- Conversor de valor: rótulos ligados aos campos e alinhamento dos três campos.
- Nova matrícula: aluno escolhido por busca (nome ou documento, sem acento, teclado) no lugar da lista simples. Componente `CampoBusca`, com testes.
