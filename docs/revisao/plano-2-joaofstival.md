# Plano 2 — Alunos, validação e telas de apoio (joaofstival)

Corrige a duplicidade de aluno por documento e as validações de número no backend de base, mais quatro telas pequenas (professores, financeiro, pagamento e editor de avaliação).

Origem: revisão do projeto de 17/11/2026 (23 achados divididos em 3 planos; este é um deles). Branch base: `modernizar-stack`.

## Regras para a sessão (valem para os 3 planos)
- Branch própria a partir de `modernizar-stack` (`git switch -c <nome-do-plano> modernizar-stack`); PR de volta para `modernizar-stack`. Antes de mexer, rode `git status` e confira que ninguém alterou os mesmos arquivos.
- Só mexa nos arquivos deste plano. Se um item exigir arquivo de outro plano, pare nesse item e avise pelo "Combinação com os outros planos".
- Para cada item: **reproduza primeiro** (teste vermelho sem a correção), corrija a causa, rode o teste de novo. Não altere teste existente só para passar.
- Um commit por item, mensagem `<fix>: ...`. Antes do PR rode: `npm run typecheck`, `npm run lint` (0 erros; os 4 avisos de `watch()` já existiam), `npm test`, `npm run test:ui`, `npm run build`.
- Os achados vieram de uma revisão automática: **confirme cada um lendo o código** antes de corrigir. Se não reproduzir, registre em "Resultado" e siga.
- Origem de cada achado (commit/autor do git) é só pista da sessão que escreveu a linha; parte pode ser comportamento herdado do código antigo.

## Itens

### 1. Documento duplicado passa com pontuação diferente (média, reproduzido pelo revisor)
- **Onde:** `src/main/routes/alunos.ts:26` · origem `600da86`
- **Problema:** A checagem de duplicado compara o texto exato; o índice único `ux_alunos_documento` também.
- **Cenário:** `POST /alunos {documento:'123.456.789-01'}` e depois `{documento:'12345678901'}` → os dois voltam 201.
- **Correção e prova:** Normalizar o documento (só dígitos e letras, maiúsculo) ao gravar e ao checar duplicado, no `POST` e no `PUT`. **Cuidado com dados existentes:** antes de aplicar a normalização no banco, confira se há duplicados já gravados e trate com migration (nova versão em `src/main/migrations/`), com cópia automática. Teste de rota para os dois formatos.

### 2. Busca por documento e telefone não ignora pontuação nem maiúscula (baixa, reproduzido)
- **Onde:** `src/main/routes/alunos.ts:39` · origem `600da86`
- **Problema:** Só nome e e-mail usam `sem_acento`.
- **Cenário:** Aluno com documento `123.456.789-01` e telefone `(11) 99811-0001`: `GET /alunos?busca=11998110001` retorna 0. Documento `X123456` não é achado por `x123456`.
- **Correção e prova:** Comparar documento e telefone sem pontuação e sem diferenciar maiúscula. Teste de rota.

### 3. `PUT` com `ativo: null` reativa o aluno (baixa, reproduzido)
- **Onde:** `src/main/routes/alunos.ts:25` e `src/main/routes/professores.ts:47` · origem `600da86`
- **Problema:** `null` ou vazio cai no `padrao: true`.
- **Cenário:** Aluno inativo; `PUT /alunos/1 {ativo:null}` volta `ativo=true`. Mesma coisa em professores.
- **Correção e prova:** No `PUT`, campo ausente mantém o valor atual; `null`/vazio é erro 422. Teste de rota nos dois recursos.

### 4. `numero()` aceita hexadecimal e notação científica (baixa, reproduzido)
- **Onde:** `src/main/validation.ts:101` · origem `e431652`
- **Problema:** Usa `Number()` em string.
- **Cenário:** `POST /idiomas {mensalidade:'0x10'}` → 201 com 16. Capacidade `'0x10'` vira 16 vagas e `'1e3'` vira 1000.
- **Correção e prova:** Aceitar só números decimais simples (regex) quando o valor vier como string. Teste em `validation.test.ts`. Não mude o contrato para números JSON.

