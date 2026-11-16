# Pesquisa — integrações e regras de negócio

Agente 1 (Pesquisa). Requisições reais feitas com `curl` em **16/11/2026**. Todos os exemplos de resposta abaixo são trechos do que as APIs devolveram nesse dia.

---

## Decisões para o backend

### Cotação (`backend/services/cotacao.js`)

| Papel | URL exata | O que usar da resposta |
|---|---|---|
| **Principal**: AwesomeAPI | `GET https://economia.awesomeapi.com.br/json/last/USD-BRL,EUR-BRL` (pares `XXX-BRL` separados por vírgula) | `json["USDBRL"].bid` (string). É o **valor de 1 USD em BRL**, então `valor_em_brl = Number(bid)`. Data: `create_date` ("2026-11-16 19:07:21") ou `timestamp` (epoch em segundos, em string). |
| **Fallback**: ExchangeRate-API open access | `GET https://open.er-api.com/v6/latest/BRL` | `json.result === "success"`. `json.rates.USD` = quanto 1 BRL vale em USD, então `valor_em_brl = 1 / rates.USD`. Data: `time_last_update_utc`. |
| Fallback 2 (opcional) | `GET https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/brl.min.json` (espelho: `https://latest.currency-api.pages.dev/v1/currencies/brl.min.json`) | Códigos **em minúsculas**: `json.brl.usd`, e `valor_em_brl = 1 / json.brl.usd`. Data: `json.date`. |

- **TTL do cache: 1 hora** em memória, com chave = conjunto de moedas pedidas (ou uma tabela única por moeda). A AwesomeAPI já entrega dados com cache de 5 min (`cache-control: max-age=300`). Uma escola não precisa de cotação intradiária, e 1 h fica bem abaixo de qualquer limite.
- **Cache vencido como último recurso**: se principal e fallback falharem, devolver o último valor guardado (até **72 h**) com `"desatualizada": true` e a `data` original. Sem cache algum, responder **503** `{ "erro": "Serviço de cotação indisponível no momento. Tente novamente mais tarde." }`.
- **Timeout** de 5 s por chamada externa (`AbortSignal.timeout(5000)`).
- **Moedas sugeridas para o seletor**: USD, EUR, GBP, ARS, CLP, PYG, UYU, BOB, PEN, COP, MXN, CAD, JPY, CNY, CHF, AUD. Todas existem nas duas fontes.
- **Formato que proponho para `GET /api/cotacao?moedas=USD,EUR`**:
  ```json
  { "base": "BRL", "data": "2026-11-16T19:07:21-03:00", "fonte": "awesomeapi", "desatualizada": false,
    "cotacoes": { "USD": { "valor_em_brl": 5.7833, "brl_para_moeda": 0.172912, "variacao_pct": 2.05 },
                  "EUR": { "valor_em_brl": 6.3608, "brl_para_moeda": 0.157213, "variacao_pct": 1.82 } } }
  ```
  `variacao_pct` existe só na AwesomeAPI. Com o fallback, vai `null`.
- **Conversão** (`/api/cotacao/converter?valor=&de=&para=`): passar tudo por BRL, `valor * valor_em_brl(de) / valor_em_brl(para)`, com `valor_em_brl(BRL) = 1`. Arredondar para 2 casas só na exibição.

### Tradução (`backend/services/traducao.js`)

| Papel | URL exata | O que usar da resposta |
|---|---|---|
| **Principal**: MyMemory | `GET https://api.mymemory.translated.net/get?q=<texto>&langpair=<de>\|<para>` (ex.: `q=livro&langpair=pt\|en`; codificar o `\|` como `%7C`). Opcional: `&de=<email>` para subir a cota. | Sucesso quando `json.responseStatus === 200` **e** `json.quotaFinished !== true`. Tradução em `json.responseData.translatedText`. |
| **Fallback**: Google Translate, endpoint público `gtx` (não oficial) | `GET https://translate.googleapis.com/translate_a/single?client=gtx&sl=<de>&tl=<para>&dt=t&q=<texto>` | Array aninhado. Tradução = `json[0].map(s => s[0]).join("")`. Idioma detectado em `json[2]`. |
| **Último recurso** | Dicionário offline em `backend/services/dicionario.json` | `{ "pt": { "livro": { "en": "book", "es": "libro", "fr": "livre", "it": "libro", "de": "Buch" } } }` |

