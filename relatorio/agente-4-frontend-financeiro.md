# Agente 4 — Frontend: Financeiro e Ferramentas

## Parte 6/8

### Objetivo
Substituir a tela provisória `src/renderer/pages/financeiro.ts` ("Mensalidades") pela tela completa do financeiro. Ela consome as rotas `/mensalidades*` e `/financeiro/*` da parte 3 e usa só `api` (api.ts) e os helpers de ui.ts. Os estilos ficam em `src/renderer/avaliacoes.css`, na seção `/* === Financeiro (agente 4) === */`, com prefixo `fin-`.

### Funcionalidades
- **Resumo do ano** (`GET /financeiro/resumo?ano=`):
  - seletor de ano;
  - KPIs: recebido (com % do previsto), a receber e em atraso (com o nº de alunos e o atalho "ver atrasadas").
- **Gráfico previsto × recebido** por mês:
  - feito em HTML/CSS puro, com escala "redonda" (passos 1/2/2,5/5 × 10ⁿ) e rótulos compactos ("R$ 6 mil");
  - legenda, mês atual em destaque e tooltip com os valores;
  - cores vindas dos tokens (`--brand` e `--ink-3`), legíveis no tema claro e no escuro;
  - clicar num mês filtra a tabela pela competência; clicar de novo desfaz o filtro.
- **Abas** Mensalidades / Inadimplentes, com contador.
- **Filtros:**
  - status em botões segmentados: todas, pendentes, pagas, atrasadas e canceladas;
  - aluno (select), ano (inclui "Todos") e competência (mês);
  - a tela lê `?status=`, `aluno_id`, `ano`, `mes` e `aba` da URL, o que respeita `#/financeiro?status=atrasada`; valores inválidos são ignorados;
  - a URL é atualizada com `history.replaceState`, sem recriar a tela, e fica compartilhável;
  - "Limpar filtros".
- **Tabela de mensalidades:**
  - colunas: aluno (link `#/alunos/:id`), idioma/turma, competência/vencimento, valor, status e valor atualizado, com rodapé de totais (canceladas ficam fora);
  - status em pílula: pendente, paga (com data e forma), cancelada e "Atrasada · X dias" (laranja; vermelha acima de 90 dias);
  - o valor atualizado, quando atrasada, aparece em vermelho com "+R$ x encargos"; o tooltip mostra a conta: original + multa de 2% + juros de 1% a.m. pro rata (dias ÷ 30).
- **Registrar pagamento** (modal):
  - valor pré-preenchido com `valor_atualizado`;
  - data (padrão hoje, `max` hoje) e forma de pagamento em chips: PIX, Cartão, Boleto, Dinheiro e Transferência;
  - ao mudar a data, o valor sugerido e o detalhamento de multa e juros são recalculados com a mesma regra do main; se o usuário editar o valor, aparece "Usar R$ x" para voltar à sugestão;
  - a validação local e os 422 do servidor aparecem via `showError`, e o modal continua aberto;
  - depois de salvar: toast com "Desfazer" (estorna).
- **Estornar:** `confirmDialog` de perigo e depois toast.
- **Atualização:** depois de cada ação, recarrega resumo, tabela e inadimplentes.
- **Inadimplentes** (`GET /financeiro/inadimplentes`):
  - colunas: aluno, contato, parcelas, total original e total atualizado;
  - atraso máximo com "desde dd/mm/aaaa" e marcação de "+90 dias" (Lei 9.870/99);
  - ações: "Ver parcelas" (filtra a tabela por aluno + atrasadas em todos os anos) e "Histórico" (`#/alunos/:id`).
- **Exportar CSV** da tabela filtrada com `api.saveFile('mensalidades.csv', csv)`:
  - separador `;`, decimais com vírgula e CRLF;
  - aspas duplicadas e campos com `;`, `"` ou quebra de linha entre aspas;
  - prefixo `'` contra injeção de fórmula (`= + - @`).
- **Estados:**
  - "Carregando…" na primeira carga;
  - vazio com "Limpar filtros";
  - erro por seção com "Tentar novamente" e `showError`;
  - `aria-busy`.
- **Concorrência:** um contador de sequência descarta respostas antigas quando os filtros mudam rápido.

