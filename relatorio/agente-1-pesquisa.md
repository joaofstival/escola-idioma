# Agente 1: Pesquisa

## Objetivo
Definir, com testes reais, as APIs públicas sem chave de **cotação** e **tradução** que o backend vai usar (principal, fallback e cache). Levantar também a convenção de **níveis** (nível numérico ↔ QECR), as **regras financeiras** usuais de mensalidade no Brasil e as regras do estudo **"Avaliação configurável"** que o desenvolvimento precisa implementar. Não escrevi código de aplicação.

## Passos executados
1. Li o `PLANO.md` (contrato da API, modelo de dados e divisão entre agentes).
2. **Cotação**: fiz requisições `curl` em 16/11/2026 e conferi status HTTP, CORS, `cache-control`, formato e respostas de erro.
   - AwesomeAPI `/json/last/USD-BRL,EUR-BRL`: 200, USD = 5,7833 BRL. Par inválido dá 404 `CoinNotExists`. São 52 pares XXX-BRL.
   - Frankfurter: `api.frankfurter.app` responde **301** para `api.frankfurter.dev/v1`. Tem só 30 moedas, sem ARS, CLP, PYG, UYU, COP, PEN e BOB.
   - open.er-api.com `/v6/latest/BRL`: 200, 166 moedas, atualização diária.
   - fawazahmed0 (jsdelivr e espelho pages.dev): 200, cerca de 300 moedas, chaves em minúsculas.
3. **Tradução**:
   - MyMemory `pt|en "livro"` deu "book". Testei também `pt-BR|es` e um par inválido: este volta com HTTP 200, mas `responseStatus` 403. Os limites saíram da documentação oficial: 5 mil caracteres/dia anônimo, 50 mil com e-mail, 500 bytes por consulta.
   - LibreTranslate público: exige chave (HTTP 400).
   - Lingva: 10 instâncias testadas, todas fora do ar ou atrás de um desafio da Cloudflare.
   - Google `gtx`: funciona sem chave, mas não é oficial.
   - Apertium: funciona, mas não tem pt↔en.
4. **Níveis**: busca na web sobre o QECR e as horas guiadas da Cambridge (A1 ≈ 90–100 h … C2 ≈ 1.000–1.200 h).
5. **Financeiro**:
   - Lei 9.870/1999, consultada no Planalto via WebFetch (arts. 1º §5º, 5º e 6º).
   - Busca sobre a Lei 14.905/2024 (juros legais = Selic − IPCA).
   - CDC art. 52 §1º (multa de 2%).
6. **Avaliação configurável**: transformei o resumo do PLANO.md numa lista de regras que dá para implementar (validação, trava, porquê, score de 0 a 10, resultados e CSV).

## Decisões e recomendações
- **Cotação**: principal **AwesomeAPI** (`economia.awesomeapi.com.br/json/last/XXX-BRL`, usar `bid` = valor em BRL). Fallback **open.er-api.com** (`/v6/latest/BRL`, valor em BRL = `1/rates.X`). Cache de 1 h. Se tudo falhar, devolver o cache vencido (até 72 h) marcado como `desatualizada`, ou 503.
- **Tradução**: principal **MyMemory**. Fallback **Google gtx**. Último recurso: **dicionário offline** (`dicionario.json`). Cache de 30 dias. Limite de 500 bytes na entrada (422). Se tudo falhar, 503.
- **Níveis**: 12 níveis, 2 por faixa do QECR. Rótulo "Nível 3 (A2)".
- **Financeiro**:
  - Vencimento no dia 10.
  - Multa de 2% (CDC) e juros de 1% a.m. pro rata die, só na exibição.
  - Mensalidades do mês da matrícula até dezembro.
  - Atrasada = pendente com vencimento anterior a hoje.
  - Nenhuma sanção pedagógica (Lei 9.870).

## Arquivos criados
- `docs/pesquisa.md`: relatório completo com o bloco "Decisões para o backend", exemplos reais de resposta e fontes.
- `relatorio/agente-1-pesquisa.md`: este arquivo.

## Limitações
- Os limites de uso sem chave da AwesomeAPI e do open.er-api não estão publicados com números claros. O cache compensa isso.
- O endpoint `gtx` do Google é interno e não documentado. Pode mudar ou bloquear sem aviso.
- A qualidade do MyMemory para palavras isoladas varia (ex.: "casa" pt→fr veio como "domicile").
- O texto do CDC e o do Código Civil não puderam ser baixados diretamente por `curl`: o Planalto não respondeu. A Lei 9.870 foi confirmada via WebFetch. As demais regras vêm de fontes secundárias citadas.
- As regras jurídicas são referência de mercado, não parecer jurídico. Cursos livres de idiomas seguem principalmente o CDC e o contrato.
