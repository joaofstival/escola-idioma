# ADR 001 — Monólito modular central

A escola terá clientes Electron sem cópia do banco completo. Uma API central é a autoridade para autenticação, autorização e transações.

O ambiente de desenvolvimento disponível não possui PostgreSQL ou Docker. Nesta entrega a API usa SQLite privado no servidor, com WAL, restrições e transações, em uma única instância/processo. Isso não é SQLite compartilhado em rede nem banco no computador do aluno. A implantação exige volume persistente e backup; múltiplas réplicas de escrita não são suportadas. PostgreSQL permanece evolução para escala/disponibilidade que justifique a migração, por repositórios, sem simular testes de um motor indisponível.

A migração inicial mantém IDs e schema existentes: transferir uma cópia consistente validada ao diretório privado do servidor. Banco vazio central não recebe seed automaticamente. O legado continua como adaptador transitório; novos fluxos são implementados em módulos com serviços de aplicação e persistência isolada. A autenticação individual deve estar concluída antes de exposição remota.

## Decisão final sobre anexos e distribuição

Materiais e entregas ficam em tabelas privadas de BLOB, com hash SHA-256, limites e autorização por publicação/turma. Essa escolha mantém banco e anexos no mesmo snapshot e simplifica recuperação de uma escola pequena. Não há pasta pública de uploads. O instalador contém apenas main/preload/renderer; o bundle do main não contém SQLite, seed ou serviços de domínio. O código herdado em src/main é compatibilidade de organização de fontes, não persistência do cliente. A restauração é operação de manutenção, com servidor parado, exclusão por lock e reautenticação de administrador.