- **Cache das traduções: 30 dias** (palavra não muda), em memória ou em uma tabela SQLite `traducoes_cache(de, para, texto, traducao, fonte, criado_em)`. Normalizar a chave com `trim().toLowerCase()`.
- **Timeout** de 5 s em cada fonte.
- **Validação (422)**: `texto` obrigatório, no máximo **500 bytes** (é o limite do MyMemory). `de` e `para` devem ser códigos ISO 639-1 suportados: `pt, en, es, fr, it, de, ja, zh` (o MyMemory aceita também `pt-BR`, `zh-CN`). Se `de === para`, devolver o próprio texto.
- **Falha total** (as duas APIs fora e a palavra fora do dicionário): **503** `{ "erro": "Tradução indisponível no momento (serviços externos fora do ar). Tente novamente mais tarde." }`.
- **Resposta**: `{ "texto": "livro", "traducao": "book", "de": "pt", "para": "en", "fonte": "mymemory" | "google" | "dicionario" | "cache" }`.
- **Não use LibreTranslate nem Lingva.** Testei as duas em 16/11/2026: o LibreTranslate público exige chave, e todas as instâncias públicas do Lingva estavam fora do ar ou atrás de um desafio da Cloudflare (detalhes na seção 2).

### Níveis
`nivel` continua sendo um INTEGER de 1 a 12. O rótulo exibido sai do mapeamento fixo **2 níveis numéricos por faixa do QECR**: 1–2 = A1, 3–4 = A2, 5–6 = B1, 7–8 = B2, 9–10 = C1, 11–12 = C2. Rótulo: **"Nível 3 (A2)"**. Fórmula: `["A1","A2","B1","B2","C1","C2"][Math.min(5, Math.floor((nivel-1)/2))]`.

### Financeiro
Vencimento padrão no **dia 10** (configurável). Multa de **2%** e juros de **1% a.m. pro rata die**, mostrados como *valor atualizado* e **não** gravados na mensalidade. Mensalidades do **mês da matrícula até dezembro**. **Atrasada** = `status='pendente' AND vencimento < hoje`. **Inadimplente** = tem pelo menos uma atrasada. Detalhes na seção 4.

---

## 1. APIs de cotação

| | AwesomeAPI | Frankfurter | open.er-api.com | fawazahmed0 currency-api |
|---|---|---|---|---|
| Chave | não (opcional, para mais cota e dados sem cache) | não | não | não |
| CORS | `*` | `*` | `*` | `*` |
| Moedas | 52 pares `XXX-BRL` (540 pares no total) | **30** (só as moedas de referência do BCE) | **166** | ~300 (inclui cripto) |
| Atualização | intradiária, cache de 5 min | 1×/dia útil (BCE, cerca de 16h CET) | 1×/dia | 1×/dia |
| Base BRL | nativa (`USD-BRL` e também `BRL-USD`) | `?base=BRL` | `/latest/BRL` | `/currencies/brl` |
| Limites | não há número oficial claro para uso sem chave. A doc oferece "até 100.000 requisições gratuitas" com API Key | sem limite publicado (pedem uso razoável) | sem limite fixo, mas bloqueia (HTTP 429) quem consulta demais. Recomendam 1 chamada/h | CDN, praticamente ilimitado |

### 1.1 AwesomeAPI (principal)
Docs: https://docs.awesomeapi.com.br/api-de-moedas

