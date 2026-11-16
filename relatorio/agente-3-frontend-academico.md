# Agente 3 — Frontend Acadêmico

Arquivos alterados: `src/renderer/pages/{dashboard,idiomas,alunos,professores,turmas,matriculas,materiais}.ts` e a seção `/* === Telas acadêmicas (agente 3) === */` no fim de `src/renderer/styles.css` (classes com prefixo `ac-`). Nenhum outro arquivo foi tocado.

## Parte 5/8

### Objetivo
Substituir as telas provisórias de Painel, Idiomas e valores, Alunos (com histórico), Professores e Turmas por telas completas, ligadas às rotas reais do backend. Cada tela tem estados de carregando, vazio e erro (com "Tentar novamente"), e os erros 422 aparecem com `showError`.

### Telas e funcionalidades
- **Painel** (`#/dashboard`)
  - KPIs de `GET /dashboard`: alunos ativos (e professores ativos), turmas do ano (e matrículas ativas), receita do mês (e valor a receber) e inadimplentes. Cada cartão é um link para a tela correspondente; o de inadimplentes fica vermelho quando há atraso.
  - Atalhos "Nova matrícula" (`#/matriculas?aba=nova`) e "Ver inadimplentes" (`#/financeiro?status=atrasada`).
  - Lista curta de `GET /financeiro/inadimplentes` com até 6 alunos: parcelas, maior atraso, total atualizado e a pílula "+90 dias".
  - Turmas do ano, cada uma com barra de ocupação.
  - As duas listas carregam com `Promise.allSettled`, então a falha de uma não derruba a tela.
- **Idiomas e valores**
  - Faixa de destaque: "Valor fixo usado nas mensalidades".
  - Tabela com nome, código, mensalidade (em destaque) e valor anual. Os números ficam alinhados à direita.
  - Criar e editar em modal. O modal avisa que mudar o valor só afeta as matrículas futuras.
  - Excluir pede confirmação; o 422 do backend é exibido.
- **Alunos**
  - Busca com debounce de 300 ms, que descarta respostas antigas. Filtro ativos/inativos/todos.
  - Tabela com e-mail, documento, telefone, origem (país e pílula da moeda quando não é BRL) e situação.
  - Modal com todos os campos, inclusive país de origem e moeda de origem (select com BRL, USD, EUR, GBP, ARS, CLP, JPY, CAD, CHF, CNY e PYG). Inativar e reativar.
  - **Detalhe `#/alunos/:id`** (`GET /alunos/:id/historico`):
    - dados pessoais;
    - resumo pago / a vencer / em atraso;
    - matrículas com ano, idioma, turma, `nivel()`, tipo e situação;
    - mensalidades com competência, vencimento, valor, valor pago ou atualizado (multa e juros no tooltip) e situação (paga em, a vencer, atrasada com N dias).
  - **Aluno estrangeiro**:
    - uma única chamada a `GET /cotacao/converter?valor=1&de=BRL&para=XXX` traz a taxa, aplicada a cada mensalidade (coluna "Em USD", por exemplo) e ao resumo (≈ US$ …);
    - mostra a cotação, a fonte, a data e a marca "desatualizada" quando for o caso;
    - se a cotação falhar, aparece um aviso discreto ("Cotação … indisponível; valores somente em BRL") e a tela continua funcionando.
- **Professores**
  - Filtros por situação e idioma.
  - Tabela com chips dos idiomas habilitados.
  - Modal com checkboxes de idiomas (o cartão do idioma fica destacado quando marcado).
  - Ativar/inativar com confirmação; link "Turmas" (`#/turmas?professor_id=`).
