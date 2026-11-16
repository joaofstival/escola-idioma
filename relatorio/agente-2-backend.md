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
