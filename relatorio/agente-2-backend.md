# Agente 2 — Backend (processo main)

## Parte 2/8

### Objetivo
Construir o núcleo do backend do app Electron: banco SQLite em WASM (sql.js) com o schema completo do PLANO, mini-roteador REST atendido via IPC, validação com 422, CRUD de idiomas, alunos, professores e turmas, seed de dados de exemplo, a janela Electron com IPC seguro e os testes `node --test`. A estrutura já está pronta para as partes 3 e 4.

### Arquivos criados (todos em `src/main/`)
| Arquivo | Conteúdo |
|---|---|
| `db.ts` | `openDb({file?, wasmPath?})`, schema completo (11 tabelas, FKs, CHECKs, UNIQUEs, índices), helpers `all/get/run/exec/transaction/persist/close`, `limparDados()`, função SQL `sem_acento()` |
| `router.ts` | `Router` (`add/get/post/put/delete`, `handle(req)`), `HttpError`, `ValidationError` (422), `NotFoundError` (404) |
| `validation.ts` | `Validador` (texto, email, numero, inteiro, data, enumeracao, booleano, listaIds; acumula detalhes e lança 422), `exigirCorpo`, `parseId`, `queryInt`, `queryBool`, `encontrado`, `hojeIso`, `dataIsoValida` |
| `app.ts` | `createApi(db)` monta o router com a lista `MODULOS` de recursos |
| `routes/idiomas.ts`, `routes/alunos.ts`, `routes/professores.ts`, `routes/turmas.ts` | Um arquivo por recurso, cada um exporta `register(router, db)` e helpers `buscarX()` reutilizáveis |
| `seed.ts` | `seed(db, {anoAtual?})` idempotente, `seedCadastros()`, `bancoVazio()`, dados exportados (`IDIOMAS`, `PROFESSORES`, `ALUNOS`, `TURMAS`) e o gancho `ETAPAS_EXTRAS` |
| `main.ts` | Janela Electron, banco em `userData/escola.db`, seed na primeira execução, `--seed`, IPC `api:request` e `file:save`, bloqueio de navegação |
| `test-helpers.ts` | `criarApiTeste()` (API sobre banco em memória) e `criarBase()` |
| `db.test.ts`, `router.test.ts`, `validation.test.ts`, `seed.test.ts`, `routes/{idiomas,alunos,professores,turmas}.test.ts` | Testes |

### Decisões técnicas
- **sql.js e persistência**: cada `run()`/`exec()` fora de transação grava o arquivo inteiro (`export()` → arquivo `.tmp` ao lado → `rename`), o que é atômico no mesmo sistema de arquivos. Dentro de `transaction()` a gravação acontece uma vez só, no COMMIT da transação externa. Transações aninhadas usam SAVEPOINT. Um banco novo em arquivo é gravado logo na abertura. Sem `file`, o banco fica só em memória.
- **Booleanos**: as colunas listadas em `BOOL_COLUMNS` (hoje só `ativo`) voltam como `boolean`. Parâmetros `true/false` viram 1/0 e `undefined` vira NULL. As partes seguintes podem acrescentar colunas ao conjunto.
- **Parâmetros nomeados**: aceitam objeto sem prefixo (`{ id }` vira `:id`).
- **Schema**: `PRAGMA foreign_keys=ON` e `PRAGMA user_version=1`. Os vínculos usam `ON DELETE RESTRICT`, e a API devolve 422 com mensagem clara antes de chegar a eles. As exceções são `professor_idiomas` (CASCADE quando o professor é excluído), `avaliacao_respostas` e `avaliacao_resposta_itens` (CASCADE a partir da avaliação ou da resposta). Outras regras no banco: nível entre 1 e 12, capacidade ≥ 1, `UNIQUE(nome, ano_letivo)` em turmas, `UNIQUE(aluno, turma, ano)` em matrículas, `UNIQUE(matricula_id, competencia)` em mensalidades, `UNIQUE(avaliacao_id, aluno_id)`, `json_valid(form)`, formato de `competencia`/`vencimento` por GLOB, mensalidade "paga" exige data e valor pagos, e documento do aluno único quando informado.
- **Roteador**: entre as rotas que casam, vence a com mais segmentos literais (assim `/matriculas/sugestoes-rematricula` ganha de `/matriculas/:id`). Rota inexistente dá 404; método errado num caminho existente dá 405. Erros de restrição do SQLite que escaparem viram 422; qualquer outro erro vira 500, com log. O status de sucesso é definido por rota (`{status: 201}` nas criações). Um `:id` malformado responde 404.
- **PUT parcial**: o corpo é mesclado sobre o registro atual e depois validado como um todo, então a tela pode mandar só os campos alterados.
- **Busca de alunos** sem acento e sem diferenciar maiúsculas, pela função SQL `sem_acento()` (nome e e-mail; documento e telefone por substring).
- **Regras extras de consistência** (todas com 422): não permite remover de um professor a habilitação de um idioma em que ele tem turmas; não permite alocar professor inativo; não permite reduzir a capacidade abaixo da ocupação; não permite trocar idioma ou ano letivo de turma com matrículas; não permite nome de turma repetido no mesmo ano.
- **main.ts**: ESM, com caminhos derivados de `import.meta.dirname` (dist/). O IPC só atende quadros cuja URL começa em `dist/renderer` e devolve 403 aos demais. `setWindowOpenHandler` nega tudo e abre http(s) com `shell.openExternal`. `will-navigate` bloqueia o que estiver fora do app e `will-attach-webview` é bloqueado. Há trava de instância única. `file:save` usa a pasta Documentos como padrão e acrescenta BOM UTF-8 em `.csv` para o Excel mostrar os acentos.
- **Seed**: 5 idiomas (R$ 290 a R$ 360), 6 professores (1 ou 2 idiomas cada), 25 alunos (10 estrangeiros: USD, EUR, ARS, CLP, JPY; 2 inativos), 21 turmas (8 no ano anterior e 13 no atual, níveis 1 a 4). Só popula banco vazio. `--seed` chama `limparDados()` e popula de novo.
- Nenhuma dependência nova foi instalada.