- **Turmas**
  - Filtros por ano (padrão: ano atual), idioma e nível (1–12 com rótulo QECR).
  - Cartões com nome, chips de idioma e `nivel()`, professor, horário e barra de ocupação (amarela a partir de 80%, vermelha quando lotada). O total mostra as vagas livres.
  - Criar e editar em modal. O select de professor só lista os **ativos e habilitados** no idioma escolhido e é recalculado quando o idioma muda; o professor atual é mantido mesmo se estiver inativo.
  - **Detalhe `#/turmas/:id`**:
    - dados da turma;
    - alunos, a partir de `GET /matriculas?turma_id=`, com a situação de cada um (assim as turmas de anos anteriores mostram as matrículas concluídas);
    - materiais de `GET /turmas/:id/materiais`, com links externos;
    - ações Editar, Excluir (com confirmação) e "Matricular aluno" (só no ano atual e com vagas).

### Decisões de UX
- **Helpers comuns**: como não posso criar arquivos novos, os helpers das telas acadêmicas são exportados por `dashboard.ts`:
  - `formModal`: `<form>` dentro do modal; Enter envia, o botão fica desabilitado durante o envio e o modal só fecha se der certo;
  - `estadoErro`, `carregando`, `barraOcupacao`, `opcoesNivel`, `opcoesAno`, `debounce`, `semVazios` e `MOEDAS`.
- **Acessibilidade**:
  - todos os campos têm `<label>`; o foco é visível (`:focus-visible`);
  - abas com `role="tab"` e navegação por setas;
  - barras com `role="progressbar"`;
  - rótulos ocultos (`ac-sr-only`) nas colunas de ações e nos selects das linhas.
- **Largura de 960 px**:
  - abaixo de 1100 px, as colunas secundárias somem (`ac-col-opc`: telefone, data da matrícula), os KPIs passam para 2×2 e o painel fica em uma coluna;
  - na tabela de mensalidades, o idioma foi para baixo da competência;
  - o botão "Histórico" saiu da lista de alunos, porque o nome já leva ao histórico.
- **Destaques visuais**: estado `ac-atualizando` (opacidade) ao trocar filtros, em vez de apagar a tabela; linhas canceladas ficam esmaecidas.

### Verificação
- `npm run typecheck` e `npm run build` sem erros.
- **Capturas com o modo do main**: `ESCOLA_USERDATA=…/agente3/ud ESCOLA_SCREENSHOT=…/agente3/shots ESCOLA_ROTAS="dashboard,idiomas,alunos,alunos/1,professores,turmas,turmas/1,matriculas,…"` a 1280 px.
- **Capturas a 960 px e com interação**: usei um wrapper só de verificação (`scratchpad/agente3/tools/wrapper.mjs`, fora do projeto). Ele importa o `dist/main.js`, redimensiona a janela e executa passos: abrir modais, escolher idioma no modal de turma, enviar o formulário com erro 422, cancelar matrícula (confirmação), abrir o aluno estrangeiro e esperar a cotação, matricular e rematricular.
- **Problemas encontrados e corrigidos**:
  - KPIs sobrepostos a 960 px → grade 2×2;
  - tabelas de rematrículas, matrículas, alunos, professores e mensalidades cortando a coluna de ações a 960 px → colunas fundidas ou opcionais e select de destino com largura fluida;
  - painel com "idioma · nível" quebrando em duas linhas → só o nível;
  - espaço excessivo antes de "← Voltar";
  - pílula de tipo duplicada nos materiais;
  - detalhe de turma de ano anterior mostrando "0 alunos" e "Matricular aluno" → lista pelas matrículas, com situação, e o botão escondido.
- **Conferido funcionando**:
  - o 422 aparece em toast com os detalhes ("código deve seguir o padrão ISO 639-1…; Já existe um idioma…");
  - a conversão para USD funcionou com a AwesomeAPI real (1 BRL = US$ 0,17);
  - a matrícula gerou "2 mensalidade(s) de R$ 320,00 · total R$ 640,00";
  - a rematrícula de John Smith saiu da lista e mostrou um toast;
  - Mateo González aparece bloqueado.

### Pendências
- O tema escuro segue o sistema (as capturas saíram no modo escuro). O modo claro usa os mesmos tokens e não foi capturado.
- Os helpers ficam em `dashboard.ts` por causa da regra de propriedade dos arquivos. Se o orquestrador quiser, pode movê-los para um `pages/_comum.ts`.

