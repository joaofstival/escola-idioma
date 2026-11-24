# ADR 001 — Monólito modular central

A escola terá clientes Electron sem cópia do banco completo. Uma API central é a autoridade para autenticação, autorização e transações.

O ambiente de desenvolvimento disponível não possui PostgreSQL ou Docker. Nesta entrega a API usa SQLite privado no servidor, com WAL, restrições e transações, em uma única instância/processo. Isso não é SQLite compartilhado em rede nem banco no computador do aluno. A implantação exige volume persistente e backup; múltiplas réplicas de escrita não são suportadas. PostgreSQL permanece evolução para escala/disponibilidade que justifique a migração, por repositórios, sem simular testes de um motor indisponível.

A migração inicial mantém IDs e schema existentes: transferir uma cópia consistente validada ao diretório privado do servidor. Banco vazio central não recebe seed automaticamente. O legado continua como adaptador transitório; novos fluxos são implementados em módulos com serviços de aplicação e persistência isolada. A autenticação individual deve estar concluída antes de exposição remota.