### Rotas implementadas
| Recurso | Rotas |
|---|---|
| Idiomas | `GET /idiomas`, `POST /idiomas` (201), `GET/PUT/DELETE /idiomas/:id` (DELETE responde 422 se houver turmas, materiais ou professores habilitados) |
| Alunos | `GET /alunos?busca=&ativo=`, `POST /alunos` (201), `GET/PUT/DELETE /alunos/:id` (DELETE responde 422 se houver matrículas, mensalidades ou respostas, sugerindo inativar) |
| Professores | `GET /professores?ativo=&idioma_id=`, `POST /professores` (201), `GET/PUT/DELETE /professores/:id`; corpo com `idiomas: number[]` (aceita também `{id}`), resposta com `idiomas: {id,nome}[]`; DELETE responde 422 se houver turmas |
| Turmas | `GET /turmas?ano=&idioma_id=&nivel=&professor_id=` (com `idioma_nome`, `professor_nome`, `ocupacao`), `POST /turmas` (201), `GET /turmas/:id` (acrescenta `alunos[]`), `PUT /turmas/:id`, `DELETE /turmas/:id` (422 se houver matrículas ou avaliações) |

Todas as exclusões bem-sucedidas devolvem `{ ok: true }`.

### Testes
`npm test`: **31 testes, 31 passaram, 0 falharam** (cerca de 0,3 s). Cobrem:
- schema, FKs e CHECKs; booleanos; `lastInsertRowid`/`changes`; rollback e transações aninhadas; busca sem acento;
- persistência em arquivo temporário (gravar, reabrir, ler, sem `.tmp` sobrando, `limparDados`);
- roteador (parâmetros, query, prioridade de rota literal, 404, 405, 422, 500 com log);
- validação;
- CRUD completo dos 4 recursos com os 404;
- os 422 pedidos (professor não habilitado, nível 0, 13, 1,5 e "abc", e-mail inválido, capacidade, duplicidades, exclusão com dependentes);
- filtros (`busca`, `ativo`, `ano`, `idioma_id`, `nivel`);
- seed (idempotência e regras de negócio).

Também passaram: `npm run typecheck` (sem erros) e `npm run build` (ok; `dist/main.js` com 57 KB).

**Electron**: o binário não está baixado (`node_modules/electron/dist` não existe), então a janela não foi aberta. Para compensar, fiz um teste de fumaça do `dist/main.js` compilado com um módulo `electron` falso. Ele confirmou que o banco é criado em `userData/escola.db`, que a seed roda na primeira execução e com `--seed`, as `webPreferences` (contextIsolation, sandbox, sem nodeIntegration, preload `dist/preload.cjs`), o carregamento de `dist/renderer/index.html`, que o IPC `api:request` responde 200 e que uma origem externa recebe 403.

### Mudanças em `src/shared/types.ts`
Nenhuma.