```
$ curl -s "https://economia.awesomeapi.com.br/json/last/USD-BRL,EUR-BRL"
HTTP/2 200 · access-control-allow-origin: * · cache-control: max-age=300, public, stale-if-error=259200
{"USDBRL":{"code":"USD","codein":"BRL","name":"Dólar Americano/Real Brasileiro","high":"5.7939","low":"5.6558",
  "varBid":"0.1159","pctChange":"2.045032","bid":"5.7833","ask":"5.7841","timestamp":"1794866841",
  "create_date":"2026-11-16 19:07:21"},
 "EURBRL":{"code":"EUR","codein":"BRL", ... "bid":"6.3608","ask":"6.3628","create_date":"2026-11-16 19:11:50"}}
```
- Os valores vêm como **string**: converta com `Number()`.
- Moeda inexistente devolve HTTP 404 com `{"status":404,"code":"CoinNotExists","message":"moeda nao encontrada XYZ-BRL"}`. Se **qualquer** par do lote for inválido, o lote inteiro falha. Por isso, valide a lista antes de chamar.
- Lista de pares: `https://economia.awesomeapi.com.br/json/available`. Por que é a principal: é brasileira, já cota em BRL, atualiza ao longo do dia e traz variação.

### 1.2 open.er-api.com (fallback)
Docs: https://www.exchangerate-api.com/docs/free

```
$ curl -s "https://open.er-api.com/v6/latest/BRL"
HTTP/2 200 · access-control-allow-origin: * · cache-control: public, max-age=3600
{"result":"success","provider":"https://www.exchangerate-api.com", ...
 "time_last_update_utc":"Mon, 16 Nov 2026 00:02:31 +0000","time_next_update_utc":"Tue, 17 Nov 2026 00:34:21 +0000",
 "base_code":"BRL","rates":{"BRL":1,"USD":0.17654,"EUR":0.16,"GBP":0.133522,"JPY":28.222127,"ARS":273.153405,"CNY":1.1833, ...}}
```
- Código inválido devolve `{"result":"error","error-type":"unsupported-code"}`.
- Os termos pedem **atribuição** ("Rates By Exchange Rate API" com link) quando os dados são exibidos. Mostre isso no rodapé da tela de cotação quando `fonte = "exchangerate-api"`.

### 1.3 Frankfurter (não recomendada como fallback)
```
$ curl -s "https://api.frankfurter.dev/v1/latest?base=BRL&symbols=USD,EUR"
{"amount":1.0,"base":"BRL","date":"2026-11-16","rates":{"EUR":0.15914,"USD":0.17528}}
$ curl -sI "https://api.frankfurter.app/latest?from=BRL&to=USD,EUR"
HTTP/2 301  location: https://api.frankfurter.dev/v1/latest?from=BRL&to=USD,EUR
```
- O domínio `api.frankfurter.app` **redireciona (301)** para `api.frankfurter.dev/v1`, e já existe uma `v2` (`/v2/rates?base=BRL&quotes=USD,EUR` devolve um array `[{date,base,quote,rate}]`).
- Tem só 30 moedas: **faltam ARS, CLP, PYG, UYU, COP, PEN, BOB**, que são justamente as moedas latino-americanas mais prováveis entre alunos estrangeiros. Por isso ficou fora.

### 1.4 fawazahmed0 currency-api (fallback 2)
```
$ curl -s "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/brl.min.json"
HTTP/2 200 · access-control-allow-origin: *
{"date":"2026-11-16","brl":{"aed":0.64824201,"ars":272.78502944,"aud":0.26126089,"eur":...,"usd":0.1766...}}
```
- As chaves vêm em minúsculas e misturam cripto. Aceita data fixa no lugar de `@latest` (ex.: `@2026-11-15`). A documentação recomenda usar o espelho `currency-api.pages.dev` quando o jsdelivr falhar.

---

## 2. APIs de tradução