### 5. "Ver turmas" do professor não leva o ano (baixa)
- **Onde:** `src/renderer/pages/professores.tsx:238` · origem `a2f34f6`
- **Problema:** Navega para `#/turmas?professor_id=X` sem ano; a lista usa o ano atual.
- **Cenário:** Professor só com turmas de 2025 ou de ano futuro: aparece "Nenhuma turma em 2026 com esses filtros", como se não tivesse turmas.
- **Correção e prova:** Incluir o ano (ou "todos", se a tela de turmas aceitar) no link, ou avisar na tela vazia que há turmas em outros anos. Teste de interface.

### 6. Selo "Em aberto" contradiz o filtro (baixa)
- **Onde:** `src/renderer/pages/financeiro.tsx:24` · origem `c3ce7c3`
- **Problema:** O filtro "Em aberto" (pendente) inclui as atrasadas (documentado no backend), mas o selo da linha só diz "Em aberto" nas não atrasadas.
- **Cenário:** Filtro Situação = "Em aberto" traz linhas com o selo "Atrasada · N dias" e os totais do rodapé misturam os dois grupos sob um rótulo que a linha contradiz.
- **Correção e prova:** Renomear o filtro para deixar claro que inclui atrasadas (ex.: "Pendentes (inclui atrasadas)") ou separar os dois. Escolha o mais simples e registre no "Resultado".

### 7. Botão "Usar R$ X" do pagamento não atualiza ao digitar (baixa)
- **Onde:** `src/renderer/pages/pagamento-dialog.tsx:85` · origem `aa7668e`
- **Problema:** Lê `form.getValues()` durante o render; digitar não re-renderiza o pai.
- **Cenário:** O botão "Usar total" fica visível mesmo depois de digitar exatamente o total, e pode não aparecer se a primeira tecla já coincidia.
- **Correção e prova:** Trocar por `form.watch('valor_pago')` (ou `useWatch`) para o botão reagir. Teste de interface.

### 8. Editor de avaliação apaga a regra "pedir o porquê" em silêncio (média)
- **Onde:** `src/renderer/pages/avaliacao-pergunta-editor.tsx:31` · origem `e2ad8d5`
- **Problema:** Remover ou trocar opções filtra `reasonOn` em silêncio; lista vazia significa "pedir o porquê sempre".
- **Cenário:** Pergunta de escolha única com `askReason` e `reasonOn=["Ruim"]`: aplicar "opções prontas" ou remover "Ruim" deixa `reasonOn=[]` e o porquê passa a ser pedido em toda resposta, sem aviso. O servidor aceita `[]`.
- **Correção e prova:** Avisar quando a mudança de opções alterar `reasonOn` (ou pedir confirmação) e deixar claro na tela o que `[]` significa. Teste de interface.

## Combinação com os outros planos
- O item 7 (pagamento) depende do que o Plano 3 decidir sobre **pagamento parcial** (o `/pagar` pode passar a recusar valor menor que o total). Faça o item 7 como descrito e, quando o Plano 3 for fechado, confira se o diálogo mostra a mensagem de erro do backend.
- Os itens 1 a 4 mexem em `src/main/`; o Plano 3 mexe em `src/main/routes/{matriculas,mensalidades}.ts` e `src/main/services/{cotacao,traducao}.ts`. Não há arquivo em comum.

## Pronto quando
- Cada item acima reproduzido, corrigido e com teste que falha sem a correção (ou registrado em "Resultado" que não reproduziu).
- `npm run typecheck`, `npm run lint` (0 erros), `npm test`, `npm run test:ui` e `npm run build` saindo sem falha, com a saída lida.
- PR aberto para `modernizar-stack` com a lista de itens feitos, os não reproduzidos e o que foi decidido.

## Resultado
(preencher ao terminar: o que foi feito por item, decisões tomadas e o porquê, o que ficou pendente)