### Pendências para as partes 3 e 4
- **Parte 3**:
  - criar `routes/matriculas.ts`, `materiais.ts`, `mensalidades.ts` (financeiro), `dashboard.ts` e `services/financeiro.ts`, e incluí-los em `MODULOS` (`src/main/app.ts`);
  - implementar `GET /alunos/:id/historico` (pode ficar em `routes/alunos.ts` ou num módulo novo) e `GET /turmas/:id/materiais`;
  - na matrícula, respeitar a capacidade (a `ocupacao` já conta as matrículas ativas);
  - estender a seed com matrículas, materiais e mensalidades, empurrando funções para `ETAPAS_EXTRAS` em `seed.ts` (recebem `SeedContexto`, com os ids por nome e por `ano|turma`);
  - campos calculados da mensalidade (`atrasada`, `multa`, `juros`, `valor_atualizado`) conforme `docs/pesquisa.md`.
- **Parte 4**:
  - criar `services/cotacao.ts` e `services/traducao.ts` (cache, fallback, timeout de 5 s, 503 quando tudo falha) e `routes/{cotacao,traducao,avaliacoes}.ts`;
  - as tabelas de avaliações já existem; `travada` e `total_respostas` são calculados;
  - se precisar de cache persistente de traduções, acrescentar `traducoes_cache` ao `SCHEMA` com `CREATE TABLE IF NOT EXISTS` (migração compatível) e subir `SCHEMA_VERSION`.
- O delete de professor só é bloqueado por turmas. Se a parte 4 criar outro vínculo com professor, acrescentar a contagem correspondente.

## Parte 3/8

### Objetivo
Backend acadêmico e financeiro: matrículas e rematrículas com geração de mensalidades, materiais didáticos, mensalidades (pagar, estornar, atraso com multa e juros calculados), resumo financeiro, inadimplentes, histórico do aluno, painel, seed estendida e testes.

### Arquivos
| Arquivo | Conteúdo |
|---|---|
| `src/main/services/financeiro.ts` | Funções puras: `estaAtrasada`, `diasAtraso`, `calcularEncargos` (multa 2% + juros 1% a.m. pro rata die → `valor_atualizado`), `gerarParcelas`, `diasEntre`, `somarDias`, `arredondar`, `competenciasDoAno`. Relógio injetável: `hoje()` / `definirHoje(data \| fn \| null)` |
| `src/main/routes/matriculas.ts` | Rotas e helpers reutilizados pela seed: `matricular`, `rematricular`, `cancelarMatricula`, `gerarMensalidades`, `sugestoesRematricula`, `listarMatriculas`, `buscarMatricula`, `mensalidadesEmAtraso` |
| `src/main/routes/materiais.ts` | CRUD de materiais e `GET /turmas/:id/materiais` |
| `src/main/routes/mensalidades.ts` | `/mensalidades*` e `/financeiro/*`, com os helpers `listarMensalidades`, `pagarMensalidade`, `estornarMensalidade`, `resumoFinanceiro`, `listarInadimplentes` |
| `src/main/routes/historico.ts` | `GET /alunos/:id/historico` |
| `src/main/routes/dashboard.ts` | `GET /dashboard` |
| `src/main/seed-academico.ts` | Etapas `seedMatriculas` e `seedMateriais`, mais os dados (`MATRICULAS_ANTERIOR`, `REMATRICULAS`, `MATRICULAS_ATUAL`, `ATRASOS_*`, `CANCELAMENTOS`, `MATERIAIS`) |
| `src/main/app.ts` | `MODULOS` passa a incluir matriculas, materiais, mensalidades, historico e dashboard |
| `src/main/seed.ts` | `ETAPAS_EXTRAS = [seedMatriculas, seedMateriais]` |
| Testes | `services/financeiro.test.ts`, `routes/matriculas.test.ts`, `routes/mensalidades.test.ts`, `routes/materiais.test.ts`; `seed.test.ts` ganhou um teste |

### Rotas
| Recurso | Rotas |
|---|---|
| Matrículas | `GET /matriculas?ano=&turma_id=&aluno_id=&status=&idioma_id=` (com `aluno_nome`, `turma_nome`, `idioma_id`, `idioma_nome`, `nivel`), `GET /matriculas/:id`, `POST /matriculas` (201), `POST /matriculas/rematricula` (201), `PUT /matriculas/:id/cancelar`, `GET /matriculas/sugestoes-rematricula?ano=` |
| Materiais | `GET /materiais?idioma_id=&nivel=&busca=&tipo=`, `POST /materiais` (201), `GET/PUT/DELETE /materiais/:id`, `GET /turmas/:id/materiais` |
| Financeiro | `GET /mensalidades?status=pendente\|paga\|atrasada\|cancelada&aluno_id=&competencia=&ano=&matricula_id=`, `GET /mensalidades/:id`, `POST /mensalidades/:id/pagar`, `POST /mensalidades/:id/estornar`, `GET /financeiro/resumo?ano=`, `GET /financeiro/inadimplentes` |
| Aluno | `GET /alunos/:id/historico` → `HistoricoAluno` |
| Painel | `GET /dashboard` → `Dashboard` |

