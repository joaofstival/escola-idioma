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

| Camada | Escolha | Motivo |
|---|---|---|
| App desktop | Electron 45, `contextIsolation`, `sandbox`, sem Node no renderer | segurança padrão |
| Linguagem | TypeScript 7 (strict, `erasableSyntaxOnly`), tipos compartilhados em `src/shared/types.ts` | contrato único main ↔ telas |
| Build | esbuild (`scripts/build.mjs`) → `dist/` | rápido, sem config pesada |
| Banco | **sql.js** (SQLite em WASM) persistido em `app.getPath('userData')/escola.db` | sem módulo nativo para recompilar |
| Comunicação | IPC `api:request` com **mini-roteador REST** no main (mesmos métodos/caminhos da seção 4) e `file:save` para exportar CSV | o contrato REST fica testável sem Electron |
| Integrações | Cotação: AwesomeAPI → fallback open.er-api; Tradução: MyMemory → fallback Google gtx → dicionário offline (ver `docs/pesquisa.md`) | definidas pelo agente de pesquisa |

```
escola-idioma/
  package.json  tsconfig.json  scripts/build.mjs
  src/shared/types.ts          (entidades, ApiRequest/ApiResponse, EscolaBridge, Avaliação)
  src/preload/preload.ts       (window.escola.request / saveFile)
  src/main/
    main.ts                    (BrowserWindow, IPC, --seed)
    db.ts                      (sql.js, schema, persistência)
    router.ts                  (roteador: method + path → handler; erros 404/422/500)
    seed.ts
    routes/*.ts                (um arquivo por recurso)
    services/*.ts              (cotacao, traducao, financeiro, avaliacao)
    **/*.test.ts               (node --test, banco em memória)
  src/renderer/
    index.html styles.css avaliacoes.css
    app.ts (roteador por hash)  api.ts (cliente IPC)  ui.ts (helpers)  page.ts (contrato de tela)
    pages/<tela>.ts            (uma tela por arquivo)
  docs/pesquisa.md   relatorio/
```

Comandos: `npm start` (build + abre o app), `npm run seed`, `npm test`, `npm run typecheck`.

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
