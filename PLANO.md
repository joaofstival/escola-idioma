# Plano — Sistema de Gestão de Escola de Idiomas

## 1. Entradas analisadas

1. **Requisitos** (texto do cliente): cadastros (alunos, professores, turmas com nível numérico), matrículas/rematrículas anuais, materiais didáticos por idioma+nível, tradutor de palavras, financeiro (mensalidades, pagamentos, atrasos, histórico), valor fixo de mensalidade por idioma, cotação de moedas para alunos estrangeiros.
2. **"Avaliação configurável.html"** (estudo de produto do endoo, Nov/2026). Não é um PDF: é um protótipo HTML que propõe trocar o formulário fixo "nota 1–10 + texto" por um **editor de perguntas configurável**. Pontos que adotamos:
   - Editor em **lista editada no lugar** (padrão Google Forms): cada pergunta é um card; clicar abre para editar, os demais ficam resumidos. Arrastar (ou setas ↑/↓) só para reordenar.
   - **5 tipos de pergunta**: resposta aberta (curta/longa, limite de caracteres), escolha única (com "pedir o porquê"), múltipla escolha (limite de escolhas, opção "Outro"), nota (estrelas/números; 1–5, 1–10, 0–10; rótulos nas pontas) e grade (vários itens na mesma escala).
   - Em qualquer pergunta: obrigatória/opcional, descrição de apoio, "conta na nota média", opções prontas (Excelente→Precisa melhorar, Concordo→Discordo, Sempre→Nunca, Sim/Não).
   - **Modelos prontos** + **prévia "Ver como participante"**.
   - **Regras**: 1–20 perguntas, até 10 opções, mínimo 2 opções nas escolhas, pelo menos 1 obrigatória; **trava na primeira resposta** (para mudar: duplicar); nota média = média de 0–10 das perguntas marcadas; "porquê" só aparece após a resposta que o pede.
   - **Modelo de dados**: perguntas em JSON na entidade-pai; respostas em tabela própria (uma linha por resposta: `question_id`, `row_id`, `option_id`, `value_text`, `value_number`, `reason`) para permitir contagem, média e exportação; validação no servidor com **422**.
   - **Aba Resultados**: contagem/percentual por opção, média das notas, respostas abertas.

   **Aplicação na escola**: o módulo **Avaliações** permite ao professor/coordenação montar avaliações por turma (avaliação de nível, feedback do aluno, autoavaliação), com exatamente esse editor, essas regras e essa visualização de resultados.

## 2. Arquitetura (Electron + TypeScript)

Atualizada em 17/11/2026 (modernização do stack: banco `node:sqlite`, migrations, front React). O contrato REST/IPC da seção 4 não mudou.

| Camada | Escolha | Motivo |
|---|---|---|
| App desktop | Electron 45, `contextIsolation`, `sandbox`, sem Node no renderer | segurança padrão |
| Linguagem | TypeScript 7 (strict, `erasableSyntaxOnly`), tipos compartilhados em `src/shared/types.ts` | contrato único main ↔ telas. O `typescript` 6 fica instalado só para o typescript-eslint (ainda sem suporte ao 7); o `tsc` 7 roda pelo alias `typescript7` |
| Build | esbuild para main e preload; **Vite** para o renderer (`scripts/build.mjs`) → `dist/` | rápido, sem config pesada |
| Banco | **`node:sqlite`** (embutido no Node 24 do Electron) em `userData/escola.db`, modo WAL | sem módulo nativo para recompilar; grava em disco a cada transação, sem regravar o arquivo inteiro (o sql.js perdia dado em queda) |
| Schema | **Migrations versionadas** em `src/main/migrations/` (a 001 é o schema original); antes de migrar o app copia o arquivo para `escola.db.pre-migracao` | evolução segura do banco do usuário |
| Backup | `VACUUM INTO` ao abrir o app e a cada dia de uso, últimas 14 em `userData/backups/`; backup manual, exportar e restaurar na tela Configurações | a restauração guarda o banco atual como `escola.db.pre-restauracao-<data>` |
| Comunicação | IPC `api:request` com **mini-roteador REST** no main (mesmos métodos/caminhos da seção 4), `file:save` para exportar CSV e IPC de backup | o contrato REST fica testável sem janela |
| Front | **React 19 + Tailwind v4 + shadcn/ui** (Radix), react-router (hash), react-hook-form + zod nos formulários, lucide, Inter local; padrão visual em `docs/DESIGN.md` | acessível, consistente, sem CDN (app offline) |
| Qualidade | ESLint 9 (typescript-eslint, react-hooks, jsx-a11y) + Prettier; CI em `.github/workflows/ci.yml` (Node 24) | regras valem para todo o código |
| Testes | `node --test` (backend e regras puras, banco em memória) e **Vitest + Testing Library** em jsdom (`npm run test:ui`, `window.escola` falso só na borda) | contrato testado no backend, comportamento das telas na interface |
| Integrações | Cotação: AwesomeAPI → fallback open.er-api; Tradução: MyMemory → fallback Google gtx → dicionário offline (ver `docs/pesquisa.md`) | definidas pelo agente |

```
escola-idioma/
  package.json  tsconfig*.json  vite.config.ts  vitest.config.ts  eslint.config.mjs  scripts/build.mjs
  src/shared/types.ts          (entidades, ApiRequest/ApiResponse, EscolaBridge, Avaliação, Backup)
  src/preload/preload.ts       (window.escola.request / saveFile / exportarBackup / restaurarBackup)
  src/main/
    main.ts                    (BrowserWindow, IPC, --seed, backup automático)
    db.ts  migrations/         (node:sqlite, migrations versionadas)
    backup.ts                  (VACUUM INTO, validação e restauração em duas fases)
    router.ts                  (roteador: method + path → handler; erros 404/422/500)
    seed.ts
    routes/*.ts                (um arquivo por recurso)
    services/*.ts              (cotacao, traducao, financeiro, avaliacao)
    **/*.test.ts               (node --test, banco em memória)
  src/renderer/
    index.html index.css main.tsx app.tsx (rotas)
    components/                (shell, estados, status-badge, filtro-select e ui/ do shadcn)
    pages/<tela>.tsx           (uma tela por arquivo; *.test.tsx = testes de interface)
    lib/ hooks/ test/          (formatação e regras de exibição, useQuery, falsos de teste)
  docs/DESIGN.md  docs/pesquisa.md   relatorio/
```

Comandos: `npm start` (build + abre o app), `npm run seed`, `npm test`, `npm run test:ui`, `npm run lint`, `npm run format:check`, `npm run typecheck`, `npm run build`.

## 3. Modelo de dados

- `idiomas(id, nome, codigo, mensalidade REAL)` — **valor fixo por idioma** (req. 4 e 6).
- `alunos(id, nome, data_nascimento, documento, email, telefone, endereco, pais_origem, moeda_origem DEFAULT 'BRL', ativo, criado_em)`
- `professores(id, nome, email, telefone, ativo)` + `professor_idiomas(professor_id, idioma_id)`
- `turmas(id, nome, idioma_id, nivel INTEGER ≥1, ano_letivo, professor_id, horario, capacidade)` — professor deve estar habilitado no idioma.
- `matriculas(id, aluno_id, turma_id, ano_letivo, tipo 'matricula'|'rematricula', status 'ativa'|'cancelada'|'concluida', data)` — único (aluno, turma, ano); capacidade respeitada.
- `materiais(id, titulo, tipo 'livro'|'apostila'|'audio'|'video'|'link'|'outro', idioma_id, nivel, autor, referencia, descricao)` — materiais da turma = mesmo idioma + nível.
- `mensalidades(id, matricula_id, aluno_id, competencia 'YYYY-MM', valor, vencimento 'YYYY-MM-DD', status 'pendente'|'paga'|'cancelada', data_pagamento, valor_pago, forma_pagamento)` — **atrasada** é calculada: pendente e vencimento < hoje.
- `avaliacoes(id, turma_id, titulo, descricao, form TEXT/JSON, criado_em)`
- `avaliacao_respostas(id, avaliacao_id, aluno_id, score REAL NULL, criado_em)` — único (avaliação, aluno).
- `avaliacao_resposta_itens(id, resposta_id, question_id, row_id, option_id, value_text, value_number, reason)` — índices em `resposta_id`, `question_id`.

## 4. Contrato da API (via IPC `api:request` com caminho sem prefixo, JSON, erros `{ "erro": "mensagem", "detalhes": [...] }`; validação = 422, não encontrado = 404)

| Recurso | Endpoints |
|---|---|
| Idiomas | `GET/POST /idiomas`, `GET/PUT/DELETE /idiomas/:id` |
| Alunos | `GET /alunos?busca=&ativo=`, `POST`, `GET/PUT/DELETE /alunos/:id`, `GET /alunos/:id/historico` → `{aluno, matriculas[], mensalidades[], resumo:{pago, pendente, atrasado}}` |
| Professores | `GET/POST /professores`, `GET/PUT/DELETE /professores/:id` (corpo inclui `idiomas: [id]`; resposta inclui `idiomas: [{id,nome}]`) |
| Turmas | `GET /turmas?ano=&idioma_id=&nivel=`, `POST`, `GET/PUT/DELETE /turmas/:id` (GET inclui `alunos[]`, `ocupacao`), `GET /turmas/:id/materiais` |
| Matrículas | `GET /matriculas?ano=&turma_id=&aluno_id=`, `POST /matriculas {aluno_id, turma_id, ano_letivo}` (gera mensalidades do restante do ano), `POST /matriculas/rematricula {aluno_id, turma_id_destino, ano_letivo}` (conclui a anterior), `PUT /matriculas/:id/cancelar` (cancela mensalidades futuras pendentes), `GET /matriculas/sugestoes-rematricula?ano=` (alunos do ano anterior com turma sugerida no nível +1) |
| Materiais | `GET /materiais?idioma_id=&nivel=&busca=`, `POST`, `GET/PUT/DELETE /materiais/:id` |
| Financeiro | `GET /mensalidades?status=pendente|paga|atrasada&aluno_id=&competencia=`, `POST /mensalidades/:id/pagar {valor_pago, forma_pagamento, data_pagamento}`, `POST /mensalidades/:id/estornar`, `GET /financeiro/resumo?ano=` → `{recebido, a_receber, em_atraso, alunos_inadimplentes[], por_mes[]}`, `GET /financeiro/inadimplentes` |
| Cotação | `GET /cotacao?moedas=USD,EUR` → `{base:'BRL', data, cotacoes:{USD: {valor_em_brl, ...}}}`, `GET /cotacao/converter?valor=&de=BRL&para=USD` |
| Tradução | `GET /traducao?texto=&de=pt&para=en` → `{texto, traducao, de, para, fonte}` |
| Avaliações | `GET /avaliacoes?turma_id=`, `POST`, `GET/PUT/DELETE /avaliacoes/:id` (PUT de `form` com respostas → 422 "travada"), `POST /avaliacoes/:id/duplicar`, `GET /avaliacoes/modelos`, `POST /avaliacoes/:id/respostas {aluno_id, answers:[{question_id,row_id?,option_id?,option_ids?,value_text?,value_number?,reason?}]}`, `GET /avaliacoes/:id/respostas`, `GET /avaliacoes/:id/resultados`, `GET /avaliacoes/:id/exportar` (CSV, uma coluna por pergunta e por porquê) |
| Painel | `GET /dashboard` → totais de alunos ativos, turmas do ano, receita do mês, inadimplentes |

Formato `form` (JSON):
```json
{ "questions": [ { "id": "q1", "type": "open|single|multiple|rating|grid", "title": "...", "description": "",
  "required": true, "countsInScore": false, "askReason": false, "reasonOn": ["o2"],
  "length": "short|long", "maxChars": null,
  "options": [{"id":"o1","label":"Excelente","points":10}], "allowOther": false, "maxChoices": null,
  "scale": {"style":"stars|numbers","min":1,"max":5,"minLabel":"","maxLabel":""},
  "rows": [{"id":"r1","label":"Comunicação"}] } ] }
```

## 5. Divisão de trabalho entre agentes

| # | Agente | Entregas | Arquivos de que é dono |
|---|---|---|---|
| 0 | **Orquestrador** (sessão principal) | plano, contrato da API, configuração (package/tsconfig/build), tipos compartilhados, preload e esqueleto do renderer, integração final, testes ponta a ponta, PDF | `PLANO.md`, esqueleto, `relatorio/` |
| 1 | **Pesquisa** | APIs de cotação e tradução (sem chave, CORS, limites, formato de resposta, *fallback*), convenções de níveis (QECR A1–C2 ↔ nível numérico), regras financeiras usuais (vencimento, multa/juros), resumo do HTML de avaliação | `docs/pesquisa.md` |
| 2 | **Backend (processo main)** | schema, seed, roteador e todas as rotas do contrato, serviços de cotação/tradução com cache e *fallback*, serviço de avaliação (validação, score, resultados, CSV), janela Electron e IPC, testes `node --test` | `src/main/**` |
| 3 | **Frontend — Acadêmico** | Painel, Idiomas, Alunos (+ histórico), Professores, Turmas, Matrículas/Rematrículas, Materiais | `src/renderer/pages/{dashboard,idiomas,alunos,professores,turmas,matriculas,materiais}.ts` |
| 4 | **Frontend — Financeiro e Ferramentas** | Financeiro (mensalidades, pagar, atrasos, resumo), Cotação/conversor (inclui mensalidade na moeda do aluno), Tradutor, **Avaliações configuráveis** (editor, modelos, prévia, preenchimento, resultados, trava, duplicar, exportar) | `src/renderer/pages/{financeiro,cotacao,traducao,avaliacoes}.ts` e `src/renderer/avaliacoes.css` |

