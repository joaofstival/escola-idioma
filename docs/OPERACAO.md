# Execução e entrega

## Demonstração local (dados fictícios)

Requer Node 24 atualizado e npm. Na pasta do projeto execute `npm ci`, depois `npm run server:demo`. Na primeira inicialização o terminal informa as contas `admin@demo.escola`, `aluno@demo.escola`, `professor@demo.escola`, `secretaria@demo.escola` e `financeiro@demo.escola`, com uma senha aleatória compartilhada somente para a demonstração. Em outro terminal execute `npm start`. O servidor precisa permanecer aberto. Para repetir, use os mesmos dados em `var/demo`; a senha não é exibida novamente. Opcionalmente defina `ESCOLA_DEMO_PASSWORD` com 12 a 128 caracteres antes da primeira execução. Nunca use contas de demonstração na escola real.

## Servidor real

1. Use uma pasta privada no computador/servidor da escola, fora de pastas sincronizadas. Defina `ESCOLA_SERVER_DATA` para ela. Restrinja leitura e escrita à conta de serviço e operadores autorizados; inclua disco e cópias na política de criptografia do sistema operacional.
2. Com o servidor parado, defina `ESCOLA_ADMIN_EMAIL` e `ESCOLA_ADMIN_PASSWORD` (mínimo 12 caracteres) e execute `npm run server:admin`. Isso cria apenas o primeiro administrador, sem dados de exemplo. Remova imediatamente essas variáveis da sessão. Não escreva senhas em arquivos versionados.
3. Execute `npm run server`. O processo usa um arquivo de exclusão `server.lock`; execute uma instância por pasta. Após queda, confirme que o PID registrado terminou antes de remover o lock. Configure o supervisor do sistema para reinício, logs e início automático. A pasta precisa sobreviver à atualização do programa.
4. Para uso doméstico pela internet, configure um domínio, DNS e proxy HTTPS. Exemplo em `deploy/Caddyfile.example`. Mantenha a API em `127.0.0.1:3489`; exponha apenas HTTPS no proxy/firewall. O exemplo exige instalação e configuração real do proxy. Não abra a porta 3489 na internet.
5. No desktop, abra “Conexão com a escola” na tela de login e informe `https://seu-dominio`. A configuração fica no perfil do Windows; tokens de sessão ficam somente na memória do processo principal. O aplicativo não guarda o banco de alunos.
6. Cadastre idiomas, professores, alunos, turmas e matrículas pelo administrador/secretaria. Em Contas e acesso, o administrador cria a conta vinculada e entrega pessoalmente o código de ativação ao titular. A pessoa escolhe sua senha no primeiro acesso. Recuperação é por novo código emitido pelo administrador e revoga as sessões anteriores. Não há envio automático de e-mail.

Acesso externo ainda depende de hospedagem, domínio e certificado reais: esses recursos não foram publicados nesta implementação. Sem o servidor, os dados escolares não estão disponíveis; a indicação de desconexão é apresentada ao usuário.

## Cópias e restauração

O servidor cria cópias SQLite consistentes (incluindo materiais, entregas e versões em BLOB), ao iniciar e a cada dia de operação; mantém 14 automáticas. O administrador pode criar cópia manual em Configurações. A exportação exige novamente sua senha e deve ser guardada em local protegido, separado do servidor. Backups contêm dados pessoais e hashes, portanto também exigem controle de acesso. O cadastro de anexos valida extensão, MIME, assinatura inicial e tamanho; não equivale a antivírus.

Para restaurar: pare o servidor, mantenha `ESCOLA_SERVER_DATA` igual, defina temporariamente `ESCOLA_ADMIN_EMAIL` e `ESCOLA_ADMIN_PASSWORD` da conta atual e execute `npm run server:ops -- restaurar "C:/backup/escola-manual-....db"`. Remova as variáveis e execute `npm run server`. A validação recusa schema adulterado, versões futuras e referências inválidas. A troca em duas fases guarda a versão anterior, reaplica migrações conhecidas e revoga sessões e códigos após a restauração. O evento de preparação fica também no log operacional fora do snapshot. Para uma cópia com o servidor parado: `npm run server:ops -- backup`.

Teste periodicamente restauração em pasta isolada. Não use o arquivo vivo do banco como origem ou destino de exportação. No Windows há atomicidade por rename e flush de arquivo; fsync de diretório não é suportado como em POSIX, conforme testes e ADR.

## Distribuição

`npm run dist:win` gera instalador NSIS x64 em `release/`. O instalador inclui somente o cliente Electron, sem banco, módulos do servidor ou seed. Não é assinado digitalmente. Para o servidor, `npm run build` gera `dist/server/bootstrap.js`, `setup-admin.js`, `demo.js` e `operacoes.js`, executáveis com Node 24 atualizado. Fonte também pode ser executado pelos scripts npm. Não publique mapas de código e cópias de dados em hospedagem estática.

## Verificação

`npm run lint`, `npm run format:check`, `npm run typecheck`, `npm test`, `npm run test:ui` e `npm run build`. Os testes de rede usam respostas controladas, sem depender da disponibilidade de provedores. A validação local não substitui a homologação do domínio HTTPS, firewall, supervisor, armazenamento, retenção e carga da escola real.

## Limites registrados

A arquitetura é um monólito modular com serviços em classes, portas e adaptadores. O núcleo herdado de cadastros ainda fica em `src/main` por compatibilidade; ele é importado apenas pelo servidor e não entra no cliente distribuído. A persistência central usa SQLite/WAL e uma instância, com anexos na mesma transação; migração para PostgreSQL permanece evolução se houver necessidade de múltiplas instâncias ou carga concorrente maior. Indicadores acadêmicos são frequência e notas publicadas, sem aprovação/reprovação automática. Não há fluxo de responsáveis de menores, videoconferência, emissão fiscal ou pagamento on-line. O ajuste de precisão da cotação pequena foi reservado ao commit real do colega.

## Migração da instalação local anterior

Feche o Electron antigo e exporte uma cópia pelo procedimento da versão anterior. Preserve o original. No servidor central recém-configurado, use o comando de restauração com essa cópia. Ao iniciar, as migrations numeradas preservam IDs e registros legados; pagamentos antigos recebem movimentações de origem legada, sem inventar autor. Como o banco antigo não tinha contas, pare a API e execute novamente `server:admin` para criar o primeiro administrador nessa base restaurada. Compare contagens de alunos, professores, idiomas, turmas, matrículas, avaliações e mensalidades, além de totais por competência, antes de liberar usuários. Cadastros de materiais antigos são referências de catálogo; o arquivo físico que nunca existiu no sistema antigo precisa ser publicado separadamente na biblioteca. A instalação real do usuário não foi substituída automaticamente.

## Integrações externas

Quatro finalidades: tradução para estudo (MyMemory, alternativa e dicionário), cotação informativa (AwesomeAPI, alternativa e cache persistido de até 72h), preenchimento opcional de endereço por CEP ([ViaCEP](https://viacep.com.br/)) e feriados nacionais para planejamento ([BrasilAPI](https://brasilapi.com.br/docs)). Todos passam pelo servidor, têm timeout e validação; CEP e feriados não bloqueiam o cadastro manual nem alteram aulas. Não digite dados pessoais ou sigilosos no tradutor: a consulta é enviada ao provedor externo. Cotações não determinam o valor de uma cobrança contratada em reais.