| | MyMemory | Google `gtx` (não oficial) | LibreTranslate público | Lingva |
|---|---|---|---|---|
| Chave | não | não | **sim** (libretranslate.com) | não |
| Funcionou em 16/11/2026 | **sim** | **sim** | **não**: HTTP 400 "get an API key" | **não**: todas as instâncias falharam |
| CORS | `*` | `*` | — | — |
| Limite | **5.000 caracteres/dia** anônimo, **50.000/dia** com `de=email`, 500 bytes por consulta | não publicado. É um endpoint interno sem SLA e pode bloquear (429) | — | — |

### 2.1 MyMemory (principal)
Docs: https://mymemory.translated.net/doc/spec.php · limites: https://mymemory.translated.net/doc/usagelimits.php

```
$ curl -s "https://api.mymemory.translated.net/get?q=livro&langpair=pt|en"
HTTP/2 200 · access-control-allow-origin: *
{"responseData":{"translatedText":"book","match":1},"quotaFinished":false,"mtLangSupported":null,
 "responseDetails":"","responseStatus":200,"responderId":null,"exception_code":null,
 "matches":[{"segment":"livro","translation":"book","source":"pt-PT","target":"en-GB","quality":"74","match":1, ...}, ...]}

$ curl -s "https://api.mymemory.translated.net/get?q=livro&langpair=pt-BR|es"   → responseData.translatedText = "libro"
$ curl -s "https://api.mymemory.translated.net/get?q=livro&langpair=pt|xx"
  HTTP 200, mas responseStatus = 403 e translatedText = "'XX' IS AN INVALID TARGET LANGUAGE ..."
```
- **Cuidado: o MyMemory devolve HTTP 200 mesmo quando dá erro.** O backend tem de checar `responseStatus === 200`, senão grava a mensagem de erro como se fosse tradução. Esgotar a cota vem com `quotaFinished: true` ou `responseStatus` 429.
- `langpair` aceita ISO de 2 letras ou RFC 3066 (`pt-BR`, `zh-CN`). O separador é `|`.
- Parâmetro opcional `de=<email>`: sobe a cota para 50 mil caracteres/dia. Leia de uma variável de ambiente (`MYMEMORY_EMAIL`) e nunca deixe fixo no código.
- Qualidade: a memória de tradução às vezes escolhe um sinônimo menos comum (ex.: `casa` pt→fr deu "domicile"). Para palavras isoladas isso é aceitável. Se quiser, mostre também `matches[0..2]` como alternativas.

### 2.2 Google Translate `gtx` (fallback)
```
$ curl -s "https://translate.googleapis.com/translate_a/single?client=gtx&sl=pt&tl=en&dt=t&q=livro"
HTTP/2 200 · access-control-allow-origin: *
[[["book","livro",null,null,10]],null,"pt",null,null,null,null,[]]
(tl=es → "libro", tl=fr → "livre", tl=it → "libro", tl=de → "Buch", tl=ja → "本")
```
- Funciona e é de boa qualidade, mas **não é uma API documentada nem tem garantia**. Use só como fallback, com cache, e cite a fonte ("google") na resposta.

### 2.3 Descartadas (testes reais)
- `POST https://libretranslate.com/translate` deu HTTP 400 `{"error":"Visit https://portal.libretranslate.com to get an API key"}`. `translate.fedilab.app` deu 403. `libretranslate.de` dá 301 para `de.libretranslate.com` e depois 405. `translate.argosopentech.com` e `lt.vern.cc` não responderam (timeout/DNS).
- Lingva (`/api/v1/pt/en/livro`): `lingva.ml` e `lingva.garudalinux.org` estão atrás de um desafio da Cloudflare ("Just a moment..."). `lingva.thedaviddelta.com` deu 503 DEPLOYMENT_PAUSED. `lingva.lunar.icu` e `translate.plausibility.cloud` deram 500. `translate.projectsegfau.lt` deu 404. `translate.igna.wtf`, `translate.dr460nf1r3.org` e `translate.jae.fi` não responderam.
- Apertium (`https://apertium.org/apy/translate?q=livro&langpair=por|spa` devolveu `libro`) funciona sem chave, mas **não tem pt↔en**. Só cobre pt↔es/ca/gl. Pode ser fonte extra para espanhol, mas não é necessário.