Ordem: 0 (plano + esqueleto) → 1 (pesquisa) → 2, 3 e 4 em paralelo (todos seguem o contrato da seção 4) → 0 integra, testa e gera o PDF.

## 6. Critérios de aceite

- `npm install && npm start` abre o app desktop; na primeira execução o banco é criado com dados de exemplo.
- `npm run typecheck` sem erros.
- Todos os endpoints da seção 4 respondem; `npm test` passa.
- Matricular gera mensalidades com o valor do idioma; pagamento e atraso refletem no financeiro e no histórico do aluno.
- Professor só pode ser alocado em turma de idioma em que é habilitado; turma não ultrapassa capacidade.
- Avaliação: regras de limite, trava, porquê, nota média e resultados conforme o estudo.
- Cotação e tradução funcionam online e degradam com mensagem clara quando a API externa falha.

## 7. Entrega em 8 partes (1 commit por parte; pausa a cada 2 para push)

| Parte | Conteúdo | Responsável |
|---|---|---|
| 1/8 | Plano, pesquisa (`docs/pesquisa.md`), configuração Electron+TS, tipos compartilhados, preload, esqueleto do renderer | Orquestrador + Agente de Pesquisa |
| 2/8 | Backend núcleo: `db.ts` (sql.js), roteador, `main.ts` (janela + IPC), seed; CRUD de idiomas, alunos, professores e turmas; testes | Agente Backend |
| 3/8 | Backend acadêmico/financeiro: matrículas e rematrículas, materiais, mensalidades, pagamentos, atrasos, resumo, histórico do aluno, painel | Agente Backend |
| 4/8 | Backend integrações e avaliações: cotação, tradução, avaliações configuráveis (validação, trava, score, resultados, CSV) | Agente Backend |
| 5/8 | Telas: Painel, Idiomas, Alunos (+histórico), Professores, Turmas | Agente Frontend Acadêmico |
| 6/8 | Telas: Matrículas/Rematrículas, Materiais, Financeiro | Agentes Frontend |
| 7/8 | Telas: Cotação, Tradutor, Avaliações (editor, modelos, prévia, preenchimento, resultados) | Agente Frontend Financeiro e Ferramentas |
| 8/8 | Integração, testes ponta a ponta, README e PDF com o que cada agente fez | Orquestrador |

## 8. Complemento: correção estrutural e preparação para entrega

**Data:** 24/11/2026. **Situação:** planejamento; as correções abaixo ainda não foram implementadas.

Este complemento parte da revisão do código, da execução do aplicativo com banco temporário e dos requisitos do PDF da disciplina DAD. Preserva as seções 1–7 como histórico e detalha a próxima etapa do projeto. Em caso de conflito, as decisões deste complemento orientam a implementação futura. Descrições históricas de sql.js, frontend anterior e propriedade de arquivos por agentes não representam a arquitetura atual nem restringem a manutenção. O aplicativo cliente continuará em Electron, TypeScript e React. A implantação local com SQLite descreve o estágio anterior; a seção 11 passa a definir a arquitetura de destino com serviço central pela internet e dados protegidos no servidor.

O objetivo é corrigir integridade financeira, recuperação de dados, segurança, organização em classes, cobertura funcional e experiência de uso, sem reescrever a aplicação inteira. Por solicitação posterior do usuário, as áreas autenticadas de aluno e professor, o acompanhamento acadêmico e o acesso de casa passam a integrar o escopo na seção 11. Certificados, RAG e MCP continuam fora do escopo inicial.

### 8.1. Evidências e prioridades

| ID | Prioridade | Problema identificado | Resultado esperado |
|---|---|---|---|
| COR-01 | P0 | Mensalidade de R$ 300 aceita pagamento de R$ 1 e fica paga | Saldo correto; quitação somente quando o débito estiver liquidado |
| COR-02 | P0 | Backup automático falha com EPERM/fsync no Windows | Backup, exportação e recuperação funcionando no sistema de entrega |
| COR-03 | P0 | Validador aceita banco com nomes de tabelas corretos e colunas incompatíveis | Arquivo incompatível recusado antes da troca do banco |
| COR-04 | P1 | Estorno remove valor, data e forma do pagamento anterior | Histórico financeiro preservado em movimentações |
| COR-05 | P1 | Operações sem identidade, permissões e trilha de auditoria | Operador identificado e ações críticas autorizadas no main |
| COR-06 | P1 | Lógica de negócio predominantemente funcional dentro de rotas | Serviços de domínio em classes, separados do transporte e do SQL |
| COR-07 | P1 | CRUD incompleto nas telas e em entidades transacionais | Matriz explícita de operações, com correção e exclusão seguras |
| COR-08 | P1 | Quatro provedores não demonstram quatro finalidades distintas de API | Quatro fluxos úteis, demonstráveis e documentados |
| COR-09 | P1 | Valores REAL e regras financeiras repetidas no frontend | Dinheiro em centavos e uma fonte de regras |
| COR-10 | P1 | CI só Linux; testes de backup/migração falham no Windows | Verificação em Windows e Linux, incluindo recuperação |
| COR-11 | P2 | Vencimento e encargos fixos; configurações limitadas a backups | Parâmetros persistidos, versionados e com efeito explicado |
| COR-12 | P2 | Cache de cotação só em memória e atualização pouco clara | Última consulta persistida, com validade, origem e estado offline |
| COR-13 | P2 | Listas sem paginação; seletores e horários pouco estruturados | Busca, paginação e agenda com validação de conflitos |
| COR-14 | P2 | Caixa e competência apresentados sem distinção suficiente | Relatórios reconciliáveis com filtros e rótulos explícitos |
| COR-15 | P2 | Prévia de avaliação usa dados salvos; falta proteção de edição | Prévia do rascunho e aviso antes de descartar alterações |
| COR-16 | P2 | Taxas pequenas aparecem como zero; mensagens divergentes das regras | Formatação adequada e textos consistentes com o comportamento |
| COR-17 | P2 | Documentação histórica e distribuição incompletas | Documentação atual, instalador Windows e roteiro de entrega |

P0 = integridade e recuperação; P1 = segurança e requisitos acadêmicos; P2 = conclusão funcional, operação e apresentação. Prioridades definem a ordem, não dispensam a conclusão dos itens P2 previstos neste complemento.

Referência da revisão: backend com 126 testes, 107 aprovados e 19 falhas; falhas concentradas em arquivos, backups e migrações. Typecheck aprovado; lint sem erros e com três avisos. O aplicativo abriu com banco temporário e reproduziu a falha de backup fora do sandbox. Os testes de interface haviam apresentado 19 aprovações na análise anterior; deverão ser executados novamente na implementação. Essas contagens são uma fotografia da revisão, não critérios fixos para a entrega.

### 8.2. Regras para executar a correção

1. Trabalhar sobre cópia controlada e confirmar o repositório/branch antes de editar: o comando git status na pasta transferida retornou que não estava em uma work tree. Diagnosticar a configuração Git sem apagar .git, reinicializar o histórico ou sobrescrever mudanças existentes.
2. Usar banco temporário para testes e capturas. Não executar seed destrutivo no banco do usuário.
3. Antes de migrações com dados reais, produzir cópia consistente e verificar sua reabertura. Se não for possível garantir recuperação, não iniciar a migração.
4. Não editar a migration 001 já existente. Criar migrations sequenciais e testar tanto banco novo quanto atualização de banco antigo.
5. Manter os contratos atuais durante a transição por adaptadores, acrescentando campos sem quebrar telas. Registrar alterações incompatíveis e atualizar tipos, preload, rotas, testes e documentação juntos.
6. Fazer commits pequenos por entrega verificável. Autores devem refletir participação real; não fabricar contribuição ou atribuição. Publicação e push não fazem parte desta alteração de planejamento.
7. Cobrir regras com testes de comportamento e regressão, sem criar testes apenas para copiar a implementação.

### 8.3. Arquitetura de destino

A organização abaixo descreve a transição do código atual. A seção 13 consolida o padrão arquitetural de destino e prevalece sobre os caminhos provisórios citados nesta seção e nas etapas anteriores.

Fluxo de transição local: **tela React → bridge/preload tipado → controlador/rota IPC → serviço de aplicação/domínio → repositório SQLite ou integração externa**. Para o uso pela internet confirmado pelo usuário, o destino é **cliente Electron → HTTPS → API central autenticada → serviços de domínio → banco e armazenamento privados no servidor**, conforme seção 11. O main local não é autoridade para permissões sobre dados centrais.

| Camada proposta | Responsabilidade |
|---|---|
| src/shared/ | DTOs, contratos, códigos de erro, permissões e funções puras de dinheiro/data compartilháveis |
| src/main/domain/ | Classes e invariantes do domínio: mensalidade, pagamento, matrícula e políticas |
| src/main/application/ | Casos de uso em classes: matricular, rematricular, pagar, estornar, restaurar e responder avaliação |
| src/main/repositories/ | Consultas e persistência SQLite; nenhuma regra de autorização na tela |
| src/main/services/ | Integrações e serviços técnicos: cotação, tradução, backup, autenticação e auditoria |
| src/main/routes/ | Adaptadores finos: interpretar entrada, obter sessão, chamar caso de uso e devolver resposta |
| src/main/migrations/ | Evolução versionada do schema e transformações de dados |
| src/renderer/ | Estado visual, formulários e navegação; sem SQL e sem decisão financeira autoritativa |

Nomes são uma direção de organização, não exigência de criar todas as pastas ou uma classe para cada função. Adotar classes com responsabilidade real, como ServicoMatricula, ServicoFinanceiro, ServicoAvaliacao, ServicoBackup e ServicoAutorizacao, com dependências injetadas para banco, relógio, sessão e APIs. React permanece com componentes funcionais. Utilitários puros podem continuar como funções.

O contrato no shared não deve importar Electron, SQLite ou módulos exclusivos do main. A refatoração será feita por fluxo, com testes antes e depois; não haverá movimentação em massa sem validação.

### 8.4. Plano de dados e compatibilidade

Distribuir as alterações abaixo em migrations incrementais após inventariar o schema em uso. Cada migration deve ter pré-condições, estratégia de recuperação e teste com a fixture antiga.

- **Dinheiro:** substituir valores monetários operacionais por INTEGER em centavos; taxas cambiais mantêm precisão própria. Converter valores legados com arredondamento explícito, limites e conciliação de totais por aluno e competência. Rejeitar números não finitos e valores fora de faixa.
- **Movimentações:** criar pagamentos, estornos e ajustes vinculados à mensalidade e ao operador. Preservar valor, data, forma, motivo e referência ao lançamento original. Estorno é um lançamento compensatório; não apaga o pagamento.
- **Dados legados:** mensalidades pagas geram movimentações de origem legada. Não inventar operador, descontos ou estornos passados. Diferenças entre valor devido e pago entram em relatório de conciliação; casos antigos não são reclassificados silenciosamente.
- **Identidade:** usuários, perfis/permissões e auditoria. O usuário inicial é criado em configuração guiada, sem senha padrão. Eventos anteriores podem ter ator legado/desconhecido explicitamente identificado.
- **Configurações:** parâmetros financeiros versionados, vigência e parâmetros efetivamente usados nas cobranças. Não recalcular obrigações antigas ao alterar uma configuração atual.
- **Cache:** cotações por moeda, valor preciso, fonte, data da fonte e data da consulta; cache de tradução separado, com validade e limite de crescimento.
- **Agenda/endereço:** horários estruturados por turma e campos de endereço suficientes para consulta opcional de CEP e calendário local. Preservar o texto antigo como referência até a conversão explícita.

Critérios: mesmos registros de negócio após atualização, totais reconciliados, FKs íntegras, nenhuma duplicação de cobrança, falha transacional sem atualização parcial e recusa de banco de versão futura. Recuperação não significa sobrescrever automaticamente um banco mais novo com uma versão anterior.

## 9. Etapas de implementação e critérios de aceite

### Etapa A — Recuperação e compatibilidade Windows (COR-02, COR-03, COR-10)

**Escopo:** arquivos.ts, backup.ts, db.ts, migrations, contratos de backup, tela de configurações e CI.

