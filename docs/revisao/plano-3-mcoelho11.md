# Plano 3 — Regras financeiras, cotação e tradução (mcoelho11)

Corrige as regras de matrícula/pagamento que deixam passar inadimplência e as imprecisões de cotação e tradução. **Dois itens mexem em regra de negócio e precisam da decisão do dono antes de codar.**

Origem: revisão do projeto de 17/11/2026 (23 achados divididos em 3 planos; este é um deles). Branch base: `modernizar-stack`.

## Regras para a sessão (valem para os 3 planos)
- Branch própria a partir de `modernizar-stack` (`git switch -c <nome-do-plano> modernizar-stack`); PR de volta para `modernizar-stack`. Antes de mexer, rode `git status` e confira que ninguém alterou os mesmos arquivos.
- Só mexa nos arquivos deste plano. Se um item exigir arquivo de outro plano, pare nesse item e avise pelo "Combinação com os outros planos".
- Para cada item: **reproduza primeiro** (teste vermelho sem a correção), corrija a causa, rode o teste de novo. Não altere teste existente só para passar.
- Um commit por item, mensagem `<fix>: ...`. Antes do PR rode: `npm run typecheck`, `npm run lint` (0 erros; os 4 avisos de `watch()` já existiam), `npm test`, `npm run test:ui`, `npm run build`.
- Os achados vieram de uma revisão automática: **confirme cada um lendo o código** antes de corrigir. Se não reproduzir, registre em "Resultado" e siga.
- Origem de cada achado (commit/autor do git) é só pista da sessão que escreveu a linha; parte pode ser comportamento herdado do código antigo.

## Itens

### 1. Pagamento parcial quita a parcela inteira (média) — DECISÃO DO DONO
- **Onde:** `src/main/routes/mensalidades.ts:94` · origem `b7415ed`
- **Problema:** `pagarMensalidade` aceita qualquer `valor_pago >= 0,01` e marca como `paga`.
- **Cenário:** Mensalidade de R$ 300,00 vencida; `POST /pagar {valor_pago: 1}` → `paga`. O aluno sai da lista de inadimplentes e a rematrícula é liberada com R$ 299 em aberto.
- **Correção e prova:** **Recomendação:** recusar (422) valor menor que o total devido (valor + multa + juros do dia), com mensagem clara; é o menor desvio do modelo atual, que não tem pagamento parcial. Alternativa maior: guardar saldo em aberto (exige schema novo). Confirmar com o dono; se escolher o saldo, tratar como migration com cópia automática. Teste de rota: valor menor, igual e maior.

### 2. Matrícula nova não bloqueia inadimplente (média) — DECISÃO DO DONO
- **Onde:** `src/main/routes/matriculas.ts:146` · origem `f0995d8`
- **Problema:** O bloqueio por mensalidade em atraso existe só em `rematricular()`; `POST /matriculas` não consulta `mensalidadesEmAtraso`.
- **Cenário:** Aluno com mensalidade vencida de 2026: `POST /matriculas` com turma de 2027 → 201 e mensalidades de 2027 criadas; a rematrícula com os mesmos dados → 422.
- **Correção e prova:** **Recomendação:** aplicar o mesmo bloqueio à matrícula nova de aluno que já tem histórico, para as duas rotas terem a mesma regra (Lei 9.870, art. 5º, está em `docs/pesquisa.md`). Confirmar com o dono se matrícula em **outro idioma** do mesmo aluno também deve bloquear. Teste de rota.

### 3. Estorno em matrícula cancelada recria parcela cobrável (baixa)
- **Onde:** `src/main/routes/mensalidades.ts:106` · origem `b7415ed`
- **Problema:** `estornarMensalidade` volta para `pendente` sem olhar a matrícula.
- **Cenário:** Matrícula cancelada com a parcela de dez/2026 paga; estornar → `pendente` de novo, volta a aparecer em `a_receber` e, se vencida, vira atrasada e bloqueia a rematrícula.
- **Correção e prova:** Se a matrícula estiver cancelada, o estorno devolve o dinheiro mas a parcela fica `cancelada` (não `pendente`). Teste de rota.

### 4. Cache de tradução ignora maiúscula/minúscula (baixa)
- **Onde:** `src/main/services/traducao.ts:73` · origem `bb39e60`
- **Problema:** A chave usa `texto.toLowerCase()`.
- **Cenário:** `March` (en→pt) retorna "Março" e vai ao cache por 30 dias; depois `march` (verbo) devolve "Março" do cache sem consultar a API. Vale também para `Polish`/`polish`.
- **Correção e prova:** Chave do cache preservando a caixa original (trim e normalização de espaços apenas). Teste em `traducao` com API falsa.

### 5. Campo `data` da cotação ordena strings ISO com fusos diferentes (baixa)
- **Onde:** `src/main/services/cotacao.ts:261` · origem `1de3191`
- **Problema:** `sort()` em strings ISO com `-03:00` e `Z`.
- **Cenário:** `2026-11-16T19:07:21-03:00` (22:07Z) e `2026-11-16T21:00:00.000Z`: devolve a de 21:00Z, que é mais antiga.
- **Correção e prova:** Comparar por `Date.parse`/instante. Teste com as duas strings.

### 6. Arredondamento a 6 casas prejudica a conversão cruzada (baixa)
- **Onde:** `src/main/services/cotacao.ts:87` · origem `1de3191`
- **Problema:** `valor_em_brl` é arredondado a 6 casas e usado na conversão entre duas moedas.
- **Cenário:** PYG com `bid` 0,0007912 vira 0,000791 (erro de 0,015%); em moeda como IDR o erro chega a ~0,1%. Converter 1.000.000 PYG para CLP sai fora do valor correto.
- **Correção e prova:** Não arredondar o valor guardado/usado no cálculo; arredondar só na apresentação. Teste de conversão cruzada com moeda de valor baixo.

## Combinação com os outros planos
- Os itens 1 e 2 são decisões de negócio: **pergunte ao dono antes de codar**, com a recomendação acima. Não invente a regra.
- Item 1: depois de fechado, avise o Plano 2 (joaofstival), pois o diálogo de pagamento (`pagamento-dialog.tsx`) pode precisar mostrar a nova mensagem de erro.
- Item 6: se mudar o formato do que a rota `/cotacao` devolve, avise o Plano 1 (Gabriel), que mexe na tela de cotação.

## Pronto quando
- Cada item acima reproduzido, corrigido e com teste que falha sem a correção (ou registrado em "Resultado" que não reproduziu).
- `npm run typecheck`, `npm run lint` (0 erros), `npm test`, `npm run test:ui` e `npm run build` saindo sem falha, com a saída lida.
- PR aberto para `modernizar-stack` com a lista de itens feitos, os não reproduzidos e o que foi decidido.

## Resultado
(preencher ao terminar: o que foi feito por item, decisões tomadas e o porquê, o que ficou pendente)