### Regras implementadas
- **Matrícula**:
  - todas as falhas abaixo respondem 422: aluno inexistente ou inativo, turma inexistente, `ano_letivo` diferente do da turma (o ano é opcional e, se omitido, vem da turma), data da matrícula posterior ao ano letivo, turma lotada (`ocupacao >= capacidade`), aluno já com matrícula **ativa** no mesmo idioma e ano, e turma já concluída por ele naquele ano;
  - `data` é opcional e, se omitida, vale hoje;
  - se houver uma matrícula **cancelada** do aluno na mesma turma e ano, ela é reativada, porque o UNIQUE impede uma segunda linha; as mensalidades canceladas voltam para pendente.
- **Mensalidades geradas**:
  - uma por mês, do mês da matrícula até dezembro, com o `idiomas.mensalidade` vigente e vencimento no dia 10;
  - seguindo a pesquisa, quando a matrícula é feita **depois** do dia 10, a 1ª parcela vence na data da matrícula + 5 dias, para não nascer atrasada;
  - se o ano letivo é posterior ao da data (rematrícula antecipada), a geração começa em janeiro;
  - a resposta traz `mensalidades_geradas`.
- **Rematrícula**:
  - responde 422 se o aluno tem qualquer mensalidade pendente vencida, listando as competências em `detalhes` (Lei 9.870/99, art. 5º);
  - exige matrícula ativa ou concluída no ano anterior no mesmo idioma; sem ela, responde 422 e orienta a usar a matrícula comum;
  - cria a nova matrícula com tipo `rematricula` e põe a anterior como `concluida`, tudo na mesma transação;
  - a resposta traz `matricula_anterior_id`.
- **Cancelamento**:
  - só vale para matrícula ativa; nos demais casos responde 422;
  - cancela as mensalidades pendentes com `vencimento > hoje`; as vencidas e as pagas continuam como estão;
  - a resposta traz `mensalidades_canceladas`.
- **Sugestões de rematrícula**:
  - entram alunos **ativos** com matrícula ativa ou concluída no ano anterior que ainda não têm matrícula (salvo cancelada) no ano pedido naquele idioma;
  - se houver mais de uma por idioma, vale a de maior nível;
  - `nivel_sugerido = min(nivel + 1, 12)`, e `turmas_sugeridas` traz as turmas do ano, idioma e nível sugerido que ainda têm vaga;
  - o campo `inadimplente` avisa que a rematrícula será recusada.
- **Atraso e encargos** (nunca gravados):
  - atrasada = `pendente` e `vencimento < hoje`;
  - `multa = 2%`, `juros = valor × 1% × dias/30`, `valor_atualizado = valor + multa + juros`, cada parte arredondada a 2 casas;
  - pagas e canceladas ficam com encargos zerados.
- **Filtro `status`**:
  - `pendente` traz **todas** as pendentes, inclusive as atrasadas; `atrasada` é o subconjunto vencido;
  - cada linha traz `atrasada` para a tela separar.
- **Pagar**:
  - responde 422 se a mensalidade já está paga ou cancelada;
  - `forma_pagamento` é obrigatória (texto livre de até 40 caracteres; a seed usa `pix`, `boleto`, `cartao_credito`, `cartao_debito`, `dinheiro` e `transferencia`);
  - `data_pagamento` tem padrão hoje e não pode ser futura;
  - sem `valor_pago`, grava o `valor_atualizado` **na data do pagamento**; `valor_pago` aceita vírgula decimal;
  - **Estornar** só funciona em mensalidade paga: volta para pendente e limpa os campos de pagamento.
- **Resumo** (`ano` padrão = ano de hoje; usa a competência do ano):
  - `recebido` = soma de `valor_pago`;
  - `a_receber` = pendentes ainda não vencidas; `em_atraso` = pendentes vencidas, pelo valor original;
  - `por_mes` tem sempre 12 meses: `previsto` = não canceladas, `recebido` = soma de `valor_pago`;
  - `alunos_inadimplentes` traz os atrasos das competências desse ano.
- **Inadimplentes**:
  - considera todos os anos, ordenados pelo total em atraso;
  - cada item traz `email`, `telefone`, `qtd`, `total`, `total_atualizado`, `vencimento_mais_antigo`, `dias_max_atraso` e `acima_90_dias` (prazo a partir do qual a lei admite cobrança).
- **Histórico do aluno**: o resumo traz `pago` (soma de `valor_pago`), `pendente` (a vencer) e `atrasado` (vencidas, pelo valor original).
- **Painel**:
  - `receita_mes` = soma de `valor_pago` com `data_pagamento` no mês corrente;
  - `a_receber_mes` = pendentes com competência no mês corrente;
  - `matriculas_ano` = matrículas ativas no ano;
  - `inadimplentes` = número de alunos com atraso.
