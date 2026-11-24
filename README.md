# Escola de Idiomas

Aplicativo Electron para uma escola presencial, com servidor central e áreas de administração, professor e aluno. Os estudantes consultam materiais, agenda, frequência, atividades, notas publicadas e mensalidades próprias. Professores acompanham suas turmas; administração, secretaria e financeiro têm permissões diferentes, aplicadas no servidor.

## Começar pela demonstração

Requer Node 24 atualizado (24.15 ou superior) e npm no ambiente de desenvolvimento/servidor.

```powershell
npm ci
npm run server:demo
```

Na primeira execução, o terminal informa a senha de demonstração e as contas `admin@demo.escola`, `aluno@demo.escola`, `professor@demo.escola`, `secretaria@demo.escola` e `financeiro@demo.escola`. Em outro terminal:

```powershell
npm start
```

Mantenha o servidor aberto. A demonstração usa dados fictícios em `var/demo`, separados do servidor real. `npm run seed` é um alias da demonstração e não apaga a base existente.

## Instalar o desktop

`npm run dist:win` gera `release/Escola-Idiomas-0.1.0-Setup.exe`. O cliente instalado não exige Node e não contém o banco da escola. Na tela de login, “Conexão com a escola” permite salvar o endereço HTTPS do servidor. HTTP é aceito apenas no computador local.

## Servidor e acesso de casa

Leia [o guia de operação](docs/OPERACAO.md) para criar o primeiro administrador, configurar domínio/proxy HTTPS, ativar contas, importar a base antiga e fazer recuperação. `npm run server:admin` provisiona o primeiro administrador com credenciais temporárias de ambiente; `npm run server` inicia a API real, sem seed automático.

A hospedagem pública não foi configurada. A API precisa estar disponível para acessar os dados compartilhados; o desktop não oferece uma cópia offline do banco de alunos.

## Funcionalidades

- Cadastros, habilitações docentes, turmas, matrículas, transferências, horários, aulas, chamada e frequência.
- Biblioteca privada por turma, arquivos e versões, atividades, entregas, avaliações presenciais e notas com publicação e histórico.
- Financeiro em centavos: pagamentos parciais, estornos preservados, descontos/ajustes, saldo, políticas versionadas, caixa/competência e extratos.
- Avisos segmentados, leituras e solicitações de atendimento com histórico.
- Tradução, cotação com cache persistido, CEP opcional e consulta de feriados nacionais.
- Backups centrais incluem anexos; exportação exige senha administrativa, restauração exige manutenção no servidor e revoga sessões.

## Verificar

```powershell
npm run typecheck
npm run lint
npm run format:check
npm test
npm run test:ui
npm run build
```

CI configurado para Windows e Linux. A execução remota no GitHub depende do envio e do workflow; os resultados locais não são apresentados como execução remota.

## Documentação

- [Plano e registro de execução](PLANO.md)
- [Arquitetura](docs/arquitetura.md) e [decisão de persistência central](docs/adr/001-arquitetura-central.md)
- [Operação, demonstração e implantação](docs/OPERACAO.md)
- [Contribuição reservada ao colega](PLANO-CONTRIBUICAO-COLEGA.md)
- [Padrão visual](docs/DESIGN.md)

A persistência atual é SQLite/WAL central em uma instância; a evolução para PostgreSQL e testes de carga dependem da escala da escola. Consulte os limites e critérios de homologação no guia operacional.