## Parte 6/8

### Objetivo
Telas de Matrículas (lista do ano, nova matrícula, rematrículas) e Materiais didáticos.

### Telas e funcionalidades
- **Matrículas** (`#/matriculas`; aba inicial pela query `?aba=nova|rematriculas`, pré-seleção com `aluno_id`, `turma_id` e `ano`; a URL acompanha a aba via `history.replaceState`)
  - **Matrículas do ano**:
    - filtros de ano, turma (recarregada quando o ano muda) e situação;
    - tabela com aluno, turma (com idioma e `nivel()`), tipo (pílula "Rematrícula"), data e situação;
    - **Cancelar** pede confirmação e avisa que as mensalidades futuras pendentes serão canceladas e que as vencidas continuam devidas; depois mostra um toast com `mensalidades_canceladas`.
  - **Nova matrícula**:
    - selects de aluno (só ativos), ano e turma; cada turma mostra as vagas e a mensalidade do idioma, e as lotadas ficam desabilitadas;
    - painel da turma com idioma, nível, **mensalidade**, professor, horário e barra de vagas;
    - Enter envia;
    - o resultado mostra "**N mensalidade(s) gerada(s)** de R$ X · total", com links para o histórico do aluno e para o financeiro;
    - um cartão "Como funciona" explica as regras (vencimento no dia 10, uma matrícula ativa por idioma).
  - **Rematrículas** (`GET /matriculas/sugestoes-rematricula?ano=`):
    - lista com idioma e nível atual → **sugerido**;
    - select de turma de destino com as turmas sugeridas (já selecionadas) e "Outras turmas de <idioma>" que têm vaga;
    - **inadimplentes** ficam com a linha vermelha, a pílula "Inadimplente · bloqueada", o select desabilitado e o botão "Regularizar" (vai ao financeiro do aluno);
    - "Rematricular" funciona um a um (`POST /matriculas/rematricula`), mostra um toast com as mensalidades geradas e recarrega a lista.
- **Materiais didáticos**
  - Filtros por busca (com debounce), idioma, nível e tipo. Aceita `?idioma_id=&nivel=` (link "Gerenciar" do detalhe da turma).
  - Agrupamento **idioma → nível**, com cartão por idioma e subtítulo com a faixa QECR.
  - Item com ícone do tipo (LIV/APO/ÁUD/VÍD/URL, com cores), título, autor, descrição e referência. Referências `http(s)` viram links `target="_blank"`, que o main abre no navegador padrão.
  - CRUD em modal. No tipo "Link", a referência passa a ser `type=url` e obrigatória.

### Decisões de UX
- **Destino na rematrícula**: o select já vem com a turma sugerida, então a ação típica é um clique. Turmas de outros níveis do mesmo idioma ficam disponíveis para exceções.
- **Inadimplentes**: em vez de deixar o usuário clicar e receber o 422, a linha já mostra o bloqueio e oferece o caminho para regularizar. Se o backend recusar mesmo assim, o 422 aparece em toast.
- **Matrículas a 960 px**: o idioma e o nível foram para baixo do nome da turma e a data some.

### Verificação
- `npm run typecheck` e `npm run build` sem erros.
- **Capturas analisadas** (1280 e 960 px): lista do ano, nova matrícula (com `turma_id` pré-selecionado e o resultado depois de enviar), rematrículas (antes e depois de rematricular John Smith), confirmação de cancelamento, materiais (lista e modal de edição).
- **Problemas corrigidos**:
  - coluna de ações cortada nas rematrículas e na lista a 960 px;
  - pílula de inadimplente quebrando em três linhas;
  - pílula de tipo repetida nos materiais.

### Pendências
- A seleção de aluno na nova matrícula é um `<select>` simples (23 alunos ativos na seed). Com muitos alunos, valeria trocar por uma busca com sugestões.
- Para não poluir o banco de exemplo, a matrícula e a rematrícula de teste foram feitas no banco temporário em `scratchpad/agente3/ud`. Os dados reais do usuário não foram alterados.