- **Materiais**:
  - `tipo` restrito ao enum, nível inteiro de 1 a 12 e idioma existente; caso contrário, 422;
  - o tipo `link` exige referência `http(s)://`;
  - a `busca` ignora acentos e procura em título, autor e descrição; filtro `tipo` ou `nivel` inválido responde 422.
- **Seed** (via `ETAPAS_EXTRAS`, usando as mesmas funções das rotas: `matricular`, `rematricular`, `pagarMensalidade`, `cancelarMatricula`):
  - **ano anterior**: 14 matrículas; tudo pago, exceto novembro e dezembro de Mateo González (atraso de mais de 90 dias); depois todas ficam `concluida`;
  - **rematrículas**: 10 para o ano atual, com nível + 1;
  - **ano atual**: 11 matrículas novas, uma delas em agosto, depois do dia 10; 1 cancelamento (Paula Moreira);
  - **pagamentos**: mensalidades vencidas pagas, parte com atraso e multa;
  - **inadimplentes**: Marcelo Pires, Valentina López e Emily Johnson;
  - **sugestões de rematrícula**: John Smith, Sophie Martin, Martina Rossi e Mateo González (este marcado como inadimplente);
  - **materiais**: 20 no total, de 3 a 5 por idioma, em níveis de 1 a 5;
  - o "hoje" da seed é a data real limitada ao ano `anoAtual`.

### Adições em `src/shared/types.ts` (todas opcionais ou novas, compatíveis)
- `Matricula`: `idioma_id?`, `mensalidades_geradas?`, `mensalidades_canceladas?`.
- `SugestaoRematricula`: `inadimplente?`.
- `Mensalidade`: `turma_nome?`.
- Novo `Inadimplente`, formato de `GET /financeiro/inadimplentes`.

### Testes
`npm test`: **49 testes, 49 passaram, 0 falharam**: os 31 da parte 2 e 18 novos.
- `services/financeiro` (5): datas, atraso no dia do vencimento, multa e juros (30 dias, 15 dias, 1 dia, paga), parcelas proporcionais (mês da matrícula, depois do dia 10, ano seguinte, data inválida) e relógio.
- `matriculas` (7): geração proporcional e valor do idioma, filtros e 404, capacidade, aluno inativo, ano diferente, data posterior, duplicidade por idioma e ano, cancelamento (pendentes futuras canceladas, vencidas e pagas mantidas, reativação na mesma turma), rematrícula (conclui a anterior, 12 parcelas, exige vínculo), bloqueio por atraso e liberação após pagar, sugestões (nível + 1, teto 12, turma lotada fora, cancelada e inativo fora, `inadimplente`).
- `mensalidades` (3): campos calculados e filtros; pagar com valor atualizado, no vencimento e com valor informado; 422 já paga, cancelada, sem forma ou com data futura; estornar; resumo, inadimplentes, histórico e painel conferidos valor a valor.
- `materiais` (2): CRUD, filtros, busca sem acento, validações e materiais da turma.
- `seed` (+1): contagens, regra de geração, pagamentos com encargos, inadimplentes, sugestões e materiais.

Também passaram: `npm run typecheck` (sem erros) e `npm run build` (`dist/main.js` com 94 KB).

### Pendências para a parte 4
- Criar `services/cotacao.ts` e `services/traducao.ts`, `routes/{cotacao,traducao,avaliacoes}.ts` e registrá-los em `MODULOS`.
- A seed de avaliações entra como nova etapa em `ETAPAS_EXTRAS`; já existem turmas com alunos ativos no ano atual para gerar respostas.
- A conversão da mensalidade para a moeda do aluno (`moeda_origem`) pode reaproveitar `GET /mensalidades?aluno_id=` e `valor_atualizado`.
- Valores fixos em `services/financeiro.ts`: dia de vencimento 10, multa de 2% e juros de 1% a.m. Se for preciso torná-los configuráveis, criar uma tabela de configurações (migração `CREATE TABLE IF NOT EXISTS` e `SCHEMA_VERSION` 2).
- Nos testes de rota, `definirHoje()` é global por processo; o `node --test` roda cada arquivo num processo, então não há interferência entre arquivos.

## Parte 4/8

### Objetivo
Integrações externas (cotação e tradução, com cache, fallback e timeout, testáveis sem internet) e o módulo de avaliações configuráveis (validação do formulário, modelos prontos, trava, duplicar, respostas com nota, resultados e CSV), com seed e testes.

