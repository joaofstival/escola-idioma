# Plano 1 — Telas de matrícula, números pt-BR, cotação e banco (Gabriel)

Corrige as duas falhas de maior gravidade da revisão (rematrícula em 2 idiomas e mensalidade "1.500" salva como R$ 1,50) e o que está em volta delas.

Origem: revisão do projeto de 17/11/2026 (23 achados divididos em 3 planos; este é um deles). Branch base: `modernizar-stack`.

## Regras para a sessão (valem para os 3 planos)
- Branch própria a partir de `modernizar-stack` (`git switch -c <nome-do-plano> modernizar-stack`); PR de volta para `modernizar-stack`. Antes de mexer, rode `git status` e confira que ninguém alterou os mesmos arquivos.
- Só mexa nos arquivos deste plano. Se um item exigir arquivo de outro plano, pare nesse item e avise pelo "Combinação com os outros planos".
- Para cada item: **reproduza primeiro** (teste vermelho sem a correção), corrija a causa, rode o teste de novo. Não altere teste existente só para passar.
- Um commit por item, mensagem `<fix>: ...`. Antes do PR rode: `npm run typecheck`, `npm run lint` (0 erros; os 4 avisos de `watch()` já existiam), `npm test`, `npm run test:ui`, `npm run build`.
- Os achados vieram de uma revisão automática: **confirme cada um lendo o código** antes de corrigir. Se não reproduzir, registre em "Resultado" e siga.
- Origem de cada achado (commit/autor do git) é só pista da sessão que escreveu a linha; parte pode ser comportamento herdado do código antigo.

## Itens

### 1. Rematrícula de aluno com mais de um idioma (ALTA)
- **Onde:** `src/renderer/pages/matriculas.tsx:441` · origem `0c073e1`
- **Problema:** A aba Rematrículas assume uma linha por aluno, mas o backend devolve uma linha por **aluno e idioma**. `key`, o estado `destinos` e `enviando` usam só `aluno_id`.
- **Cenário:** Aluno com Inglês e Espanhol no ano anterior aparece em 2 linhas com o mesmo `aluno_id`. Escolher a turma de Inglês na linha 1 faz a linha 2 (Espanhol) mostrar a mesma turma; clicar em Rematricular na linha 2 envia a turma de Inglês. Resultado: erro ou rematrícula no idioma errado. As duas linhas também dividem spinner e `disabled`, e a `key` duplicada faz o React misturar linhas.
- **Correção e prova:** Chave composta `aluno_id|idioma_id` em `key`, `destinos` e `enviando`. Teste de interface: aluno com 2 idiomas, escolher turma em uma linha não altera a outra.

### 2. Números no formato pt-BR: "1.500" vira R$ 1,50 (ALTA)
- **Onde:** `src/renderer/lib/validacao.ts:26` (`paraNumero`), usada em `src/renderer/pages/idiomas.tsx:18` e turmas · origem `a2f34f6`
- **Problema:** `paraNumero` trata "1.500" (ponto, sem vírgula) como decimal 1,5. O schema aceita (0 a 100000) e salva.
- **Cenário:** Digitar 1.500 na mensalidade salva R$ 1,50 e todas as mensalidades geradas depois saem mil vezes menores. "1,250.50" também passa e vira 1,2505. O `lerValor` do financeiro já trata "1.250" como 1250.
- **Correção e prova:** Reaproveitar a regra do `lerValor` em um único helper em `lib/` (ponto de milhar pt-BR, vírgula decimal; rejeitar formatos ambíguos). Testes em `node:test` para 1.500, 1.500,50, 1500, 1,5, 1.5 e "1,250.50". Idiomas e turmas passam a usar o helper.

### 3. Destinos da rematrícula não reiniciam ao trocar o ano (média)
- **Onde:** `src/renderer/pages/matriculas.tsx:354` · origem `0c073e1`
- **Problema:** O estado `destinos` não é limpo quando o filtro de ano muda.
- **Cenário:** Em 2026 escolhe a turma X para o aluno 5, troca para 2027 e clica em Rematricular: vai a turma de 2026 com `ano_letivo=2027` e o backend responde "ano letivo informado diferente do ano da turma". O Select mostra valor que não está na lista.
- **Correção e prova:** Limpar `destinos` ao trocar o ano (ou derivar o destino só das turmas do ano atual). Teste de interface.

