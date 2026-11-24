# Permissões e rotas

| Capacidade | Admin | Secretaria | Financeiro | Professor | Aluno |
|---|---|---|---|---|---|
| Contas e códigos | Gerencia | Não | Não | Não | Própria senha |
| Cadastros e matrículas | Gerencia | Gerencia | Nome/ID para cobrança | Lista mínima da própria turma | Não |
| Agenda oficial | Gerencia | Gerencia | Não | Consulta própria turma | Consulta própria turma |
| Chamada | Gerencia | Consulta agenda | Não | Própria turma | Frequência própria |
| Arquivo/material publicado | Gerencia | Consulta | Não | Publica na própria turma | Publicado e autorizado |
| Atividades/notas | Gerencia | Não | Não | Turmas atribuídas | Entrega e nota publicada própria |
| Financeiro | Gerencia | Não | Gerencia | Não | Consulta própria |
| Avisos | Todos os destinos | Todos os destinos | Recebe | Publica para sua turma | Recebe |
| Solicitações | Atende | Atende | Próprias | Próprias | Próprias |
| Backup | Cria/exporta com senha | Não | Não | Não | Não |

A API é `/api/v1`; GET `/health` divulga apenas disponibilidade e versão pública do protocolo. Rotas de login/ativação são públicas com limites; o restante exige sessão. Não existe papel informado pelo cliente que substitua a sessão do servidor.

Contratos novos estão em `src/shared/contracts`: identidade, pedagogia e paginação. Rotas principais: `/auth/*`, `/admin/usuarios`, `/portal/turmas`, `/portal/dashboard`, `/portal/mensalidades`, `/academico/aulas`, `/academico/horarios`, `/academico/transferencias`, `/academico/frequencia`, `/biblioteca`, `/atividades`, `/avaliacoes`, `/avisos`, `/solicitacoes`, `/ferramentas/cep`, `/ferramentas/feriados`, `/operacoes/backup/exportar`. Os CRUDs existentes passam pela mesma autorização central.

Downloads não são arquivos públicos: passam pela sessão, turma/publicação ou entrega autorizada. Notas em rascunho não aparecem para alunos. Exportações coletivas de avaliações são negadas a alunos. Histórico acadêmico da secretaria não inclui movimentos financeiros; professor não recebe documento, contato ou saldo de estudantes.

Os testes de integração exercitam troca de IDs, listas, exportações, contas desativadas, sessão revogada, alunos distintos e professores distintos. Ocultar menu é conveniência da interface; não é a barreira de segurança.