### Arquivos
| Arquivo | Conteúdo |
|---|---|
| `src/main/services/http.ts` | `FetchFn` (fetch injetável), `obterJson()` com timeout de 5 s (aborta e rejeita mesmo que o fetch ignore o sinal), `FalhaExterna` |
| `src/main/services/cotacao.ts` | `ServicoCotacao({fetch, agora, timeoutMs})`: `cotacoes(moedas)` e `converter(valor, de, para)`, mais `lerMoedas()`, `MOEDAS_PADRAO` e `NOMES_MOEDAS` |
| `src/main/services/traducao.ts` | `ServicoTraducao({fetch, agora, timeoutMs, email})`: `traduzir()` e `validarPedido()` |
| `src/main/data/dicionario.ts` | Dicionário offline com 104 entradas em pt/en/es/fr/de/it (escola, cotidiano, expressões, números, cores, dias e meses) e `consultarDicionario()`, que ignora maiúsculas e acentos e aceita qualquer par entre os 6 idiomas |
| `src/main/services/avaliacao.ts` | Funções puras: `validarForm`, `validarRespostas` (itens + nota), `montarAnswers`, `calcularResultados`, `gerarCsv`, `celulaCsv`, `nomeArquivoCsv` |
| `src/main/data/modelos-avaliacao.ts` | `MODELOS_AVALIACAO` (4 modelos), `OPCOES_PRONTAS` (Excelente→Precisa melhorar, Concordo→Discordo, Sempre→Nunca, Sim/Não) e `COMPETENCIAS` |
| `src/main/routes/cotacao.ts`, `routes/traducao.ts` | Rotas. `criarRotasCotacao(servico)` e `criarRotasTraducao(servico)` permitem injetar serviços com fetch falso; o app usa as instâncias `servicoCotacao` e `servicoTraducao` |
| `src/main/routes/avaliacoes.ts` | Rotas e helpers reutilizados pela seed: `criarAvaliacao`, `responderAvaliacao`, `listarRespostas`, `resultadosAvaliacao`, `exportarAvaliacao` |
| `src/main/seed-avaliacoes.ts` | Etapa `seedAvaliacoes` (registrada em `ETAPAS_EXTRAS`) |
| `src/main/services/fetch-falso.ts` | Fetch falso dos testes (não entra no bundle) |
| `src/main/app.ts` | `MODULOS` passa a incluir cotacao, traducao e avaliacoes: todos os recursos da seção 4 |
| Testes | `services/{cotacao,traducao,avaliacao}.test.ts`, `routes/avaliacoes.test.ts`; `seed.test.ts` ganhou um teste |

### Rotas
| Recurso | Rotas |
|---|---|
| Cotação | `GET /cotacao?moedas=USD,EUR` (sem `moedas`, usa as padrão USD, EUR, GBP, ARS, CLP, JPY, CAD, CHF, CNY e PYG) → `CotacaoResposta`; `GET /cotacao/converter?valor=&de=&para=` → `Conversao` (`de` padrão BRL; `valor` aceita vírgula) |
| Tradução | `GET /traducao?texto=&de=&para=` → `Traducao` (`de` padrão pt) |
| Avaliações | `GET /avaliacoes?turma_id=`, `GET /avaliacoes/modelos`, `POST /avaliacoes` (201; aceita `form` ou `modelo_id`), `GET/PUT/DELETE /avaliacoes/:id`, `POST /avaliacoes/:id/duplicar` (201; corpo opcional `{turma_id?, titulo?}`), `POST /avaliacoes/:id/respostas` (201), `GET /avaliacoes/:id/respostas`, `GET /avaliacoes/:id/resultados`, `GET /avaliacoes/:id/exportar` → `{nome_arquivo, csv}` |

### Regras implementadas
- **Cotação**:
  - **Fontes**:
    - a AwesomeAPI é consultada num único lote (`/json/last/USD-BRL,EUR-BRL`);
    - se o lote vier com 404 `CoinNotExists` (um par inválido derruba o lote), a consulta é refeita **par a par**, para que uma moeda inválida não derrube as outras;
    - o que não se resolve vai para o open.er-api (`valor_em_brl = 1/rates.X`, `variacao_pct = null`).
  - **Cache**:
    - em memória, por moeda, com TTL de 1 h;
    - se as duas fontes falharem, usa o cache vencido de até 72 h, marcado com `desatualizada: true` na cotação e na resposta.
  - **Respostas com problema**:
    - moedas que nenhuma fonte reconhece vão para `invalidas[]`; se todas as pedidas forem inválidas, 422;
    - moedas sem fonte e sem cache vão para `indisponiveis[]`; se nada se resolver, 503 com a mensagem da pesquisa.
  - **Validação**: código ISO de 3 letras (senão 422), sem duplicatas, no máximo 30 moedas.
  - **Campos e datas**:
    - BRL vale sempre 1 (`fonte: 'fixo'`);
    - `fonte` lista as fontes usadas, separadas por vírgula;
    - `data` é a mais recente entre as cotações; o `create_date` da AwesomeAPI vira ISO com -03:00.
  - **Conversão**:
    - cruza por BRL: `taxa = brl(de)/brl(para)`;
    - `resultado` com 4 casas e `taxa` com 8;
    - responde 422 se o valor não for número ou for negativo, ou se a moeda for inválida ou inexistente;
    - responde 503 se uma das moedas estiver indisponível.
