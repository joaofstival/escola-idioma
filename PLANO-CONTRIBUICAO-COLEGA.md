# Contribuição pequena e independente

Objetivo: melhorar a precisão visual de cotações pequenas (por exemplo, guarani/paraguaio e peso chileno), para não apresentar uma taxa positiva como R$ 0,00 por arredondamento.

1. Criar uma branch própria a partir de developer após o merge da reestruturação.
2. Localizar a formatação de taxa em src/renderer/pages/cotacao.tsx e os utilitários de apresentação. Usar até seis casas decimais para taxas pequenas, preservando duas casas para valores monetários de mensalidade. A regra muda apenas apresentação de cotação, nunca cobrança.
3. Verificar uma taxa comum e uma menor que R$ 0,01, estados vazios e valores inválidos. Acrescentar um teste de formatação proporcional se criar um helper reutilizável.
4. Rodar typecheck, lint e os testes pertinentes.
5. O colega deve revisar e fazer o commit com sua própria conta/autoria, por exemplo: `{fix}: preserva precisao de cotacoes pequenas`.

Esta tarefa permanece reservada; não foi implementada nem atribuída ao colega artificialmente.