- Corrigir abertura/sincronização de arquivos conforme suporte da plataforma. Não simplesmente ignorar toda exceção de fsync nem declarar sucesso sem garantir a cópia.
- Tratar separadamente falha antes da troca, falha após rename e estado de recuperação pendente; registrar estado suficiente para retomar sem banco vazio ou troca ambígua.
- Validar versão, tabelas, colunas, tipos/estrutura esperada, vínculos e consultas mínimas. Recusar estruturas adicionais executáveis não esperadas, como triggers desconhecidos, conforme política de compatibilidade. Validar a cópia final que será instalada.
- Preservar dados em WAL, fechar conexões corretamente e proteger o banco vivo contra exportação sobre si mesmo, considerando caminhos equivalentes e diferenças de caixa no Windows.
- Expor na interface última tentativa, último sucesso e erro do backup automático. Diferenciar ausência de backup de falha na criação. Mostrar aviso persistente até regularização.
- Executar CI em Windows e Linux. Adicionar teste de abertura e backup no Electron empacotado, além dos testes Node.

**Aceite:** os 19 cenários que falharam na revisão deixam de falhar sem remoção ou skip injustificado; banco com nomes de tabelas corretos e colunas erradas é recusado; backup pode ser reaberto e consultado; simulação de interrupção não perde o banco atual; falha aparece na tela; testes nunca usam banco real.

### Etapa B — Serviços de domínio e contrato tipado (COR-06, COR-09)

**Dependência:** A para migrações em arquivo. A extração de classes pode começar em memória enquanto A é concluída.

- Extrair matrículas, financeiro e avaliações das rotas para serviços em classes; encapsular SQL em repositórios.
- Definir unidade transacional por caso de uso. Alteração de matrícula e geração/cancelamento de mensalidades devem ser atômicas.
- Centralizar política de encargos e operações de centavos. Frontend pode apresentar simulações compartilhadas ou solicitadas ao main, mas o main recalcula na gravação.
- Injetar relógio, rede e repositórios. Remover dependência de estado global mutável nos fluxos refatorados.
- Definir DTOs de entrada/saída e erros de domínio, com mensagens úteis sem expor SQL, caminhos sensíveis ou stack traces ao usuário.

**Aceite:** rotas não contêm a regra central dos casos de uso; classes podem ser exercitadas sem janela; contratos antigos continuam funcionando durante a transição; a mesma data/valor gera o mesmo cálculo na sugestão e na gravação.

### Etapa C — Identidade, autorização e auditoria (COR-05)

**Dependência:** B para os casos de uso e A para recuperação segura. Decisão atualizada pelo usuário: contas individuais de aluno, professor e administrador, com acesso também de casa pela internet. Secretaria e financeiro são permissões administrativas adicionais. A seção 11 detalha escopos, autenticação central e isolamento dos dados.

- Criar configuração inicial do administrador, login/logout e bloqueio de sessão. Senhas com derivação resistente, salt individual e parâmetros documentados; nunca em texto puro ou logs.
- Perfis iniciais: aluno, professor, administração, secretaria e financeiro, com permissões por ação e vínculo com aluno/turma. Restringir também as leituras: docente não recebe dados financeiros completos ou dados de turmas fora de sua atribuição.
- No estágio local, verificar sessão e autorização no main em cada operação; na arquitetura central, essa verificação é obrigatória na API do servidor. Incluir backup/exportação, restauração, desconto, ajuste, exclusão e estorno. Não confiar em usuário/perfil enviados pelo renderer.
- Obter o ator da sessão e gravar auditoria na mesma transação da ação quando aplicável. Para backup/restauração, manter também registro operacional externo ao banco que será substituído, sem registrar senhas ou dados pessoais desnecessários.
- Validar origem exata da página IPC e frame principal; manter isolamento, sandbox e navegação restrita. Permissões de arquivo do sistema operacional continuam necessárias, pois login da aplicação não impede leitura direta de um SQLite copiado.
- Documentar ameaça de perda/compartilhamento de arquivos e política de proteção do banco/backups. Definir se o ambiente requer criptografia em repouso; se adotada, prever gestão de chaves e recuperação fora do próprio arquivo. Não afirmar proteção criptográfica antes de implementá-la.
- Exigir reautenticação para restauração e ações administrativas sensíveis; proteger contra tentativas repetidas sem bloquear permanentemente o único administrador.

**Aceite:** chamada direta ao bridge sem sessão/permissão é negada; sessão não pode ser forjada pelo corpo da requisição; nenhuma senha aparece em arquivos/logs; operações críticas têm ator e motivo; exclusões não removem referências históricas de operadores; instruções de recuperação administrativa são testadas.

### Etapa D — Integridade financeira e relatórios (COR-01, COR-04, COR-09, COR-14)

**Dependência:** B e migrations de movimentações; C antes de liberar permissões em produção.

- Como contenção imediata de COR-01, rejeitar pagamentos divergentes do valor exigível enquanto o modelo de saldo não estiver pronto. Não liberar essa contenção isoladamente sem tratar eventual quitação por desconto de modo explícito.
- Implementar pagamentos parciais: valor devido menos pagamentos válidos e ajustes autorizados. Status paga somente com saldo zero; parcial deve ser visível e continuar sujeito às regras de inadimplência definidas.
- Definir e documentar cálculo de encargos sobre saldo em aberto, tratamento das datas de pagamentos parciais e ordem de abatimento. Cobrir essas regras com exemplos antes de codificar.
- Representar desconto/isenção e pagamento excedente por operações próprias. Desconto exige permissão e justificativa; excedente é recusado até existir política de crédito explícita. Não transformar diferença em desconto silencioso.
- Estornar com referência ao pagamento original, motivo obrigatório e proteção contra repetição. Preservar todo o histórico e exigir transação para saldo, movimentação e auditoria.
- Validar forma de pagamento por enum, datas válidas e não futuras e limites de valores. Acrescentar identificador de operação para evitar duplicidade por clique repetido ou reenvio IPC.
- Separar relatórios por caixa (data da movimentação) e competência (mês da cobrança); explicar o período de inadimplência em cada indicador. Disponibilizar conciliação e comprovante de pagamento sem confundir comprovante interno com documento fiscal.

**Aceite:** pagamento de R$ 1 em débito de R$ 300 não quita a parcela; saldo e relatórios mantêm R$ 299 antes dos encargos aplicáveis; estorno reabre o saldo e preserva lançamento original; reenvio não duplica recebimento; pagamento de competência antiga no mês atual aparece corretamente nas duas visões; centavos fecham em todos os totais.

### Etapa E — CRUD e continuidade acadêmica (COR-07, COR-13)

**Dependência:** B; C para autorização; D para alterações com impacto financeiro.

Criar matriz por entidade com criação, consulta, alteração/correção e exclusão/cancelamento, distinguindo entidades de negócio, tabelas de associação e registros históricos.

| Recurso | Completar ou tornar explícito |
|---|---|
| Alunos e professores | Expor exclusão de cadastro sem dependentes; manter inativação para registros com histórico; justificar diferença na interface |
| Idiomas e materiais | CRUD acessível e validação de vínculos; valor alterado afeta novas cobranças conforme vigência |
| Turmas | CRUD, capacidade, habilitação docente, horários estruturados e validação de conflitos |
| Matrículas | Corrigir dados permitidos; transferir turma com política explícita de vagas/cobranças; cancelar sem apagar histórico |
| Mensalidades | Criação excepcional, correção de vencimento/valor por ajuste auditado e cancelamento autorizado; evitar cobrança duplicada por competência |
| Avaliações | CRUD antes das respostas; metadados editáveis quando permitido; perguntas versionadas por duplicação após respostas |
| Respostas | Consulta e correção/invalidação autorizada com motivo e versões; recalcular resultados sem perder a autoria do lançamento |
| Pagamentos e auditoria | Movimentações históricas não são apagadas; correção por estorno/compensação e auditoria preservada |

O PDF pede CRUD para todas as entidades. Cancelamento/inativação não deve ser apresentado automaticamente como equivalente a DELETE: documentar as restrições e validar com o professor os recursos históricos que não admitem exclusão física. Se for exigida exclusão lógica, implementar essa operação de forma explícita e testável, preservando rastreabilidade. Não introduzir exclusão destrutiva apenas para demonstrar um botão.

- Detectar conflitos de professor e aluno com dias/horários estruturados; mostrar a turma conflitante. Registrar exceção justificada quando prevista, sem deixar conflito silencioso.
- Rematrícula mantém o vínculo anterior e aplica a política de saldo atualizada; progressão sugerida não equivale a aprovação automática.
- Paginar e ordenar no backend; filtros e total devem considerar o mesmo conjunto. Seletores de alunos/turmas com busca e carregamento incremental.

**Aceite:** roteiro de CRUD demonstrável por recurso; exclusão com dependentes é recusada com alternativa; transferência não duplica cobranças; alteração de horário detecta conflito; paginação não perde filtros; desempenho verificado com milhares de alunos e lançamentos.

### Etapa F — Configurações e integrações úteis (COR-08, COR-11, COR-12)

**Dependência:** B, C, D e agenda da etapa E para o quarto fluxo abaixo.

- Persistir dia de vencimento, prazo inicial, multa e juros, com vigência e validação. Mostrar quais mudanças afetam apenas cobranças novas e quais dependem de ajuste autorizado.
- Persistir cotações entre sessões, mantendo fonte e datas. Cache vencido não é cotação atual: mostrar alerta, idade e limite de uso. Sem dado válido, informar indisponibilidade sem inventar taxa.
- Distinguir atualizar a tela de forçar nova consulta; política de atualização deve respeitar cache e limites do provedor, com mensagem ao operador.
- Isolar cada provedor em adaptador com timeout, validação de resposta e tratamento de erros. Registrar origem e evitar envio de dados pessoais além do necessário.
- Manter o fallback de tradução, deixando claro que o dicionário offline cobre apenas parte do vocabulário. Identificar a fonte da tradução e limitar textos.

**Quatro situações propostas para eliminar a ambiguidade acadêmica:**

| Situação | Uso real no fluxo | Contingência |
|---|---|---|
| Tradução | Consultar palavras/frases em ferramenta de apoio ao idioma | Dicionário limitado e aviso de indisponibilidade |
| Cotação/conversão | Exibir mensalidades na moeda do aluno estrangeiro | Cache persistente com data/validade |
| Consulta de endereço por CEP | Preencher endereço brasileiro no cadastro sem digitação repetida | Cadastro manual, inclusive endereços estrangeiros; enviar somente o CEP |
| Consulta de calendário de feriados | Apoiar planejamento e alertas de aulas nas datas da agenda | Calendário manual/cache; indicar abrangência nacional/estadual/municipal disponível |

CEP e calendário são acréscimos propostos para cumprir finalidades distintas sem contar provedores alternativos como situações adicionais. Selecionar os provedores durante a implementação após verificar documentação primária, disponibilidade, cobertura, termos e limites; não assumir que uma API fornece feriados locais completos. Feriado consultado não cancela aula automaticamente. Se o professor aceitar quatro fluxos de API própria já existentes, registrar esse entendimento antes de substituir esses acréscimos por uma alternativa menor.

**Aceite:** quatro fluxos com propósito, entrada, resposta, erro e demonstração; nenhum fluxo existe apenas como chamada escondida para contar requisito; endereço manual e cadastros continuam funcionando offline; cotação sobrevive ao reinício; configurações não alteram parcelas históricas sem comando explícito.

### Etapa G — Avaliações, visual e usabilidade (COR-15, COR-16 e apresentação de COR-02/13/14)

**Dependência:** contratos estabilizados de C–F. Manter a identidade visual de docs/DESIGN.md; não exigir redesign completo.

- Compartilhar estado do rascunho entre editor e prévia. Avisar antes de sair, trocar de aba ou fechar descartando alterações; oferecer salvar, descartar ou continuar editando. Rascunho não altera avaliação travada.
- Distinguir resposta lançada por operador de resposta autenticada do participante. Registrar ator; não prometer autoria do aluno sem fluxo de autenticação próprio.
- Corrigir casas decimais de taxas: valores pequenos nunca devem parecer zero quando não são. Manter dinheiro, taxa e quantidades como formatos diferentes.
- Atualizar resultado do conversor ao mudar parâmetros ou marcar explicitamente o resultado anterior como desatualizado; interpretar valores pt-BR de maneira consistente.
- Exibir saúde dos backups e indicadores acionáveis no painel, com links para regularização, rematrículas e recuperação.
- Revisar textos sobre meses gerados, cache offline, vencimento, atraso e períodos dos indicadores. Remover linguagem histórica do produto, como referência a formulário antigo.
- Dar nome e conteúdo coerentes a Configurações: parâmetros da escola/financeiro, operadores autorizados e backups, separados por seções.
- Padronizar tabelas, ações, estados de erro/vazio/carregamento e filtros. Manter feedback persistente para erros críticos, sem depender só de toast.
- Verificar teclado, foco em diálogos, rótulos associados aos campos, leitor de tela nos fluxos críticos, contraste e ampliação de texto. Validar 960 px, tamanho padrão, janela ampla e escala de exibição do Windows.

**Aceite:** prévia reproduz edição não salva sem gravá-la; saída não descarta silenciosamente; cotação pequena permanece legível; falha de backup tem ação visível; telas não cortam ações nos tamanhos suportados; teclado conclui cadastro, pagamento e confirmação; rótulos correspondem à regra do backend.

### Etapa H — Entrega, documentação e regressão final (COR-10, COR-17)

**Dependência:** todas as anteriores.

