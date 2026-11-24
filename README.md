# Escola de Idiomas

Aplicativo desktop (Electron) para a gestão de uma escola de idiomas: alunos, professores, idiomas e valores, turmas, matrículas, materiais, avaliações configuráveis, mensalidades, cotação de moedas e tradutor. Funciona offline; os dados ficam no computador.

## Instalar e rodar

Requer Node 24 ou mais novo.

```bash
npm install
npm start          # compila e abre o aplicativo (banco vazio recebe dados de exemplo)
npm run seed       # APAGA todos os dados e recria os dados de exemplo
```

Atenção: `npm run seed` destrói o banco em uso. Para experimentar sem risco, use uma pasta temporária (veja abaixo).

## Verificar

```bash
npm test               # backend e regras (node --test)
npm run test:ui        # telas (Vitest + Testing Library)
npm run lint           # ESLint
npm run format:check   # Prettier (npm run format corrige)
npm run typecheck
npm run build
```

O CI (`.github/workflows/ci.yml`) roda tudo isso em Node 24.

## Onde ficam os dados

Em `~/Library/Application Support/escola-idioma/` (macOS):

- `escola.db`: o banco (SQLite).
- `backups/`: backups automáticos (ao abrir e a cada dia de uso; os 14 mais recentes) e manuais.
- `escola.db.pre-migracao`: cópia feita antes de atualizar o formato do banco.
- `escola.db.pre-restauracao-<data>`: o banco que estava em uso antes de uma restauração.

Para testar sem tocar nos dados reais: `ESCOLA_USERDATA=/pasta/temporaria npm start`.

## Backup e restauração

Na tela **Configurações**:

- **Fazer backup agora** cria um backup em `backups/`.
- **Exportar cópia** salva uma cópia do banco onde você escolher (pen drive, nuvem).
- **Restaurar de arquivo** troca os dados atuais pelos de um arquivo de backup `.db`. O app valida o arquivo (um arquivo que não é backup válido é recusado sem alterar nada), guarda o banco atual como `pre-restauracao` e reinicia.

## Mais

- Plano, arquitetura e contrato da API: `PLANO.md`.
- Padrão visual: `docs/DESIGN.md`.
- Pesquisa de integrações e regras (cotação, tradução, financeiro): `docs/pesquisa.md`.


## Correções da reestruturação — parte 1/8

- Backups usam sincronização de arquivo compatível com Windows. A garantia de persistência de metadados do rename depende do sistema de arquivos; o Node não oferece fsync de diretório no Windows.
- A restauração valida schema/constraints/índices da versão, recusa objetos inesperados e revalida a cópia no reinício. A origem preparada só é removida após concluir a troca; o banco anterior fica guardado para recuperação.
- Configurações mostra última tentativa, último sucesso e falhas de backup. A falha permanece visível até outra cópia ser concluída.
- Pagamento abaixo do total devido na data escolhida é recusado, sem alterar a mensalidade. Pagamentos parciais e descontos autorizados serão implementados na parte financeira do plano; não devem ser simulados quitando uma parcela por valor menor.
- Dados de exemplo são criados apenas em banco novo (ou com o comando destrutivo de seed explícito), preservando um banco existente/restaurado vazio nas próximas aberturas.
- O CI verifica Windows e Linux; a execução remota só pode ser confirmada após o workflow rodar no GitHub.

A API local ganhou `GET /backups/estado`, retornando `ultimaTentativa`, `ultimoSucesso` e `erro` sem caminhos internos. Tentativa/erro referem-se à sessão; na reabertura, o último backup persistido é usado como referência e a rotina automática é executada novamente.