- **Tradução**:
  - **Ordem das fontes**: cache em memória (30 dias, chave `de|para|texto` em minúsculas, até 5.000 entradas, `fonte: 'cache'`) → MyMemory → Google gtx → dicionário offline → 503 com a mensagem da pesquisa.
  - **MyMemory**:
    - só aceita `responseStatus === 200` e `quotaFinished !== true`;
    - descarta "MYMEMORY WARNING" e HTTP 429;
    - `MYMEMORY_EMAIL` (variável de ambiente) entra como `&de=`;
    - devolve até 3 `alternativas` tiradas de `matches`.
  - **Google gtx**: junta os segmentos de `json[0]`.
  - **Dicionário**: o resultado não vai para o cache, para que a API volte a ser consultada quando sair do ar.
  - **Validação** (senão 422):
    - texto obrigatório e com até 500 **bytes** em UTF-8;
    - `de` e `para` entre pt, en, es, fr, it, de, ja e zh.
  - **Mesmo idioma**: devolve o próprio texto com `fonte: 'original'`, sem acessar a rede.
- **Avaliações: formulário**. A validação devolve 422 com todos os `detalhes`:
  - **Estrutura**:
    - de 1 a 20 perguntas, pelo menos 1 obrigatória;
    - ids de pergunta únicos, e ids únicos de opção e de linha dentro da pergunta;
    - tipo entre os 5 e título obrigatório (até 300 caracteres).
  - **Opções e escala**:
    - de 2 a 10 opções em single, multiple e grid, e de 1 a 10 linhas na grid;
    - escala 1–5, 1–10 ou 0–10, com `style` stars ou numbers.
  - **Campos que dependem do tipo**:
    - `countsInScore` só em single, rating e grid, e exige `points` (0 a 10) em todas as opções, para a nota ser calculável;
    - `askReason` só em single e rating;
    - `reasonOn` só com ids de opções existentes; `reasonOnMax` dentro da escala;
    - `maxChoices` de 1 ao número de opções; `maxChars` de 1 a 5.000;
    - o id de opção `other` é reservado para o "Outro" de múltipla escolha com `allowOther`.
  - O form é **normalizado** (campos que não se aplicam ao tipo são descartados) e gravado assim.
- **Modelos prontos** (todos passam na validação):
  - Padrão: nota de 1 a 10 + comentário;
  - Avaliação de nível do aluno: grade com as 6 competências e opções Excelente/Bom/Regular/Precisa melhorar = 10/7,5/5/2,5; recomendação com porquê ao "repetir"; observações;
  - Feedback do aluno sobre a turma;
  - Autoavaliação.
- **Trava**:
  - com respostas, o PUT só altera título e descrição. Mudar `form` (comparado depois de normalizado), `turma_id` ou `modelo_id` devolve 422 "Avaliação travada: já possui respostas. Duplique para alterar."; reenviar o mesmo form é aceito;
  - DELETE com respostas responde 422;
  - duplicar cria "Cópia de <título>", sem respostas.
- **Respostas**:
  - o aluno precisa ter matrícula **ativa** na turma e responder uma vez só; senão, 422;
  - **validação**:
    - pergunta inexistente ou respondida duas vezes;
    - obrigatórias respondidas; na grade obrigatória, todas as linhas;
    - opção existente, `maxChoices` e "Outro" com texto;
    - nota inteira dentro da escala e `maxChars` respeitado;
  - **porquê**: guardado só quando pedido (opção em `reasonOn`, ou `reasonOn` vazio; nota ≤ `reasonOnMax`, ou null) e descartado nos outros casos; é obrigatório quando pedido em pergunta obrigatória;
  - **gravação**: uma linha por valor em `avaliacao_resposta_itens`; a multiple gera uma linha por opção;
  - **nota**: média 0–10 das perguntas com `countsInScore`; rating = `(v-min)/(max-min)*10`, single = pontos da opção, grid = média dos pontos das linhas; null se nenhuma conta; gravada em `avaliacao_respostas.score`.