- Preparar instalador Windows reproduzível, ícone, versão, execução sem Node instalado e persistência em diretório de dados próprio. Atualização não pode apagar banco/backups.
- Separar configuração de desenvolvimento, teste e produção; distribuição real inicia por configuração guiada, sem misturar alunos fictícios com dados da escola. Seed fica explícito em demonstração/desenvolvimento.
- Atualizar README com Windows/PowerShell, localização dos dados por plataforma, instalação, backup/restauração, recuperação administrativa e limitações offline.
- Atualizar arquitetura, contratos, diagrama entidade-relacionamento, matriz de permissões, matriz CRUD e decisões de segurança. Marcar registros antigos como históricos.
- Criar roteiro de demonstração dos seis requisitos do PDF, quatro situações de API e fluxos acadêmico/financeiro. Explicar as decisões de classes com exemplos do próprio código.
- Conferir no GitHub acesso do colaborador exigido e participação real dos integrantes pelo histórico; relatos antigos de convite não substituem essa conferência. Manter commits por etapa e autores verdadeiros.
- Executar lint, format:check, typecheck, backend, interface e build; resolver ou justificar avisos. Fazer teste completo no aplicativo instalado e em Windows/Linux conforme suporte declarado.

**Aceite:** instalação em ambiente Windows sem ferramentas de desenvolvimento; criar cadastro, matrícula, pagamento parcial, quitação, estorno, rematrícula, avaliação, exportação e restauração em banco temporário; quatro integrações demonstradas com falhas controladas; nenhuma regressão conhecida P0/P1 aberta.

## 10. Sequência, rastreabilidade e conclusão

Sequência principal: **A → B → C → D → E → F → G → H**. A contenção de pagamento insuficiente deve entrar cedo; a auditoria completa fica disponível antes de liberar novos ajustes financeiros. Contratos e testes podem ser preparados durante a etapa anterior, mas nenhuma etapa é considerada pronta apenas por ter tela ou classe criada.

Cada entrega registra: IDs COR atendidos, mudança de comportamento, migration aplicada, impacto nos contratos, testes executados, evidência visual quando cabível e riscos remanescentes. Não considerar uma falha resolvida porque o teste foi removido, o erro foi silenciado ou a função deixou de ser chamada.

### 10.1. Matriz de regressão mínima

| Área | Cenários obrigatórios |
|---|---|
| Persistência | Banco novo/legado, migração repetida, rollback, versão futura, valores monetários conciliados |
| Backup | Arquivo válido/incompatível/corrompido, WAL, disco/permissão, interrupção, restauração e aviso na interface |
| Financeiro | Integral/parcial, desconto autorizado/negado, excedente, centavos, data inválida, duplicidade e estorno repetido |
| Segurança | Sem sessão, sem permissão, leitura restrita, origem IPC inválida, auditoria e recuperação administrativa |
| Acadêmico | Capacidade, professor habilitado, conflito de agenda, transferência e rematrícula com saldo |
| Avaliações | Limites, trava, rascunho, prévia, autoria, correção versionada e recálculo de resultados |
| Integrações | Resposta válida/inválida, timeout, offline após reinício, expiração, quatro finalidades e entrada manual |
| Interface | Filtros/paginação, estados, teclado, escala Windows, taxas pequenas e textos consistentes |
| Distribuição | Instalação limpa, atualização preservando dados, app instalado sem Node e documentação reproduzível |

### 10.2. Decisões a registrar na implementação

Este plano passa a incluir contas de aluno, professor e administração com serviço central pela internet, além de pagamentos parciais e quatro integrações por finalidade. Antes de consolidar as respectivas migrations, registrar a política de encargos sobre saldo parcial, permissões de desconto, proteção criptográfica conforme ambiente, exceções de agenda e interpretação acadêmica de CRUD/consumo de API. Essas decisões não impedem corrigir imediatamente backups, validação de schema, formatação das taxas e a quitação indevida.

### 10.3. Critério de conclusão

O complemento estará concluído quando todos os IDs COR-01 a COR-17 tiverem evidência de aceite, as exigências do PDF estiverem mapeadas para demonstrações reais, a suíte passar nos sistemas suportados e o aplicativo instalado preservar dados e histórico nos fluxos de erro. A conclusão do produto também depende dos critérios da seção 11, acrescentados por solicitação do usuário. Funcionalidades adicionais fora dessas seções exigem nova priorização.
## 11. Produto: escola presencial com acesso pela internet

**Definição confirmada pelo usuário em 24/11/2026:** alunos, professores e administração terão contas individuais. O ensino é presencial, mas materiais e acompanhamento poderão ser acessados de casa pela internet. Esta seção amplia o escopo e prevalece sobre decisões anteriores de banco somente local ou uso exclusivo por funcionários. Trata-se de planejamento, não de funcionalidade já implementada.

### 11.1. Proposta e limites do produto

O aplicativo será o ponto de apoio à rotina da escola: a administração organiza cadastros, contratos acadêmicos e cobranças; professores acompanham suas turmas e disponibilizam conteúdo; alunos consultam informações próprias e estudam com materiais autorizados. A aula presencial permanece o centro do curso.

O cliente Electron continua obrigatório para a entrega da disciplina e será instalável tanto nos computadores da escola quanto nos computadores pessoais. Uma versão web poderá reutilizar os contratos e parte da interface no futuro, mas não é necessária para concluir esta primeira versão. Acesso pelo navegador e por celular não será anunciado como disponível enquanto não houver interface web entregue e testada.

Não incluir nesta fase videoconferência, rede social, chat livre, correção automática por IA, reconhecimento facial, loja de cursos ou processamento de cartão. Esses recursos ampliariam custo e risco sem resolver a necessidade central.

### 11.2. Arquitetura para acesso de casa

```text
Electron na escola       Electron do professor       Electron do aluno em casa
        |                         |                           |
        +-------------------------+---------------------------+
                                  |
                    HTTPS + sessão individual
                                  |
                      API central em TypeScript
                      autenticação e autorização
                      casos de uso e auditoria
                                  |
                 +----------------+----------------+
                 |                                 |
        Banco relacional privado        Armazenamento privado de materiais
        contas, turmas e registros       arquivos, versões e anexos
```

- O servidor central é a autoridade para identidade, permissões, vínculo com turma, pagamentos e notas. O cliente só recebe o subconjunto de dados necessário para a tela autorizada.
- Nenhum cliente de aluno/professor recebe credenciais do banco, acesso SQL, segredo administrativo ou cópia completa do banco da escola. Ocultar menus não constitui proteção suficiente.
- O banco SQLite atual será fonte de migração. Planejar um banco relacional de servidor, com PostgreSQL como opção de referência, mantendo repositórios para evitar SQL espalhado. A escolha final de motor/hospedagem exige validar recursos, custo, operação e compatibilidade durante a implementação, sem contratar serviços nesta etapa.
- Não colocar o arquivo de banco vivo em pasta compartilhada, OneDrive ou outra sincronização de arquivos para simular múltiplos usuários. Código-fonte pode continuar na pasta do projeto; banco central e arquivos operacionais têm armazenamento próprio.
- Publicar somente a API necessária, por HTTPS. Banco, arquivos privados, rotinas de backup e ferramentas administrativas não ficam publicamente navegáveis. O renderer permanece isolado e acessa a API por um cliente tipado com ponte limitada quando necessário.
- Manter regras de negócio em classes no servidor; não duplicá-las como autoridade no Electron. Tipos compartilhados não devem carregar segredos nem dependências de servidor para o cliente.
- Operações concorrentes de matrícula, pagamento, chamada e publicação devem usar transações e controle de versão/idempotência. Dois computadores não podem ocupar a última vaga simultaneamente nem registrar o mesmo pagamento duas vezes.
- Primeira versão exige conexão para autenticação e operações. Sem internet, exibir indisponibilidade e permitir repetir sem duplicação; não simular sucesso nem abrir banco local com todos os dados. Download autorizado de um material pode ser lido offline após salvo pelo usuário.
- Não implementar sincronização offline de pagamentos, notas ou chamada nesta fase. Se futura, exigirá política de conflitos, proteção de cache e revogação; não basta enviar uma fila sem validar novamente no servidor.
- Entrega inclui migração ensaiada: exportar dados legados, importar preservando vínculos, reconciliar totais/arquivos, validar contas e habilitar o serviço central. Não manter bancos local e central gravando independentemente como se fossem uma única base.

### 11.3. Contas, login e ciclo de vida

1. A administração cadastra aluno/professor e cria ou vincula a conta à pessoa correta. Cadastro acadêmico e conta são entidades distintas; aluno sem conta ainda pode existir e ser atendido pela secretaria.
2. A conta é ativada por convite/código de uso único com expiração ou credencial temporária que exige troca inicial. Não usar senha coletiva por turma, senha padrão pública ou credenciais derivadas de documento/data de nascimento.
3. Login ocorre com identificador e senha; o servidor devolve apenas perfis e permissões atribuídos. A tela não oferece um seletor livre para virar administrador.
4. Recuperação de acesso usa token curto de uso único por canal verificado ou procedimento administrativo auditado. Nenhum funcionário consulta a senha atual de outra pessoa. Se houver envio por e-mail, configurar o serviço e tratar falhas antes de anunciar recuperação automática.
5. Sessões expiram, podem ser encerradas e são revogadas ao desativar conta, trocar senha ou mudar permissões. Evitar credenciais persistentes em texto puro no renderer; guardar credenciais de renovação em armazenamento protegido do sistema quando esse recurso existir.
6. Logout em computador compartilhado limpa a sessão e os dados sensíveis mantidos na interface/cache. Respostas da conta anterior não podem aparecer após outra pessoa entrar.
7. Não permitir que o usuário altere seu papel, aluno_id ou professor_id. Atualização de contato pode ser direta para campos de baixo risco; troca de e-mail de acesso exige verificação. Documento e dados acadêmicos são corrigidos pela secretaria.
8. Desativar conta não apaga matrícula, histórico ou autoria. Cancelamento/conclusão de matrícula modifica permissões de turma segundo política de acesso, sem apagar registros próprios históricos.
9. Não bloquear acesso pedagógico automaticamente por mensalidade atrasada. Financeiro e eventual impedimento de rematrícula seguem política explicitamente definida; o sistema não aplica sanção acadêmica por inferência.
10. Uma pessoa pode acumular perfis se a administração autorizar. O escopo resulta de atribuições explícitas; ser professor não torna alguém administrador.

**Perfis de partida:** aluno, professor e administrador. Secretaria, financeiro e coordenação são conjuntos adicionais de permissões, ativados conforme equipe; não é necessário criar cinco aplicativos distintos. Professor vê suas turmas, aluno vê seus vínculos e administrador recebe as funções administrativas autorizadas.

### 11.4. Matriz de acesso

| Informação/ação | Aluno | Professor | Administração e permissões adicionais |
|---|---|---|---|
| Dados pessoais | Próprios; alteração limitada | Próprios; dados mínimos dos alunos de suas turmas | Secretaria gerencia cadastros; acesso conforme função |
| Relação de alunos | Não acessa diretório nem dados de colegas | Somente turmas atribuídas e campos pedagógicos necessários | Secretaria/coordenação conforme permissão |
| Cadastro de aluno/professor/idioma | Não | Não | Administração/secretaria autorizada |
| Criar turma, matricular e rematricular | Pode solicitar atendimento, sem efetivar | Não | Secretaria autorizada |
| Materiais | Lista/lê/baixa os publicados para seus vínculos | Cria e publica conteúdo para suas turmas | Gerencia biblioteca comum, acesso, versões e arquivamento |
| Chamada | Consulta sua presença publicada | Registra/corrige chamada de aulas atribuídas, com histórico | Coordenação supervisiona e autoriza correções excepcionais |
| Notas | Somente próprias e publicadas | Lança/edita nas turmas atribuídas | Coordenação supervisiona; alterações ficam auditadas |
| Avaliação/feedback | Responde como si próprio quando público-alvo | Cria atividades/feedback dentro de seu escopo | Coordenação cria modelos e acompanha resultados permitidos |
| Resultados de avaliações | Próprios; sem respostas identificadas de colegas | Somente resultados autorizados das turmas atribuídas | Coordenação conforme finalidade e confidencialidade |
| Mensalidades e comprovantes | Próprios, somente consulta | Não acessa dívidas/situação financeira dos alunos | Financeiro e administrador autorizado |
| Registrar pagamento/estorno/desconto | Não | Não | Financeiro, com permissões específicas e motivo quando exigido |
| Avisos | Lê avisos destinados a si/turma | Publica avisos para suas turmas | Publica avisos institucionais e segmentados |
| Exportação | Documento próprio quando disponibilizado | Dados pedagógicos mínimos de turma autorizada | Exportações por finalidade e permissão |
| Contas, permissões, auditoria e restauração | Não | Não | Administrador com permissões específicas/reautenticação |

Negação é o padrão. A API verifica o recurso concreto: aluno autenticado não pode trocar /alunos/123 por /alunos/124; professor não pode acessar arquivo, nota ou chamada de outra turma alterando um ID. Filtrar também listas, totais, buscas, resultados e exportações. Permissão de consultar não implica editar ou exportar.

### 11.5. Área do aluno