### 2.4 Quando tudo falha
1. Consultar o cache (SQLite/memória).
2. Consultar o **dicionário offline** (`dicionario.json`) com cerca de 100 a 200 palavras de sala de aula (livro, caderno, professor, aluno, escola, casa, água, obrigado, bom dia, números de 1 a 10, cores, dias da semana, meses) em pt→en/es/fr/it/de, e o inverso.
3. Sem resultado: 503 com mensagem clara. O frontend mostra "Serviço de tradução indisponível. Tente novamente em alguns minutos."

---

## 3. Níveis: nível numérico ↔ QECR/CEFR

- O QECR (Quadro Europeu Comum de Referência; CEFR em inglês) tem **6 níveis**: A1–A2 (usuário básico), B1–B2 (independente) e C1–C2 (proficiente).
- Horas de estudo guiado (Cambridge, cumulativas): A1 ≈ 90–100 h, A2 ≈ 180–200 h, B1 ≈ 350–400 h, B2 ≈ 500–600 h, C1 ≈ 700–800 h, C2 ≈ 1.000–1.200 h. Com cerca de 3 h/semana (cerca de 100 h/ano), cada faixa leva **1 a 2 anos**. Por isso as escolas dividem cada faixa em 2 ou 3 estágios.
- Prática comum em escolas de idiomas: **8 a 12 estágios por idioma** (ex.: Básico 1–4, Intermediário 1–4, Avançado 1–4). Muitas escolas param em C1, que é o que o mercado pede.
- **Recomendação**: 12 níveis numéricos por idioma, **2 por faixa**. A rematrícula sugere `nivel + 1`, o que cria uma progressão anual natural.

| Nível | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| QECR | A1 | A1 | A2 | A2 | B1 | B1 | B2 | B2 | C1 | C1 | C2 | C2 |
| Estágio | Básico | Básico | Básico | Básico | Interm. | Interm. | Interm. | Interm. | Avanç. | Avanç. | Avanç. | Avanç. |

- Rótulo exibido: **"Nível 3 (A2)"**. Em listas compactas, "N3 · A2". Para nível > 12, exibir "C2". O backend pode devolver `nivel_qecr` junto com `nivel` (campo calculado, sem coluna nova).

---

## 4. Regras financeiras de mensalidade (Brasil)

| Regra | Valor usual | Base legal / fonte |
|---|---|---|
| Vencimento | **dia 5 ou dia 10** de cada mês (o mais comum é 5 a 10, no início do mês da competência). Sugestão: **dia 10**, configurável | prática de mercado (contrato) |
| Multa moratória | **até 2%** do valor da parcela, aplicada uma vez | CDC (Lei 8.078/1990), art. 52, §1º. O STJ aplica o teto de 2% às mensalidades escolares (relação de consumo) |
| Juros de mora | **1% ao mês**, *pro rata die* (0,0333% ao dia), sobre o valor original | Taxa contratual usual (Lei de Usura, Dec. 22.626/1933, e CC art. 406). **Desde a Lei 14.905/2024**, quando o contrato é omisso, a taxa legal passa a ser **Selic − IPCA**. Por isso o 1% a.m. deve constar do contrato |
| Correção monetária | IPCA (padrão do CC art. 389 após a Lei 14.905/2024). Opcional | Lei 14.905/2024 |
| Parcelamento | valor anual dividido em **12 parcelas** (ou 6 por semestre) iguais | Lei 9.870/1999, art. 1º, §5º |
| Sanções | **proibido** suspender provas, reter documentos ou aplicar sanção pedagógica por inadimplência. Pode-se **negar a rematrícula** a inadimplentes. Medidas de cobrança só depois de **90 dias** de atraso | Lei 9.870/1999, arts. 5º e 6º |