- **Resultados**:
  - contagem e % por opção (multiple inclui "Outro"; o % é sobre quem respondeu);
  - em rating, média na escala original e distribuição valor a valor;
  - na grade, contagem por linha e `media` por linha (pontos); campo opcional novo;
  - `textos` traz as respostas abertas, os porquês e os textos de "Outro"; também há `com_porque`, `respostas` e `nota_media` (média dos scores).
- **CSV**:
  - layout:
    - separador `;` e linhas terminadas em `\r\n`;
    - colunas Aluno, Data (dd/mm/aaaa hh:mm) e Nota;
    - uma coluna por pergunta (na grade, uma por linha) e uma "(porquê)" para cada pergunta com `askReason`;
  - formatação e escape:
    - números com vírgula decimal (Excel pt-BR);
    - células com `;`, aspas ou quebra de linha ficam entre aspas, com as aspas duplicadas;
    - textos que começam com `= + - @` ganham `'`, para não virarem fórmula;
  - o nome do arquivo segue o formato `avaliacao-<id>-<slug>.csv`. O BOM é acrescentado pelo `file:save` do main.
- **Seed**:
  - "Avaliação de nível - Inglês 1 - Manhã (ano atual)", feita a partir do modelo `nivel`, com respostas de João Pedro, Larissa e Valentina; a de Valentina pede "repetir", com porquê;
  - "Feedback da turma - Espanhol 1 - Tarde", feita a partir do modelo `feedback`, sem respostas e editável.

### Adições em `src/shared/types.ts` (opcionais ou novas, compatíveis)
- `Cotacao`: `variacao_pct?`, `fonte?`, `desatualizada?`.
- `CotacaoResposta`: `desatualizada?`, `invalidas?`, `indisponiveis?`.
- `Conversao`: `desatualizada?`.
- `ResultadoPergunta.linhas[]`: `media?`.
- Novo `ExportacaoCsv { nome_arquivo, csv }`.

### Testes
`npm test`: **78 testes, 78 passaram, 0 falharam**: 49 das partes anteriores e 29 novos. Nenhum acessa a internet; todos usam fetch falso.
- `cotacao` (7):
  - validação 422;
  - AwesomeAPI em lote e cache de 1 h;
  - moeda inválida isolada par a par (`invalidas`, 422 quando todas são inválidas);
  - fallback para o er-api (1/rates) por falha ou moeda ausente;
  - timeout real de 50 ms;
  - cache vencido com `desatualizada` até 72 h e 503 depois disso;
  - rotas de cotação e conversão (200, 422 e 503).
- `traducao` (6):
  - 422 (vazio, 500 bytes contados em bytes, idioma);
  - MyMemory com e-mail, cache de 30 dias e vencimento;
  - 6 formas de falha do MyMemory (403 disfarçado, cota, warning, 429, erro de rede, timeout) caindo no Google;
  - dicionário em qualquer par e 503;
  - mesmo idioma sem rede;
  - rota.
- `avaliacao` (11): cada regra de validação do form, modelos válidos e normalização, respostas (todas as regras), nota, resultados e CSV com escape.
- `avaliacoes` (4): CRUD e modelos, respostas (matrícula ativa, duplicidade, 422 e nota), trava, DELETE, duplicar, resultados e exportação.
- `seed` (+1): avaliação com respostas e avaliação livre.

Também passaram: `npm run typecheck` (sem erros) e `npm run build` (`dist/main.js` com 161 KB).

**Teste manual com a rede real**, feito uma vez fora da suíte:
- **Cotação**: a AwesomeAPI devolveu USD 5,7838, EUR 6,3616 e PYG 0,000889, e `XYZ` foi para `invalidas`.
- **Tradução**: o MyMemory devolveu `livro` → "book". Para `bom dia` (pt→es), devolveu "buen jim", e "Buenos días" veio só em `alternativas`. É o problema de qualidade já apontado na pesquisa, e a tela pode exibir as alternativas.

### Pendências para as próximas partes
- **Frontend**:
  - **Exportar**: chamar `GET /avaliacoes/:id/exportar` e depois `window.escola.saveFile(nome_arquivo, csv)`.
  - **Cotação**: na tela, mostrar a atribuição "Rates By Exchange Rate API" quando `fonte` incluir `exchangerate-api`, e avisar quando `desatualizada` for true.
  - **Avaliações**: o id `other` identifica o "Outro" da múltipla escolha. As respostas de multiple usam `option_ids` + `value_text`, e as de grade usam uma `Answer` por linha (`row_id` + `option_id`).
- **Cache de tradução**: fica só em memória e se perde ao fechar o app. Se for preciso persistir, criar a tabela `traducoes_cache` (`CREATE TABLE IF NOT EXISTS`, `SCHEMA_VERSION` 2).