**Tela inicial:** próxima aula, materiais recentes, avisos não lidos e atividades com prazo. Situação financeira fica em área própria, sem exposição em telas coletivas.

- **Minhas turmas:** idioma, nível, professor, horário, sala/local quando cadastrado e calendário das aulas. Histórico de turmas anteriores separado das matrículas ativas.
- **Meus materiais:** conteúdo publicado por turma/unidade, com título, descrição, tipo, professor, versão e data. Busca/filtro por turma; indicador novo e marcação pessoal de leitura, sem tratar download como prova de aprendizagem.
- **Minha agenda:** aulas presenciais, feriados informativos, reposições, avaliações e prazos. Cancelamento/reposição gera aviso com nova data/local.
- **Meu acompanhamento:** frequência e notas publicadas, devolutiva do professor e progresso no curso. Percentual de presença usa aulas efetivamente realizadas e política da escola, sem contabilizar aula cancelada como falta.
- **Atividades:** consultar orientação, enviar texto/arquivo quando habilitado e visualizar devolutiva. Resposta é vinculada à identidade da sessão; não escolhe outro aluno em um select.
- **Minhas mensalidades:** consultar valores, vencimentos, saldo e comprovantes próprios. Cotação é estimativa informativa; pagamento continua registrado em BRL. Não incluir pagamento online real nesta fase.
- **Solicitações:** pedir correção cadastral, justificativa de falta ou atendimento para rematrícula. Pedido não altera matrícula/financeiro automaticamente; secretaria analisa e responde.
- **Meu perfil e acesso:** contatos permitidos, senha e encerramento de sessão. Sem cadastro de colegas, materiais, professores, preços ou turmas.

### 11.6. Área do professor

**Tela inicial:** aulas do dia, chamadas pendentes, atividades aguardando devolutiva e avisos da coordenação.

- **Minhas turmas:** lista restrita aos vínculos atribuídos, alunos matriculados e histórico pedagógico necessário. Contatos sensíveis e dados financeiros não são enviados por conveniência.
- **Aulas e chamada:** registrar data, conteúdo ministrado e presença/falta/justificativa. Correções posteriores exigem motivo; mudanças fora do período permitido seguem coordenação. Não criar automaticamente presença em aulas futuras.
- **Materiais da turma:** publicar conteúdo complementar e selecionar material autorizado da biblioteca comum. O professor não altera um material global de outra autoria apenas por usá-lo em sua turma.
- **Atividades e notas:** criar atividade, prazo, rubrica/valor máximo, receber entregas e registrar devolutiva. Notas ficam em rascunho até publicação; correção após publicação preserva versão e motivo.
- **Progresso:** visualizar frequência, notas e dificuldades dos alunos da turma. Recomendar progressão de nível; matrícula/rematrícula continua sob responsabilidade administrativa.
- **Avisos de turma:** publicar orientações objetivas, mudanças aprovadas e lembretes. Sem chat livre ou envio de mensagem para qualquer aluno da escola nesta fase.
- **Perfil próprio:** alterar dados permitidos e senha; solicitar correções de habilitações/atribuições à coordenação.

### 11.7. Administração, secretaria e coordenação

- Painel com matrículas, vagas, rematrículas pendentes, chamadas não concluídas, solicitações, saúde do serviço e alertas de backup, cada item conforme permissão.
- Gestão de alunos, professores, idiomas, turmas e atribuições. Vínculo de professor com turma é diferente de habilitação para lecionar um idioma.
- Gestão de contas, ativação, bloqueio e recuperação, sem visualização de senhas. Manter pelo menos um administrador recuperável e impedir remover o próprio último acesso administrativo por acidente.
- Gestão de salas/locais e calendário; aprovar cancelamentos, reposições e exceções de agenda. Reposição deve ser ligada à aula original para não duplicar carga horária/frequência.
- Biblioteca comum por idioma/nível, materiais institucionais e política de publicação. Professor publica complementos apenas para turmas atribuídas; conteúdo institucional pode exigir coordenação.
- Financeiro conforme etapa D, com acesso separado da coordenação pedagógica. Inadimplência não aparece no diário do professor nem na lista dos colegas.
- Tratamento das solicitações e justificativas, com responsável, situação, resposta e histórico.
- Relatórios e exportações por finalidade; documentos de aluno contêm apenas o necessário. Trilhas de auditoria são restritas e não viram um diretório de dados pessoais.

### 11.8. Materiais didáticos: de catálogo para biblioteca utilizável

O modelo atual descreve materiais e links. Para cumprir a ideia de disponibilizar conteúdo em casa, acrescentar arquivos gerenciados e autorização de download.

- Separar material, versão/arquivo e publicação. A publicação define turmas/público, autor e período; idioma/nível organiza a biblioteca, mas não concede automaticamente acesso a todo aluno da escola.
- Tipos iniciais: PDF, imagem, áudio, vídeo por link e links de apoio. Limitar tamanho/cota; definir formatos permitidos e validar conteúdo/extensão no servidor. Upload não pode aceitar executável, caminho arbitrário ou nome que sobrescreva arquivo de outro usuário.
- Armazenar arquivos fora da raiz pública, com identificadores internos. Download exige sessão e vínculo; quando houver URL temporária, ela deve expirar e não tornar o arquivo público permanentemente.
- Estado do material: rascunho, publicado e arquivado. Aluno não vê rascunhos. Nova versão preserva autoria e referência da anterior; arquivar remove da oferta atual sem apagar vínculos históricos necessários.
- Acesso a materiais após conclusão/cancelamento tem política explícita por publicação. A instituição define prazo de acesso a materiais passados, sem alterar silenciosamente o histórico acadêmico do aluno.
- Mostrar autor, turma, formato, tamanho e data antes de baixar. Informar que uma cópia já baixada para o computador não pode ser remotamente recolhida pela aplicação.
- Publicar somente conteúdo que a escola tenha autorização para distribuir. Não incluir compartilhamento público indiscriminado de livros de terceiros.
- Backup cobre banco, objetos/arquivos e manifestos de versões; restaurar só o SQLite/SQL sem os materiais não é recuperação completa do produto.

### 11.9. Avaliação acadêmica e feedback são fluxos diferentes

O editor configurável existente continua útil para feedback e autoavaliação. Porém, média de respostas a perguntas de satisfação não equivale automaticamente a nota acadêmica ou aprovação.

- Classificar finalidade e público: atividade acadêmica, avaliação de nível, autoavaliação ou feedback sobre aulas/escola.
- Para nota acadêmica, definir escala, critérios/pesos, responsável pela correção, prazo e publicação. Perguntas abertas não recebem nota automática porque foram preenchidas.
- Para feedback, definir confidencialidade, público dos resultados e se há anonimato real. Não prometer anonimato usando o modelo atual que grava aluno_id; feedback anônimo só entra após desenho específico que impeça identificação e inferências por grupos pequenos.
- Aluno responde sua avaliação; professor registra nota/devolutiva no fluxo próprio. Lançamento por funcionário em nome de aluno é excepcional, autorizado, identificado e nunca indistinguível de envio autenticado.
- Alteração de perguntas após respostas continua por nova versão/duplicação. Edição de nota ou invalidação de resposta preserva versões, motivo e autoria.
- Aluno não vê respostas identificadas dos colegas nem feedback confidencial sobre si fornecido por outros. Professor acessa apenas resultados destinados ao seu papel; gestão da coordenação segue a finalidade definida.

### 11.10. Regras adicionais de segurança para internet

- Senhas são verificadas no servidor com hash apropriado, salt e parâmetros documentados. Credenciais de banco e chaves de serviços permanecem somente no servidor, fora do pacote Electron e do repositório.
- Sessões são limitadas, revogáveis e protegidas em trânsito. Aplicar limitação de tentativas e respostas de login/recuperação que não revelem gratuitamente se uma conta existe.
- Autorização por identidade e vínculo em todo endpoint, incluindo arquivos, notas, presença, busca, totais e exportação. Testar acesso cruzado com duas contas de aluno e dois professores.
- Não confiar em papel, proprietário ou IDs enviados pelo cliente. Publicação de nota, concessão de perfil e alteração de cobrança têm validação própria e auditoria.
- Logs não contêm senhas, tokens ou arquivos pessoais completos. Exceções retornam mensagem controlada; detalhes técnicos ficam em logs de acesso restrito.
- Operação administrativa pela rede não expõe caminho de arquivo do servidor ao usuário. Backup/restauração central exige permissão, reautenticação, manutenção coordenada e trilha externa protegida.
- Após restaurar backup central, invalidar sessões antigas e revisar estado de segurança/contas antes de reabrir o serviço. Restaurar dados antigos não deve reativar silenciosamente acesso revogado.
- Se houver interface web futura, revisar proteção de cookies, CSRF e demais fronteiras próprias do navegador. Configuração de CORS não substitui autenticação/autorização.
- Atualizações do cliente devem preservar segurança e dados; o servidor deve recusar contratos incompatíveis com mensagem de atualização, sem desativar validações para acomodar cliente antigo.

### 11.11. Modelo de dados e serviços complementares

Entidades propostas, a consolidar em migrations após B e antes da migração central:

| Grupo | Entidades/relações |
|---|---|
| Identidade | usuarios, papeis/permissoes, vínculos com aluno/professor, sessoes e ativação/recuperação |
| Acadêmico | aulas ligadas à turma, presencas ligadas a aula+matrícula, locais/salas e reposição da aula |
| Biblioteca | materiais existentes, material_versoes, arquivos e publicacoes por turma/público |
| Atividades | atividades ligadas à turma, entregas ligadas à matrícula, versões e devolutivas/notas publicadas |
| Comunicação | avisos com destinatários definidos, leituras individuais e solicitacoes com histórico |
| Financeiro/controle | movimentações da etapa D, configurações versionadas e auditoria |

Evitar duplicar o mesmo dado como nota em duas entidades sem fonte de verdade definida. Presença deve se referir à matrícula correta para respeitar transferências e datas de vínculo. Não abrir tabelas técnicas como cadastros indiscriminados só para cumprir CRUD.

Classes adicionais sugeridas: ServicoSessao, PoliticaAcesso, ServicoMaterial, ServicoAula, ServicoFrequencia, ServicoAtividade, ServicoPublicacaoNota, ServicoAviso e ServicoSolicitacao. Cada serviço usa repositórios e valida o contexto autenticado. Interface compartilhada não implica fornecer DTO administrativo completo ao aluno.

### 11.12. Plano incremental de produto

| ID | Entrega | Dependências e aceite principal |
|---|---|---|
| PROD-01 | Arquitetura central, contrato e migração ensaiada | B; serviço acessível por clientes separados; dados conciliados, banco não exposto |
| PROD-02 | Login de aluno/professor/admin e isolamento de dados | C ampliada + PROD-01; contas reais com vínculos; acesso cruzado negado no servidor |
| PROD-03 | Navegação e painel próprios por perfil | PROD-02; nenhum menu/resultado administrativo no aluno; logout limpa dados da sessão |
| PROD-04 | Biblioteca com arquivos e publicações por turma | PROD-02; aluno baixa só arquivo autorizado, rascunhos inacessíveis e versões preservadas |
| PROD-05 | Aulas, agenda, chamada e reposições | E + PROD-02; chamada restrita ao docente; frequência correta para vínculo e aulas realizadas |
| PROD-06 | Atividades, devolutivas e notas publicadas | PROD-04/05; aluno envia como si; nota em rascunho não é visível; correção auditada |
| PROD-07 | Mensalidades próprias, avisos e solicitações | D + PROD-02; financeiro de terceiros negado; pedidos não alteram cadastros automaticamente |
| PROD-08 | Operação pela internet e recuperação completa | A/H ampliadas; HTTPS, backup banco+arquivos, restauração ensaiada, sessões revogadas e instalador testado |

Prioridade de execução: resolver os P0 atuais e extrair contratos/classes; definir o serviço central antes de implementar extensivamente permissões apenas locais; entregar PROD-01/02/03 como primeiro fluxo vertical; biblioteca em seguida; agenda/chamada e atividades depois. PROD-07 pode avançar após estabilizar financeiro e autenticação. A etapa H passa a validar clientes e servidor, em vez de somente um desktop com banco local.

Não publicar um modo aluno apontando para o banco completo existente como solução provisória. Enquanto isolamento central não estiver pronto, o aplicativo atual continua restrito a ambiente administrativo de desenvolvimento/demonstração.

### 11.13. Cenários de aceite e demonstração

- Administrador cadastra turma, vincula professor, matricula aluno e ativa duas contas distintas, sem senha compartilhada.
- Professor publica material para turma A; aluno de A consegue baixar de casa; aluno de B não recebe item em lista nem baixa pelo ID/URL direto.
- Professor A não lê diário, entregas ou notas de turma sem atribuição. Remover sua atribuição revoga acessos sem apagar autoria histórica.
- Aluno só consulta suas notas publicadas, presença e cobranças; tentativa de trocar IDs não revela dados de colega, nem pela exportação.
- Professor salva nota como rascunho, publica, corrige com motivo e preserva versões. Aluno só vê versões publicadas segundo regra definida.
- Aula cancelada não vira falta; reposição não duplica aulas realizadas; transferência respeita período da matrícula.
- Aluno envia atividade com identidade da sessão; corpo contendo outro aluno_id não permite registrar em nome de colega.
- Troca de conta no mesmo computador não exibe dado anterior. Conta desativada e sessão revogada deixam de acessar também downloads novos.
- Falha de internet informa indisponibilidade sem duplicar submissão/pagamento na repetição. Cliente incompatível recebe orientação de atualização.
- Restaurar cópia de teste recupera dados e materiais compatíveis, preserva histórico e exige nova autenticação. Nenhum aluno/professor pode acionar restauração.
- Quatro situações de API da etapa F continuam sendo demonstradas por finalidade. Muitos endpoints do servidor central não são contados automaticamente como quatro situações distintas.