Obs.: a Lei 9.870/1999 trata do ensino regular. Cursos livres de idiomas seguem o **CDC** e o contrato, mas a Lei 9.870 é a referência usual de mercado e é seguida por prudência.

**Regras para implementar:**
1. **Geração ao matricular**: uma mensalidade por mês, **do mês da matrícula até dezembro** do `ano_letivo`, com o `valor` fixo do idioma (`idiomas.mensalidade`), `competencia = 'YYYY-MM'` e `vencimento = YYYY-MM-10`. Se a matrícula for feita **depois do dia de vencimento** do mês corrente, a primeira mensalidade vence em **hoje + 5 dias** (ou na data da matrícula), para não nascer atrasada. Se o ano letivo for futuro, gerar de janeiro (ou fevereiro) a dezembro. Proporcionalidade por dias dentro do mês é opcional. O padrão de mercado é cobrar o mês cheio.
2. **Rematrícula**: gera as 12 parcelas do novo ano (ou do mês de início até dezembro). Pode ser bloqueada se o aluno for inadimplente (art. 5º). Mostrar só um aviso é o mais simples.
3. **Cancelamento**: cancela as mensalidades **pendentes com competência futura**. As vencidas continuam devidas.
4. **Em atraso** (calculado, nunca gravado): `status = 'pendente' AND vencimento < date('now', 'localtime')`. Quem paga no próprio dia do vencimento não está atrasado.
5. **Valor atualizado** (só exibição, ou sugestão no "pagar"): `dias = hoje − vencimento` e `valor_atualizado = valor × (1 + 0,02 + 0,01 × dias/30)`, arredondado a 2 casas. Se `dias ≤ 0`, fica `valor`. Guardar o efetivamente recebido em `valor_pago`.
6. **Inadimplente**: aluno com ≥ 1 mensalidade atrasada. Destacar quem tem atraso > 90 dias (a partir daí são permitidas medidas de cobrança).

---

## 5. Estudo "Avaliação configurável": regras que DEVEM ser implementadas

O estudo troca o formulário fixo "nota 1–10 + texto" por um **editor de perguntas configurável**, no estilo Google Forms. Cada pergunta é um card editado no próprio lugar. As respostas ficam em linhas próprias para permitir contagem, média e exportação. Na escola, ele vira o módulo **Avaliações por turma** (avaliação de nível, feedback do aluno, autoavaliação).

**Editor**
- Lista de cards editada no lugar: clicar em um card abre a edição, e os demais ficam resumidos. Reordenar com arrastar **ou** setas ↑/↓.
- **5 tipos**: `open` (curta/longa, `maxChars` opcional), `single` (escolha única, `askReason` + `reasonOn` com os ids das opções que pedem o porquê), `multiple` (`maxChoices`, `allowOther`), `rating` (estrelas ou números; escalas 1–5, 1–10 ou 0–10; `minLabel`/`maxLabel`), `grid` (várias `rows` na mesma escala).
- Em toda pergunta: `required`, `description`, `countsInScore`, e conjuntos de opções prontos (Excelente→Precisa melhorar; Concordo→Discordo; Sempre→Nunca; Sim/Não).
- **Modelos prontos** (`GET /avaliacoes/modelos`) e prévia **"Ver como participante"**.

**Validação do formulário no servidor (422 com `detalhes[]`)**
- Entre **1 e 20 perguntas**. **Pelo menos 1 obrigatória**.
- `single` e `multiple`: **mínimo 2, máximo 10 opções**. Grade: 1 a 10 linhas.
- `maxChoices` entre 1 e o número de opções. A escala precisa ser válida (min < max, e uma das três permitidas).
- `id` únicos (perguntas, opções, linhas). Título não vazio.

