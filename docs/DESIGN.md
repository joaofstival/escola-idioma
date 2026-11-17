# Padrão visual — Escola de Idiomas

Ferramenta de trabalho de escritório (desktop, mouse e teclado), não vitrine. Fundo **branco**, poucas cores, densidade média. Decisões de 16/11/2026: acento índigo, Inter 14px, controles de 36px.

Base: Vite + React + TypeScript + Tailwind v4 + shadcn/ui. **Tokens são variáveis CSS em `src/renderer/index.css`** (formato shadcn); nunca hex ou cor literal em componente.

## Cores (contraste medido, fórmula WCAG)

| Token | Valor | Uso | Contraste |
|---|---|---|---|
| `--background` / `--card` | `#FFFFFF` | fundo da app e dos cards | — |
| `--inset` (`--muted`) | `#F8FAFC` | cabeçalho de tabela, áreas rebaixadas, hover de linha | — |
| `--foreground` | `#0F172A` | texto principal | 17,9:1 |
| `--muted-foreground` | `#475569` | texto secundário, rótulos | 7,6:1 (7,2 sobre inset) |
| `--border` | `#E2E8F0` | divisórias, bordas de card | decorativo |
| `--input` | `#64748B` | borda de campo | 4,8:1 (piso 3:1) |
| `--primary` | `#4338CA` | botão primário, link, seleção, anel de foco | 7,9:1 |
| `--primary-foreground` | `#FFFFFF` | texto sobre primário | 7,9:1 |
| `--accent` | `#EEF2FF` | item selecionado, hover de menu (texto `--primary`) | 7,1:1 |
| `--destructive` | `#B91C1C` | apagar/cancelar, erro (texto branco sobre ele) | 6,5:1 |
| `--success-soft` / `--success-deep` | `#DCFCE7` / `#166534` | status positivo | 6,5:1 |
| `--warning-soft` / `--warning-deep` | `#FEF3C7` / `#92400E` | atenção, atraso | 6,4:1 |
| `--danger-soft` / `--danger-deep` | `#FEE2E2` / `#B91C1C` | erro, inadimplente | 5,3:1 |
| `--info-soft` / `--info-deep` | `#DBEAFE` / `#1D4ED8` | informação neutra | 5,5:1 |

Regras:
- Acento só em **ação, seleção e foco**. Status usa as famílias semânticas, nunca o índigo.
- Preenche com `-soft`, **escreve com `-deep`**. Verde/âmbar/vermelho puros nunca são texto.
- **Cor nunca é o único código:** todo status leva texto (e ícone, quando couber) junto. Ex.: badge "Atrasada", não só um ponto vermelho.
- Sem gradiente, sem vidro, sem tema escuro por ora (a base de tokens já permite adicionar depois).

## Tipografia

- **Inter**, empacotada localmente (`@fontsource-variable/inter`); app offline, sem Google Fonts.
- Corpo **14px**/1,5; rótulo e legenda 12px (mínimo); título de seção 16px/600; título de página 20px/600; KPI 28px/600.
- Pesos: 400, 500, 600. Números de tabela, valores em R$ e KPI com `tabular-nums`.
- Caixa-alta só em rótulo curto (cabeçalho de coluna não usa).

## Espaço, raio, sombra

- Escala de 4: 4, 8, 12, 16, 24, 32, 48. Entre seções 32, dentro de card 16–24, entre itens 8. Use `gap`.
- Raio: `--radius` 8px (campo, botão), cards 12px, badge pílula. Nenhum outro.
- Sombra: só em popover/menu/modal (`shadow-md`, com blur). Cards usam borda, não sombra.
- Card nunca dentro de card.

## Componentes (shadcn em `src/renderer/components/ui/`)

- **Alvo mínimo:** controles de **36px** de altura (`h-9`); ícone-botão 36×36; 8px entre alvos.
- Base: `button`, `input`, `select`, `textarea`, `label`, `table`, `badge`, `dialog`, `alert-dialog`, `dropdown-menu`, `tabs`, `sonner` (toast), `skeleton`, `empty`, `form` (react-hook-form + zod).
- Variante nova de componente = mudança no componente base, não cópia. Vale para todas as telas.
- **Ícones:** um vocabulário só, `lucide-react`. Nada de emoji nem glifo unicode.
- **Foco visível:** anel de 2px `--primary` com 2px de offset em todo interativo.
- **Estados** de todo interativo: padrão, hover, foco, ativo, desabilitado (com motivo no tooltip), carregando (botão com spinner e rótulo mantido), erro.
- Movimento: 150ms, só `transform`/`opacity`, ease-out; respeitar `prefers-reduced-motion`.

## Layout de página

Janela do Electron com **barra lateral fixa à esquerda** (240px, fundo `--inset`, item ativo em `--accent`) e área de conteúdo branca com largura máxima 1200px.

- **Lista:** cabeçalho (título à esquerda; ações à direita, secundária antes da primária) → filtros → tabela → paginação.
- **Detalhe:** cabeçalho com título e ações → seções sem card aninhado.
- **Formulário:** campos em grade de 2 colunas (1 em janela estreita), rodapé fixo `[Cancelar] [Salvar]`. Rótulo sempre visível acima do campo; placeholder nunca faz papel de rótulo.
- Inline antes de modal; modal só para confirmação ou fluxo curto.

## Dados e textos

- Tabela: cabeçalho fixo, número e valor alinhados à direita, ação da linha em menu `⋯` (36px), linha inteira clicável quando abrir detalhe. Estado vazio com texto e a ação para criar; carregando com `skeleton` da própria tabela.
- Datas `dd/mm/aaaa`; dinheiro `R$ 1.234,56`; campo vazio mostra "—", nunca `null`/`NaN`.
- Botão = verbo + objeto ("Salvar aluno", "Apagar matrícula"); nunca "OK" ou "Sim". Erro diz o que houve e o que fazer. Toda ação destrutiva pede `alert-dialog` com o nome do item.
- Português do Brasil, com acentuação completa.

## Pisos de acessibilidade

Texto ≥ 4,5:1 (grande ≥ 3:1); borda de campo, ícone e foco ≥ 3:1; navegação completa por teclado; `aria-label` em todo botão só com ícone; erro de formulário ligado ao campo (`aria-describedby`).