### 11.14. Decisões operacionais ainda necessárias

Já está decidido: escola presencial, acesso de casa pela internet, contas de aluno/professor/admin, permissões por vínculo e materiais utilizáveis em casa. Durante a implementação, definir hospedagem/domínio e orçamento, processo de envio de convites/recuperação, limites de arquivos, prazo de acesso a turmas concluídas, política de frequência/notas e quem pode publicar material institucional. Não contratar hospedagem, enviar convites reais ou publicar o serviço como efeito de editar este plano.

Critério final ampliado: COR-01 a COR-17 e PROD-01 a PROD-08 com evidências; escola, professor e dois alunos usando contas separadas e dados compartilhados somente pelo servidor autorizado; uso remoto testado sem banco completo nos clientes. Acesso web/mobile, portal de responsável, pagamentos online e certificados ficam como evoluções futuras, não como promessas da primeira entrega.
## 12. Execução do código em oito commits

**Data:** 24/11/2026. **Situação:** ordem de execução aprovada para planejamento; nenhum código, commit, push ou deploy é realizado pela inclusão desta seção.

Esta seção organiza COR-01 a COR-17 e PROD-01 a PROD-08 em aproximadamente oito commits de implementação. Substitui a ordem de execução genérica anterior, preservando seus requisitos e critérios. Cada commit é uma entrega coesa com código, migrations, testes e documentação correspondentes; oito commits não significa oito tarefas pequenas ou oito sessões de trabalho.

O histórico inspecionado usa mensagens como <feat>: e <fix>:. Para esta sequência, os títulos abaixo seguem literalmente {feat}: e {fix}:, conforme solicitado pelo usuário. Não misturar uma mudança geral de estilo/formatador aos commits funcionais.

### 12.1. Preparação antes de alterar o código

- Confirmar checkout, branch e mudanças existentes sem sobrescrever o trabalho do usuário. O histórico pôde ser consultado na branch developer, mas git status ainda apresentou erro de work tree em uma das verificações. Diagnosticar a execução/configuração Git antes de criar commits, sem apagar .git, reinicializar histórico ou resetar mudanças.
- Criar branch de implementação com prefixo codex/ a partir da base confirmada. Manter a identidade real do autor e revisar staged antes de cada commit.
- Inventariar versões, schema e contratos atuais; reproduzir a suíte e guardar resultados como referência. As contagens de testes da revisão não substituem a execução atual.
- Usar dados temporários e fixture legada. Nenhum teste deve operar no banco real da escola; não executar seed destrutivo para preparar demonstração.
- Definir o contrato da API, fronteiras de módulos e migrations antes de mover regras. A implantação pela internet exige servidor central; login local sobre cópia completa do banco não é solução provisória aceitável para alunos.
- Reservar a pequena correção de cotações para a contribuição do colega. Quando ela chegar, integrar o trabalho real dele sem repetir a implementação nem alterar sua autoria. Se não estiver pronta, registrar COR-16 correspondente como pendente, sem esconder a lacuna para fechar a contagem de commits.
- Incorporar este planejamento ao primeiro commit de implementação, evitando criar um nono commit só para documentação. Não fazer push ou contratar/publicar serviço como consequência deste planejamento.

### 12.2. Commit 1 — Conter falhas críticas e recuperar a base

**Mensagem:** `{fix}: corrige backups e validacao de dados no Windows`

**Objetivo:** começar pelos riscos de perda de dados e quitação indevida antes de ampliar o produto.

**O que será feito:**

- Corrigir fsync/rename/cópias conforme a plataforma, distinguindo falhas antes/depois da troca do arquivo. Não suprimir erros de durabilidade indiscriminadamente.
- Fortalecer validação de backup: schema, colunas e consultas mínimas, além de versão, integridade e FKs. Rejeitar o banco de tabelas com colunas incompatíveis reproduzido na revisão.
- Exercitar backup/exportação/restauração com WAL e interrupções; manter o banco atual recuperável.
- Expor falha automática e último sucesso de backup na interface, em vez de depender do console.
- Conter COR-01 rejeitando pagamento abaixo do valor exigível enquanto o modelo de saldo parcial ainda não existe. O suporte completo chega no commit 4; não aceitar desconto silencioso como contorno.
- Ajustar CI para Windows e Linux e estabelecer uma referência de regressão antes de refatorar.

**Áreas:** src/main/arquivos.ts, backup.ts, migrations, routes/mensalidades.ts, páginas de pagamento/configurações, testes e .github/workflows/ci.yml.

**Pronto quando:** backup abre e pode ser restaurado no Windows; schema inválido é recusado; R$ 1 não quita débito de R$ 300; falha aparece na tela; nenhuma falha preexistente é ocultada por remoção de teste.

**Rastreabilidade:** COR-01 (contenção), COR-02, COR-03, COR-10 (início).

### 12.3. Commit 2 — Separar domínio e introduzir o servidor central

**Mensagem:** `{feat}: estrutura API central e servicos de dominio em classes`

**Dependência:** commit 1.

**O que será feito:**

- Extrair regras para classes de aplicação/domínio e SQL para repositórios, começando por matrículas, financeiro e avaliações. Relógio, rede e banco serão dependências injetadas.
- Criar ponto de entrada TypeScript separado para a API central, com contrato versionado, erros controlados e cliente tipado no Electron. A organização de destino está definida na seção 13: módulos de negócio em src/server/modules, cada um com domínio, aplicação, infraestrutura e apresentação. src/main permanece responsável pelo processo desktop; regras de negócio ali existentes serão extraídas durante a transição, sem duplicação.
- Manter SQLite apenas como origem legada/teste quando necessário; preparar persistência relacional de servidor, tomando PostgreSQL como referência sujeita à validação técnica da implementação.
- Criar migrations e importador ensaiado para preservar IDs/vínculos e reconciliar contagens/totais. Não importar diretamente uma cópia de SQLite como se fosse um banco de servidor.
- Migrar operações atuais para os mesmos serviços de domínio, com paridade testada. Quando o modo central for usado, não manter gravação independente no banco local.
- Mover integrações e rotinas de banco para o servidor; segredos não entram em bundle do cliente. Remover a dependência do renderer/main local como autoridade sobre dados centrais.
- Acrescentar configuração de desenvolvimento e teste de integração com banco real isolado. Contrato para autenticação será preparado aqui e aplicado integralmente no commit 3.

**Restrição de entrega:** este estado é exclusivamente de desenvolvimento, com acesso restrito ao ambiente de teste e sem exposição pública. Não conectar alunos a uma API de dados sem autorização implementada. Se algum adaptador ainda não estiver migrado, ele permanece explicitamente indisponível no modo central, sem fallback silencioso para dados locais.

**Pronto quando:** cliente consulta um serviço central em ambiente controlado; domínio é testável sem Electron; importação legada é conciliada e repetição não duplica registros; banco/segredos não estão no pacote do aluno; nenhuma alteração financeira é perdida na transição.

**Rastreabilidade:** COR-06, COR-09 (preparação), PROD-01.

### 12.4. Commit 3 — Implementar contas, login e permissões reais

**Mensagem:** `{feat}: adiciona login e acesso por perfil e turma`

**Dependência:** commit 2. É o primeiro ponto em que as áreas de aluno/professor poderão receber acesso de teste aos dados centrais.

**O que será feito:**

- Criar usuários, vínculos com aluno/professor, perfis, permissões, sessões e auditoria, por migrations.
- Implementar configuração inicial de administrador, ativação, troca/recuperação de acesso, logout, expiração e revogação. Senhas não terão valor padrão nem armazenamento em texto puro.
- Implementar autorização no servidor por ação e recurso: próprio aluno, turma atribuída ao professor e função administrativa. Usuário/perfil enviados no corpo não determinam autorização.
- Proteger todos os endpoints existentes antes de liberar modo aluno, incluindo listas, totais, CSV, arquivos e backups. Rotinas ainda sem política validada ficam indisponíveis, nunca abertas por padrão.
- Criar login e navegação inicial próprios para aluno, professor e administração, com estados vazios honestos para módulos que ainda serão entregues.
- Limpar dados da conta anterior ao sair/trocar sessão. Restringir leitura de dados financeiros e pessoais tanto quanto escrita.
- Registrar ator autenticado em auditoria; revisar ponte IPC, origem/frame, credenciais protegidas no dispositivo e controles de tentativas de login.
- Disponibilizar ativação/recuperação em ambiente de teste e procedimento administrativo auditado; envio real de e-mail só será declarado pronto após configurar e testar o canal.

**Pronto quando:** dois alunos e dois professores não acessam dados uns dos outros por troca de ID, busca ou exportação; chamadas sem sessão são negadas; professor não registra pagamento; aluno não cadastra aluno/material; desativação de conta revoga sessão; interface não vaza dados entre logins.

**Rastreabilidade:** COR-05, PROD-02, PROD-03; pré-requisito de segurança para todas as próximas partes.

### 12.5. Commit 4 — Consolidar o financeiro com saldo e histórico

**Mensagem:** `{feat}: implementa pagamentos parciais e historico financeiro auditavel`

**Dependência:** commit 3.

**O que será feito:**

- Migrar valores monetários operacionais para centavos e reconciliar dados legados. Não inventar descontos, autores ou movimentações históricas desconhecidas.
- Implementar pagamentos, estornos compensatórios e ajustes como registros preservados. Saldo determina quitação e inadimplência; parcial não equivale a pago.
- Definir e testar encargos sobre saldo e ordem de abatimento. Centralizar cálculo; backend continua sendo a autoridade.
- Implementar descontos/isenções autorizados, motivos, proteção de duplicidade e recusa de excedente enquanto não existir política de crédito.
- Persistir configurações financeiras e vigência sem recalcular mensalidades antigas silenciosamente.
- Completar correções de mensalidade por operações auditadas, comprovantes internos e relatórios separados por caixa/competência.
- Entregar Minhas mensalidades no aluno, com saldo/comprovantes próprios e cotação apenas informativa. Registrar pagamento e estornar continuam exclusivos do financeiro autorizado.

**Pronto quando:** pagamento parcial deixa saldo correto, estorno mantém histórico, reenvio não duplica cobrança/recebimento, configurações têm efeito explicado e relatórios reconciliam centavos; aluno não consulta cobranças de colega.

**Rastreabilidade:** COR-01 (solução definitiva), COR-04, COR-07 (financeiro), COR-09, COR-11, COR-14, parte de PROD-07.

### 12.6. Commit 5 — Concluir gestão acadêmica, agenda e chamada

**Mensagem:** `{feat}: completa gestao academica agenda e frequencia`

**Dependências:** commits 3 e 4, pois transferências/rematrículas podem afetar cobranças.

**O que será feito:**

- Completar operações da matriz CRUD em cadastros e turmas, incluindo exclusão de cadastro sem dependentes e alternativas explícitas para históricos.
- Implementar correções e transferência de matrícula com vagas, vínculos, cobranças e histórico consistentes.
- Estruturar dias/horários, aulas e locais; detectar conflito de professor/aluno e registrar exceção autorizada quando prevista.
- Implementar aulas realizadas, chamada, justificativas e correções com histórico. Cancelamento/reposição não duplica carga horária nem gera falta em aula inexistente.
- Entregar Minhas turmas, Minha agenda e Minha frequência para aluno; Minhas turmas e chamada para professor; gestão para secretaria/coordenação.
- Paginar/ordenar listagens no servidor e colocar busca nos seletores; professor recebe apenas campos necessários de suas turmas.
- Atualizar rematrícula para a política de saldo e recomendação de progressão, sem aprovação automática por simples passagem de ano.

**Pronto quando:** turma lotada recusa matrícula mesmo em concorrência; professor só faz chamada em turma atribuída; aluno vê sua presença; transferência preserva histórico; filtros/paginação funcionam com volume maior; exclusões respeitam dependências.

**Rastreabilidade:** COR-07 (acadêmico), COR-13, PROD-05.

### 12.7. Commit 6 — Entregar biblioteca, atividades e notas

**Mensagem:** `{feat}: adiciona materiais por turma atividades e notas publicadas`

**Dependências:** commits 3 e 5.

**O que será feito:**