**Trava**
- Depois da **primeira resposta**, o `form` fica **travado**: um PUT que altere `form` devolve 422 "Avaliação travada: já possui respostas. Duplique para alterar." Título e descrição podem continuar editáveis (opcional).
- `POST /avaliacoes/:id/duplicar` cria uma cópia sem respostas ("<título> (cópia)").

**Validação das respostas (422)**
- Toda obrigatória precisa ser respondida. Em grade obrigatória, todas as linhas.
- `option_id` tem de existir. Em `multiple`, respeitar `maxChoices`. "Outro" só se `allowOther`, com texto.
- `value_number` dentro da escala. Texto dentro de `maxChars`.
- **`reason` só é aceito/exibido se a opção escolhida está em `reasonOn`.** Em outros casos, é descartado.
- Uma resposta por aluno por avaliação (único). Repetir dá 422 ou 409.

**Nota média (score)**
- Considera só as perguntas com `countsInScore = true`. Cada uma é **normalizada para 0–10**: rating/grid `(v − min)/(max − min) × 10` (na grade, média das linhas). Single/multiple pelos `points` da opção (0–10), e em multiple pela média das escolhidas.
- `score` = média dessas notas, gravada em `avaliacao_respostas.score`. Fica `NULL` se nenhuma conta.

**Persistência e resultados**
- Perguntas em JSON (`avaliacoes.form`). Respostas em `avaliacao_resposta_itens`: **uma linha por valor** (`question_id`, `row_id`, `option_id`, `value_text`, `value_number`, `reason`). Multiple gera uma linha por opção.
- **Resultados**: contagem e % por opção, média por pergunta de nota (e por linha da grade), média geral do score, lista das respostas abertas e dos "porquês".
- **Exportar CSV**: uma linha por aluno, **uma coluna por pergunta** (grade: uma por linha da grade) **e uma coluna "porquê"** para as perguntas com `askReason`.

---

## Fontes
- AwesomeAPI, API de Moedas: https://docs.awesomeapi.com.br/api-de-moedas
- ExchangeRate-API, Open Access (open.er-api.com): https://www.exchangerate-api.com/docs/free
- Frankfurter: https://frankfurter.dev
- fawazahmed0 exchange-api: https://github.com/fawazahmed0/exchange-api
- MyMemory, especificação: https://mymemory.translated.net/doc/spec.php · limites: https://mymemory.translated.net/doc/usagelimits.php
- LibreTranslate: https://libretranslate.com · Lingva (lista de instâncias): https://github.com/thedaviddelta/lingva-translate
- Apertium APy: https://apertium.org/apy/listPairs
- Cambridge, Guided learning hours: https://support.cambridgeenglish.org/hc/en-gb/articles/202838506-Guided-learning-hours
- Conselho da Europa, CEFR: https://www.coe.int/en/web/common-european-framework-reference-languages
- LanguageCert, Guided Learning Hours: https://www.languagecert.org/Guided-Learning-Hours
- CDC, Lei 8.078/1990 (art. 52, §1º): https://www.planalto.gov.br/ccivil_03/leis/l8078compilado.htm
- Lei 9.870/1999 (anuidades escolares): https://www.planalto.gov.br/ccivil_03/leis/l9870.htm
- Lei 14.905/2024 (juros e correção, CC arts. 389 e 406): https://www.mattosfilho.com.br/unico/lei-atualizacao-monetaria-juros/ · https://cnbsp.org.br/2025/01/09/artigo-lei-14-905-2024-uso-da-taxa-legal-como-indice-de-juros-moratorios-por-flavio-da-silva-andrade/
- Código Civil (Lei 10.406/2002): https://www.planalto.gov.br/ccivil_03/leis/2002/l10406compilada.htm
- Estudo "Avaliação configurável" (endoo, nov/2026): resumo na seção 1 do `PLANO.md`