### 4. Turma pré-selecionada some sem aviso na nova matrícula (média)
- **Onde:** `src/renderer/pages/matriculas.tsx:175` e o `useEffect` perto da linha 214 · origem `0c073e1`
- **Problema:** A turma vinda da URL é carregada com `.catch(() => null)`; depois o efeito limpa a turma sem avisar.
- **Cenário:** Abrir `/matriculas?aba=nova&turma_id=7` com falha de rede ou turma lotada: o campo Turma aparece vazio, o ano volta para o atual e nada explica. Se a turma for de outro ano, o aluno pode escolher a turma errada sem perceber.
- **Correção e prova:** Mostrar aviso (toast ou texto no campo) quando a turma da URL não puder ser usada, dizendo o motivo (não carregou / lotada / ano diferente). Teste de interface para turma lotada.

### 5. Conversor de moeda não entende ponto de milhar (média)
- **Onde:** `src/renderer/pages/cotacao.tsx:33` · origem `c3ce7c3`
- **Problema:** O valor é lido com `replace(',', '.')`.
- **Cenário:** "1.250" vira 1,25; "1.250,50" vira NaN e aparece "Informe um valor numérico" para um valor válido em pt-BR.
- **Correção e prova:** Usar o helper do item 2. Teste com "1.250,50".

### 6. Taxa exibida perde precisão em moedas muito baixas (baixa)
- **Onde:** `src/renderer/pages/cotacao.tsx:20` · origem `c3ce7c3`
- **Problema:** `taxa()` mostra no máximo 4 casas. PYG→BRL com taxa 0,00069 aparece "0,0007" (~1,4% de erro) ao lado de um resultado calculado com a taxa exata.
- **Cenário:** O usuário confere a conta pela taxa exibida e ela não fecha.
- **Correção e prova:** Para taxas < 0,01 usar algarismos significativos (como já feito em `dinheiro()` em `lib/format.ts`). Teste em `format.test.ts`.

### 7. Nome do backup exportado usa data em UTC (baixa)
- **Onde:** `src/main/main.ts:105` · origem `d9cafd4`
- **Problema:** `toISOString()` (UTC), enquanto os backups automáticos usam `dataLocal`.
- **Cenário:** No Brasil, às 22h de 17/11 o diálogo sugere `escola-backup-2026-11-18.db`.
- **Correção e prova:** Usar `dataLocal` no nome sugerido. Teste com relógio injetado, se houver ponto de injeção.

### 8. `transaction()` decrementa a profundidade duas vezes se o COMMIT falhar (baixa; só lido, não reproduzido)
- **Onde:** `src/main/db.ts:179` · origem `c41ef62`
- **Problema:** Se o COMMIT lançar erro, `profundidade` é decrementada na linha ~175 e de novo no `catch`; fica -1.
- **Cenário:** O ROLLBACK não roda e o próximo `transaction()` emite `SAVEPOINT sp_-1` (SQL inválido): toda transação seguinte falha até reiniciar o app.
- **Correção e prova:** Tentar reproduzir com um COMMIT que falhe (ex.: dublê do banco). Se reproduzir, decrementar uma vez só (`finally`) e garantir o ROLLBACK. Se não der para reproduzir, corrigir a contagem e registrar que não houve prova.

## Combinação com os outros planos
- Os itens 2, 5 e 6 usam o helper de número pt-BR / formatação: faça o item 2 primeiro. O Plano 2 (joaofstival) **não** usa esse helper; o Plano 3 (mcoelho11) só toca em `src/main/`.
- Item 6: o Plano 3 altera a precisão de `valor_em_brl` no backend (`cotacao.ts`). Se o formato da resposta mudar, o mcoelho11 avisa antes.

## Pronto quando
- Cada item acima reproduzido, corrigido e com teste que falha sem a correção (ou registrado em "Resultado" que não reproduziu).
- `npm run typecheck`, `npm run lint` (0 erros), `npm test`, `npm run test:ui` e `npm run build` saindo sem falha, com a saída lida.
- PR aberto para `modernizar-stack` com a lista de itens feitos, os não reproduzidos e o que foi decidido.

## Resultado
(preencher ao terminar: o que foi feito por item, decisões tomadas e o porquê, o que ficou pendente)