- Transformar o catálogo em biblioteca com arquivos privados, versões e publicações por turma. Validar tipo/tamanho de arquivo e autorização de upload/download no servidor.
- Entregar professor publicando material de sua turma e aluno consultando/baixando de casa. Material institucional tem permissão própria; rascunho não é público.
- Criar atividades, entregas por matrícula, devolutivas e notas em rascunho/publicadas, com versão e motivo de correção.
- Distinguir avaliação acadêmica, feedback e autoavaliação. A resposta do aluno usa a identidade da sessão, sem seletor livre de outro aluno.
- Integrar o editor existente à prévia do rascunho e proteger alterações não salvas. Manter trava/versionamento depois de respostas.
- Mostrar notas e resultados somente a quem tem direito; não apresentar feedback como anônimo sem modelo específico para isso.
- Incluir arquivos e manifestos no contrato de backup/recuperação central, desenvolvido desde este commit e validado novamente no 8.

**Pronto quando:** aluno de turma B não baixa material de A nem por URL/ID; arquivo inválido é recusado; nota em rascunho não aparece; correção preserva versões; aluno não envia atividade em nome de colega; sair do editor não descarta silenciosamente alterações.

**Rastreabilidade:** COR-07 (avaliações), COR-15, PROD-04, PROD-06 e parte de PROD-08.

### 12.8. Commit 7 — Integrar comunicação, ferramentas e experiência

**Mensagem:** `{feat}: integra avisos solicitacoes e ferramentas da escola`

**Dependências:** commits 3 a 6.

**O que será feito:**

- Criar avisos segmentados por turma/perfil, leituras e solicitações de atendimento com situação, responsável e histórico. Solicitação de rematrícula não efetiva matrícula automaticamente.
- Completar painéis por perfil: aluno com próxima aula/material/atividade, professor com chamada/devolutivas pendentes e administração com ações de gestão e saúde do sistema.
- Persistir cache de cotação e tratar validade, origem, reinício offline e atualização explícita. Manter tradução com fonte e limite claros.
- Entregar consulta opcional de CEP no cadastro e feriados no planejamento de aulas, com fallback manual e cobertura explicitada. Selecionar provedores por documentação/termos durante a implementação. Essas funções completam as quatro finalidades planejadas de API sem contar alternativas do mesmo serviço como situações extras.
- Integrar a contribuição do colega sobre formatação de cotações quando disponível, preservando autoria. Não duplicar o trabalho reservado.
- Revisar textos, taxas pequenas, estados de erro/vazio/carregamento, paginação, períodos dos indicadores, navegação, teclado e escala do Windows. Corrigir os três avisos atuais de lint na medida em que os componentes envolvidos forem mantidos/refatorados.

**Pronto quando:** avisos e solicitações chegam apenas aos destinatários autorizados; quatro situações de API têm propósito e testes de erro; cache funciona depois do reinício; telas principais são utilizáveis nos tamanhos suportados e textos correspondem às regras.

**Rastreabilidade:** COR-08, COR-12, COR-16, conclusão de PROD-07 e consolidação de PROD-03.

### 12.9. Commit 8 — Preparar operação, instalador e entrega

**Mensagem:** `{feat}: prepara distribuicao desktop e operacao segura do servidor`

**Dependência:** commits anteriores e contribuição do colega integrada ou pendência explicitamente resolvida.

**O que será feito:**

- Criar instalador Electron para Windows sem exigir Node do usuário; configurar endereço da API sem embutir segredos e preservar credenciais/dados autorizados em atualização.
- Entregar configuração reproduzível do servidor, variáveis de ambiente documentadas, HTTPS, verificações de disponibilidade e política de versões do cliente/API. Definir ambiente local de demonstração e roteiro para hospedagem real.
- Consolidar backup/restauração central de banco + arquivos, retenção, controle de acesso, modo de manutenção e invalidação de sessões após recuperação. Testar restauração completa em ambiente isolado.
- Finalizar migração da instalação antiga para o serviço central com validação de contagens/totais/arquivos; eliminar fluxos que mantenham cópias locais completas em contas de aluno/professor.
- Documentar criação inicial do administrador, ativação e recuperação, operação, limites offline e parâmetros que dependem da escola.
- Executar regressão de segurança, integração, interface, concorrência, migrações e aplicativo instalado. Testes importantes já devem acompanhar seus commits; esta é a verificação integrada final.
- Atualizar README, diagramas, matriz CRUD/permissões, contratos e roteiro dos requisitos do PDF. Conferir contribuição real dos integrantes e acesso do colaborador exigido.

**Pronto quando:** instalador funciona em Windows sem ferramentas de desenvolvimento; clientes separados usam o mesmo serviço autorizado; recuperação devolve dados e materiais; testes passam nos sistemas declarados; conta aluno/professor não contém o banco completo.

Preparar infraestrutura não equivale a serviço publicado. Hospedagem, domínio, orçamento e canal de e-mail precisam estar definidos para teste remoto real. Sem isso, registrar o que foi validado em ambiente controlado e o que depende de implantação; não declarar uso de casa validado apenas por localhost. Não contratar nem publicar serviço automaticamente nesta etapa de planejamento.

**Rastreabilidade:** COR-02/03/10 (validação integrada), COR-17, PROD-08 e fechamento de PROD-01.

### 12.10. Regras de validação e commits

1. Cada parte precisa compilar e ter testes pertinentes antes do commit. Executar typecheck, lint e testes dos módulos alterados; rodar as suítes completas nos marcos de migração/autenticação e na entrega final. Adequar scripts quando a estrutura central for criada.
2. Aplicar migrations primeiro em banco temporário novo e legado. Registrar diferenças de dados e procedimento de recuperação; nenhuma migration é considerada pronta só por funcionar no banco vazio.
3. Capturas e testes de interface acompanham a entrega visual de cada parte; segurança e privacidade são verificadas pelo servidor, não por ausência de botão.
4. Revisar diff e staged antes de commitar, incluindo apenas arquivos da parte. Não usar git add . sobre trabalho compartilhado sem revisão.
5. Documentação e pequenos ajustes de teste entram no mesmo commit funcional correspondente. Não agrupar falhas independentes como correção vaga nem reescrever histórico alheio para atingir oito commits exatos.
6. O alvo é oito commits desta implementação. O commit do colega é uma contribuição separada e pode aumentar o total do grupo. Se houver motivo técnico real para dividir uma entrega, explicar o ajuste em vez de produzir um commit quebrado ou omitir escopo.
7. Nenhum commit significa autorização automática para push, deploy externo ou contratação. O estado final informado deve distinguir código implementado, testes realizados e serviço efetivamente operante.

### 12.11. Mapa de conclusão

| Resultado | Commit principal |
|---|---|
| Recuperação Windows, schema e contenção financeira | 1 |
| Classes, API central e migração relacional | 2 |
| Identidade, autorização, auditoria e áreas por perfil | 3 |
| Pagamentos, estornos, configurações e consulta financeira própria | 4 |
| CRUD acadêmico, agenda, chamada e transferências | 5 |
| Materiais em casa, atividades, avaliações e notas | 6 |
| Avisos, atendimento, quatro situações de API e acabamento | 7 |
| Distribuição, recuperação completa e preparação de operação | 8 |

**Ponto de partida na implementação:** reproduzir backup/validação e pagamento insuficiente em ambiente temporário, corrigir os testes de regressão e somente depois avançar para refatoração e serviço central. Não começar pela tela de login isolada, porque a proteção efetiva depende da API e do isolamento dos dados.
## 13. Padrão arquitetural do projeto

**Requisito do usuário:** a implementação deve adotar conceitos de arquitetura de software de forma profissional, adaptados à escola presencial com clientes Electron e acesso remoto. Esta seção define regras de implementação; criar pastas ou dar nomes a classes, sem respeitar essas regras, não satisfaz o requisito.

**Decisão:** arquitetura cliente-servidor, com **backend como monólito modular**, módulos organizados por capacidade de negócio e, dentro de cada módulo, separação de **domínio, aplicação, infraestrutura e apresentação**, usando **portas e adaptadores** e inversão de dependência. Usar DDD de forma pragmática para modelar regras e limites do negócio, sem exigir mecanismos complexos em cadastros simples.

A escolha atende a um sistema de escola com equipe e escala iniciais limitadas: permite transações consistentes, execução e manutenção compreensíveis, isolamento de informações e evolução por módulo. Não pressupõe microserviços, múltiplos bancos por módulo, barramento distribuído, CQRS completo, event sourcing ou Kubernetes. Esses mecanismos só serão considerados se uma necessidade concreta e documentada justificar o custo.

### 13.1. Fronteiras de execução

| Componente | Responsabilidade | Não pode fazer |
|---|---|---|
| Electron renderer | Telas, navegação, estado visual, formulários e feedback | SQL, conhecer segredo do servidor, decidir autorização definitiva |
| Electron preload/main | Ponte mínima, armazenamento protegido de sessão quando necessário, integração nativa e cliente da API | Hospedar banco completo da escola no computador do aluno ou substituir regras centrais |
| API central | Autenticação, autorização, casos de uso, regras, transações e entrega de dados autorizados | Confiar no perfil/proprietário enviado pelo cliente |
| Banco relacional | Persistência central, integridade referencial, índices e restrições | Ser acessível diretamente pelos clientes Electron |
| Armazenamento de arquivos | Materiais privados e versões com metadados | Publicar arquivos indiscriminadamente por caminho previsível |
| Serviços externos | Tradução, câmbio, CEP e calendário conforme contratos | Tornar cadastro e histórico indisponíveis por falha de integração auxiliar |

O backend é uma unidade principal de implantação com módulos internos; armazenamento de objetos e banco são recursos de infraestrutura, não justificativa automática para dividir o domínio em microserviços. Ferramentas administrativas de migração/backup são componentes restritos, não rotas abertas ao cliente comum.

### 13.2. Organização de destino

```text
src/
  main/                       # ciclo de vida Electron e integrações nativas
  preload/                    # superfície mínima e tipada para o renderer
  renderer/
    app/                      # rotas, sessão e composição visual
    features/                 # telas e componentes por funcionalidade
    components/               # componentes de interface realmente compartilhados
    lib/                      # cliente tipado, formatação e utilitários de apresentação
  shared/
    contracts/                # DTOs públicos, códigos de erro e schemas seguros
    value-objects/            # dinheiro/data apenas quando puros e necessários em ambos
  server/
    bootstrap/                # composição de dependências e inicialização
    config/                   # leitura/validação de configuração do servidor
    modules/
      identity/
      academic/
      finance/
      library/
      learning/
      communication/
      integrations/
      operations/
    infrastructure/
      persistence/migrations/ # sequência única de migrations e migração legada
      observability/          # logs estruturados, correlação e saúde
    transport/                # servidor HTTP, tratamento global de erros e middleware
```

Estrutura interna de um módulo com regras relevantes:

```text
finance/
  domain/                     # Mensalidade, Pagamento, políticas e invariantes
  application/
    use-cases/                # RegistrarPagamento, EstornarPagamento, ConsultarSaldo
    ports/                    # repositórios, transação, relógio e auditoria necessários
  infrastructure/             # implementações SQL e adaptações técnicas
  presentation/               # controladores HTTP e mapeamento de entrada/saída
  public.ts                   # interface pública para outros módulos
```

Preservar os arquivos atuais enquanto houver adaptação em andamento. Evitar dois conjuntos ativos de regras: a extração troca o ponto de uso e os testes verificam paridade. Não exigir migrar todas as telas para features em um commit de mera movimentação; organizar cada funcionalidade quando ela for trabalhada. A estrutura é um guia para responsabilidades, não autorização para criar camadas vazias ou abstrações sem uso.

### 13.3. Módulos e propriedade dos dados

| Módulo | Responsabilidade principal |
|---|---|
| identity | Contas, ativação/recuperação, sessões, papéis e permissões |
| academic | Alunos, professores, habilitações, idiomas, turmas, matrículas, horários, aulas e frequência |
| finance | Obrigações, pagamentos, estornos, ajustes, encargos, parâmetros e relatórios financeiros |
| library | Materiais, versões, arquivos privados e publicações por turma/público |
| learning | Atividades, entregas, notas, avaliações configuráveis e resultados conforme finalidade |
| communication | Avisos, destinatários, leituras, solicitações e histórico de atendimento |
| integrations | Adaptadores e cache de câmbio, tradução, CEP e calendário |
| operations | Backup, restauração, manutenção e coordenação da auditoria operacional |

- Cada módulo é responsável pelas alterações de seus dados. Outro módulo não deve importar seu repositório concreto nem escrever diretamente em suas tabelas.
- Comunicação interna usa interfaces públicas de aplicação/portas, por chamada em processo. Não criar requisições HTTP entre módulos do mesmo backend.
- Um caso de uso que cruza matrícula e cobrança pode coordenar serviços públicos dentro da mesma transação relacional por unidade de trabalho compartilhada. Definir responsável pela orquestração e impedir ciclos de dependência; não aceitar matrícula salva sem mensalidades por falha intermediária.
- Consultas de relatório entre domínios usam projeções/consultas de leitura explícitas, com autorização e escopo, sem liberar escrita cruzada ou carregar entidades completas por conveniência.
- A identidade da conta e o cadastro acadêmico permanecem separados. Compartilhar um usuário não significa compartilhar permissões ou histórico com outra pessoa.
- Eventos internos podem desacoplar avisos após uma operação. Evento em memória não é garantia de entrega; quando a entrega for obrigatória, persistir a intenção na mesma transação e implementar repetição idempotente. Não usar eventos assíncronos para quebrar consistência financeira essencial.