### Decisões
- O ano do resumo e o ano do filtro da tabela são separados, porque os inadimplentes incluem anos anteriores (ex.: Mateo, 2025). Trocar o ano do resumo leva o filtro junto.
- Competência e vencimento ficam numa coluna só (vencimento em segunda linha), e a "data mais antiga" dos inadimplentes foi para dentro da célula de atraso. Assim as tabelas cabem em 1280 px sem rolagem; em 960 px a tabela rola na horizontal dentro do card (`min-width: 800px`).
- Formas de pagamento gravadas como `pix | cartao | boleto | dinheiro | transferencia`. As formas da seed (`cartao_credito`, `cartao_debito`) também têm rótulo.
- A data "hoje" é a local, não a UTC de `today()`, porque o main valida "não futura" pela data local.
- Não editei nenhum outro arquivo.

### Verificação
- `npm run typecheck`: sem erros. `npm run build`: "build ok".
- Capturas oficiais (`ESCOLA_ROTAS="financeiro,financeiro?status=atrasada"`) em `/private/tmp/claude-501/-Users-joaopedrofadelstival-Projetos-escola-idioma/cb196cb7-f6da-49f1-9faf-722e8813af41/scratchpad/agente4/shots/`. O sistema estava em tema escuro.
- Driver auxiliar no scratchpad (`agente4/driver/driver.mjs`, que carrega o `dist/main.js` real, força o tema com `nativeTheme` e executa passos):
  - capturas no tema claro e no escuro, a 1280 e a 960 px;
  - modal de pagamento, inclusive a mudança de data, que recalculou para 52 dias e R$ 300,83;
  - aba Inadimplentes, "Ver parcelas", clique no mês do gráfico e confirmação de estorno.
- Fluxo real testado no banco de scratch:
  - pagamento registrado ("Pagamento de R$ 302,28 registrado — Marcelo Pires, 09/2026", com Desfazer);
  - data futura bloqueada com mensagem;
  - estorno reduziu as pagas de 205 para 204;
  - KPIs e contador de inadimplentes atualizados.
- Correções feitas a partir das capturas:
  1. A tabela cortava a coluna de ações a 1280 px: juntei competência e vencimento, mudei o texto para "encargos" e reduzi o padding.
  2. "Exportar CSV" caía sozinho numa segunda linha: foi para a barra de abas e só aparece na aba Mensalidades.
  3. Os rótulos visíveis "Aluno" e "Competência" saíram (ficaram `sr-only`/`title`), para os filtros caberem numa linha.
  4. A tabela de inadimplentes cortava "Histórico": a coluna "Mais antiga" foi para dentro da célula de atraso.
  5. Testei nomes sem quebra de linha, mas eles empurravam as ações para fora; voltei a permitir a quebra.

### Pendências
- A exportação não foi testada até o diálogo nativo de salvar, porque ele exige interação. O CSV é gerado por `gerarCsv()` (exportada no módulo).
- Não há paginação: com o volume atual (cerca de 300 linhas por ano) não faz falta.
- As telas de Cotação, Tradutor e Avaliações ficam para a parte 7.

### Revisão do orquestrador (correções pós-entrega)
1. **Coluna de ações cortada a 1280 px**:
   - na tabela, o botão virou "Pagar" (com `title` e `aria-label` "Registrar pagamento de <aluno> (<competência>)");
   - "Estornar" virou um botão-link discreto (cinza; vermelho no hover);
   - o nome do aluno fica em uma linha com reticências (`max-width: 160px`, nome completo no `title`);
   - nos inadimplentes, "Histórico" virou link e "acima de 90 dias" foi para uma linha própria;
   - conferido no próprio app: `scrollWidth === clientWidth` (990 px) nas duas tabelas, ou seja, sem rolagem horizontal a 1280 px.
2. **Contagem divergente (KPI "4 alunos" × badge 5)**: a causa é a diferença de escopo entre as duas fontes, e o backend está correto.
   - O `alunos_inadimplentes` de `GET /financeiro/resumo?ano=` considera só as competências do ano escolhido. O `GET /financeiro/inadimplentes` considera todos os anos letivos.
   - Mateo González só tem atrasos de 2025, por isso entra na aba (5) e não no KPI de 2026 (4).
   - Rótulos agora explícitos: o KPI diz "4 alunos em 2026", o badge tem o tooltip "5 alunos com atraso (todos os anos letivos)" e a aba abre com "5 alunos (todos os anos letivos) — o KPI 'Em atraso' do resumo conta só as competências do ano escolhido".
- Refeitos: `npm run typecheck` sem erros, `npm run build` ok, capturas oficiais e capturas do driver (tema claro e escuro, aba Inadimplentes) conferidas com Read.