### 13.4. Regras de dependência e aplicação de princípios

1. Domínio depende apenas de TypeScript e conceitos puros. Não importa Electron, React, framework HTTP, ORM/driver SQL, variáveis de ambiente ou cliente de API externa.
2. Aplicação coordena domínio e portas; conhece contexto autenticado tipado, transação e interfaces necessárias. Não recebe Request/Response do framework nem escreve SQL.
3. Infraestrutura implementa portas com banco, arquivos e rede. O bootstrap conhece implementações concretas e faz a injeção de dependências.
4. Apresentação valida formato de entrada, obtém sessão, chama caso de uso e converte resultado/erro para contrato público. Regra de valor, capacidade, saldo e vínculo não fica no controlador.
5. Autorização transversal pode iniciar em middleware, mas escopo do recurso deve ser validado no caso de uso/política correspondente. Chamar um caso de uso por outro adaptador não pode contornar acesso.
6. Dependências entre módulos passam por public.ts ou contratos de aplicação declarados. Não permitir imports cíclicos nem acesso a caminhos internos de outro módulo.
7. Cliente importa contratos seguros, não entidades internas, repositórios ou DTO administrativo universal. Listagem de aluno deve ter seu próprio formato mínimo.
8. Aplicar SOLID por responsabilidade coesa, interfaces pequenas e inversão de dependência real. Evitar classe única de escola com dezenas de operações, serviço genérico de CRUD com regras por strings e interface criada só para repetir cada classe sem necessidade.
9. Classes de domínio/casos de uso atendem à orientação a objetos exigida no PDF; React e funções puras de formatação continuam funcionais. Nem todo registro exige uma entidade rica: CRUD simples pode usar serviço em classe e repositório direto.
10. Dependências de runtime e regras arquiteturais devem ser verificáveis por configuração de imports/lint e testes apropriados, e não apenas por convenção verbal.

### 13.5. Modelagem, persistência e transações

- Usar objetos de valor ou tipos com invariantes para centavos, competência, intervalo de horário e IDs quando houver ganho real. Não criar wrappers que apenas escondem string/number sem validação.
- Estado e transições devem ser explícitos: matrícula ativa/cancelada/concluída; material rascunho/publicado/arquivado; nota rascunho/publicada; pagamento estornado por compensação, sem apagar o original.
- Invariantes são protegidas no domínio/caso de uso e, quando possível, também por FKs, unicidade e CHECKs no banco. Validação na tela melhora experiência, mas não substitui o servidor.
- Definir uma transação por operação consistente, com rollback e isolamento adequados. Última vaga, pagamento duplicado, estorno repetido e publicação concorrente precisam de proteção testada no banco, não apenas botão desabilitado.
- Encapsular persistência por repositórios específicos. Selecionar consultas, índices e paginação conforme necessidade real; não retornar todos os dados para filtrar no cliente.
- Migrações são versionadas e acompanhadas de ensaio com dados legados, recuperação e conciliação. Escolha de driver/ORM não define a arquitetura; seu uso fica restrito à infraestrutura.
- Auditoria registra quem, quando, qual ação, recurso e motivo pertinente sem expor segredos. Histórico auditável não transforma o sistema automaticamente em event sourcing.

### 13.6. Contratos, integrações e falhas

- Contrato de API tipado e versionado, com schemas de entrada executados em runtime, paginação e erros previsíveis. Validar também respostas de provedores externos; TypeScript não garante o formato recebido pela rede.
- DTOs explícitos por perfil/caso de uso. Nunca serializar usuário com hash de senha nem entidade interna completa para economizar mapeamento.
- Adotar identificador de operação em mutações que possam ser repetidas. Reenvio não cria matrícula, pagamento ou entrega duplicada.
- Integrações têm timeout, cache/validade, tratamento de indisponibilidade e retentativa limitada apenas onde seguro. Não repetir gravação externa sem mecanismo de idempotência conhecido.
- Controladores convertem erros de domínio para respostas controladas; stack, SQL e caminhos internos ficam fora da interface pública.
- Banco, armazenamento e configuração inválidos devem gerar diagnóstico claro e falha segura. A API não pode iniciar em modo aberto porque faltou configuração de autenticação.

### 13.7. Qualidade, segurança e operação como parte da arquitetura

| Atributo | Evidência necessária |
|---|---|
| Manutenibilidade | Módulos com interfaces públicas, responsabilidades identificáveis e ausência de ciclos |
| Testabilidade | Domínio/casos de uso exercitados sem janela e sem rede; adapters com testes de integração reais |
| Integridade | Transações, restrições e testes concorrentes de vaga, pagamento e estorno |
| Privacidade | Testes de acesso cruzado, respostas mínimas por perfil e arquivos privados |
| Recuperabilidade | Restauração ensaiada de banco + materiais e invalidação de sessões |
| Desempenho | Consultas paginadas e medição em volume representativo; metas registradas antes do aceite |
| Operabilidade | Logs estruturados com correlação, saúde/disponibilidade e configuração validada sem segredos no cliente |
| Compatibilidade | Cliente/API com versão conhecida, migrations ensaiadas e instalador validado |

Logs operacionais, auditoria de negócio e feedback da interface têm finalidades diferentes. Não registrar conteúdo sensível completo apenas para facilitar depuração. Verificações de saúde públicas não devem revelar schema, credenciais ou informações de alunos.

### 13.8. Documentação e governança técnica

No commit 2, criar docs/arquitetura.md com diagramas C4 de contexto e contêineres e um diagrama de componentes dos módulos centrais; acrescentar diagrama entidade-relacionamento e fluxos críticos de login, matrícula/cobrança e material/download. Diagramas devem corresponder ao código entregue, distinguindo transição de destino.

Registrar decisões curtas em docs/adr/ com contexto, alternativas, escolha e consequências. Decisões iniciais:

- monólito modular e limites dos módulos;
- separação cliente Electron/servidor e proibição de banco completo no aluno;
- banco central, acesso SQL/ORM e migração do SQLite;
- autenticação, revogação e autorização por vínculo;
- dinheiro em centavos, consistência e registros compensatórios;
- arquivos privados, versões e política de recuperação.

ADR documenta decisão real; não antecipar como concluída uma tecnologia ainda não avaliada. Selecionar bibliotecas com documentação primária e compatibilidade verificadas durante a implementação. Não adicionar frameworks arquiteturais apenas para aumentar a quantidade de ferramentas.

### 13.9. Aplicação aos oito commits e critérios de revisão

- **Commit 1:** correções localizadas e testes de regressão; preparar fronteiras sem misturar uma refatoração geral ao reparo crítico.
- **Commit 2:** estrutura modular, extração dos casos de uso/repositórios, bootstrap, API central, documentação e regras de dependência. Todo fluxo migrado deve usar uma única fonte de regra.
- **Commit 3:** identidade e políticas de acesso no servidor; interface por perfil usa os contratos autorizados, sem depender de esconder botão.
- **Commits 4–7:** implementar cada funcionalidade em seu módulo, acompanhada de caso de uso, contrato, persistência, autorização e teste. Não deixar controllers ou componentes React absorverem regras à medida que o projeto crescer.
- **Commit 8:** validar implantação, recuperação, observabilidade, configuração, compatibilidade e conformidade da arquitetura com o produto entregue.

Checklist obrigatório na revisão de cada parte:

- [ ] A mudança pertence a um módulo identificado e não viola a propriedade dos dados.
- [ ] Não adiciona dependência de UI/framework/banco dentro do domínio.
- [ ] Casos de uso têm regras e autorização testáveis fora do transporte.
- [ ] Operações consistentes são transacionais; repetição/concorrência não corrompem o resultado.
- [ ] Contratos não vazam dados ou detalhes internos.
- [ ] Imports entre módulos respeitam interfaces públicas e não criam ciclos.
- [ ] Há validação proporcional: unidade para regras, integração para persistência/contratos e ponta a ponta para fluxos críticos.
- [ ] A documentação acompanha decisões novas e o código não introduz abstrações sem benefício.

Esta definição não cria um nono commit. Arquitetura é o padrão seguido em todas as entregas, com a fundação concentrada no commit 2, e não uma reorganização cosmética posterior.

## 14. Registro de execução

### Parte 1/8 — Correções críticas (24/11/2026)

Implementado na branch feat/reestruturacao-escola, seguindo a seção 12.2:

- Flush de arquivos compatível com Windows, preservando o flush de diretório em plataformas POSIX; limites de durabilidade documentados.
- Validação do schema declarado contra as migrations da versão, incluindo constraints/índices e recusa de triggers/views não previstos; compatibilidade com a fixture legada verificada.
- Revalidação no reinício e retenção do arquivo preparado até concluir a restauração; teste de falha após publicar o arquivo demonstra que o próximo boot consegue retomar preservando a cópia original.
- Proteção da exportação contra o próprio banco, incluindo alias por hard link e variação de caixa no Windows.
- GET /backups/estado e indicadores de última tentativa, sucesso e falha persistente na interface. Tentativa/erro são da sessão, com referência ao último arquivo persistido após reabertura.
- Pagamento insuficiente recusado na tela e no backend, sem alteração da mensalidade. Cenários antigos que simulavam desconto implícito foram adequados ao valor exigível/data; pagamentos parciais continuam previstos no commit 4.
- Seed automático limitado a banco novo; banco existente/restaurado vazio permanece vazio após novas aberturas.
- CI com matriz Windows/Linux e branches da reestruturação; Prettier aceita as quebras de linha nativas do checkout, sem reformatação geral.

Validação local: referência inicial com 126 testes (107 aprovados, 19 falhas); após correções, 134/134 testes de backend e 22/22 testes de interface aprovados; typecheck e build aprovados. Lint sem erros, mantendo três avisos preexistentes em componentes fora deste escopo. Captura do Electron real confirma backup automático e indicadores; duas aberturas de banco vazio restaurado mantiveram zero alunos/idiomas. A matriz remota de CI ainda depende de execução no GitHub.

Próxima parte: seção 12.3, extração de serviços em classes e estrutura da API central; não há login/servidor central implementados nesta primeira entrega. A correção pequena de cotação reservada ao colega não foi implementada aqui.

### Partes 2–8 — Integração entregue (24/11/2026)

- **2:** API central versionada, monólito modular, serviços de aplicação em classes, portas e repositórios; ADR e contexto em docs/arquitetura.md. Persistência central SQLite/WAL escolhida para instância única; PostgreSQL não foi implementado.
- **3:** contas vinculadas, papéis admin/secretaria/financeiro/professor/aluno, ativação e recuperação por código, scrypt, sessão revogável, limitação de tentativas, logout e escopo por turma. Troca de senha com revogação foi consolidada na parte 8.
- **4:** valores operacionais em centavos, saldo e encargos, parcial, estorno compensatório, desconto/ajuste, política versionada, caixa/competência, extrato e leitura financeira própria.
- **5:** agenda, horários, conflito de professor/sala/aluno, chamada versionada e histórico, frequência própria, cancelamento/reposição, transferência sem cobranças duplicadas e exclusão restrita por dependências. Paginação SQL de alunos/professores e busca nos seletores foram consolidadas na parte 8; listagens menores e projeções de módulos novos ainda precisam de medição de volume e expansão da paginação.
- **6:** biblioteca privada por turma, anexos em BLOB com integridade, versões e arquivamento, atividades, entregas idempotentes, notas publicadas, correções históricas e avaliações com identidade da sessão. Prévia do rascunho e aviso de alterações não salvas. O registro de avaliação presencial foi consolidado na parte 8.
- **7:** avisos gerais/por turma/por destinatário com leitura, solicitações e histórico de atendimento, quatro finalidades de integração, cache de câmbio persistido, CEP opcional, feriados nacionais e eliminação dos três avisos de lint. Painel pessoal com próxima aula, materiais, atividades e pendências foi consolidado na parte 8. Avisos também aceitam audiência por perfil, consolidada na parte 8. Painéis de coordenação mais específicos permanecem evolução.
- **8:** cliente distribuído sem SQLite/seed/serviços do servidor, configuração de URL na tela de login, build de servidor e instalador Windows, configuração de proxy HTTPS e guia operacional. Backup consistente inclui anexos; exportação exige senha administrativa. Restauração central exige servidor parado, exclusão por lock, validação de schema e revogação de sessões/códigos. Teste isolado recupera material privado e confirma invalidação de token anterior.

**Roteiro e limites de aceite:** docs/OPERACAO.md é a referência de execução atual. A hospedagem pública, DNS/certificado, envio de e-mail, supervisão do servidor, validação de carga e execução da matriz Windows/Linux no GitHub dependem do ambiente de entrega. A instalação local anterior não foi migrada automaticamente; há procedimento de importação e conciliação. A atribuição de progressão é decisão da escola, sem aprovação automática por nota/ano. A contribuição pequena de formatação do colega continua reservada, sem atribuir autoria inexistente. Esses pontos não são apresentados como testes ou integrações já realizados.

A pedido do usuário, após os oito commits a branch será integrada à developer e os testes serão repetidos no resultado do merge. Nenhum push ou publicação externa foi solicitado.
