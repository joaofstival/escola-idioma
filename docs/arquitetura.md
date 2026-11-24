# Arquitetura de implementação

## Contexto

Escola presencial com clientes Electron de administração, professor e aluno. Dados compartilhados são obtidos pela API central; o cliente não recebe credenciais ou cópia do banco.

```mermaid
flowchart LR
 A[Administrador] --> E[Electron]
 P[Professor] --> E
 L[Aluno] --> E
 E -->|HTTPS| S[API central TypeScript]
 S --> D[(Banco privado)]
 S --> F[Arquivos privados]
 S --> I[Integrações externas]
```

## Componentes

Transporte HTTP valida formato/limites e delega à aplicação. Serviços em classes definem regras e escopo; portas delimitam consultas e efeitos; repositórios implementam SQL. O bootstrap compõe os adaptadores. `academic/application` não importa frameworks, banco ou Electron.

O backend anterior em `src/main` é um adaptador de compatibilidade durante a extração. Ele não é distribuído como autoridade de dados no modo central; cada novo fluxo de acesso público deve passar pela autenticação/autorização central. Essa transição não equivale a uma refatoração integral já concluída.

Ver ADR 001 para escolha do banco, limites de instância única e migração. Desenvolvimento usa bind loopback; publicação exige proxy HTTPS e autenticação individual concluída. Testes de rede usam servidor real em porta efêmera e banco temporário, sem serviços da escola.

## Relações centrais

```mermaid
erDiagram
 USUARIOS ||--o{ SESSOES : autentica
 ALUNOS ||--o{ MATRICULAS : possui
 PROFESSORES ||--o{ TURMAS : leciona
 IDIOMAS ||--o{ TURMAS : define
 TURMAS ||--o{ MATRICULAS : recebe
 MATRICULAS ||--o{ MENSALIDADES : gera
 MENSALIDADES ||--o{ MOVIMENTACOES_FINANCEIRAS : registra
 TURMAS ||--o{ AULAS : agenda
 AULAS ||--o{ PRESENCAS : registra
 TURMAS ||--o{ PUBLICACOES_MATERIAL : publica
 ARQUIVOS_PRIVADOS ||--o{ PUBLICACOES_MATERIAL : anexa
 TURMAS ||--o{ ATIVIDADES : propoe
 ATIVIDADES ||--o{ ENTREGAS : recebe
 ENTREGAS ||--o| NOTAS : avalia
 NOTAS ||--o{ NOTAS_VERSOES : preserva
 USUARIOS ||--o{ SOLICITACOES : abre
 SOLICITACOES ||--o{ SOLICITACOES_HISTORICO : acompanha
```

## Fluxos críticos

```mermaid
sequenceDiagram
 participant E as Electron main
 participant A as API central
 participant I as Identidade
 participant S as Serviço de módulo
 participant R as Repositório privado
 E->>A: Login com email e senha (HTTPS)
 A->>I: Verificar scrypt, estado e tentativas
 I-->>E: Sessão opaca (somente memória do main)
 E->>A: Operação com Bearer
 A->>I: Exigir sessão ativa e não expirada
 A->>S: Contexto autenticado e entrada validada
 S->>S: Autorizar ação e vínculo da turma
 S->>R: Transação e auditoria
 R-->>E: DTO autorizado
```

Matrícula e geração de cobranças usam a mesma unidade de trabalho SQLite; falhas revertem ambas. Pagamentos/estornos usam identificador de operação, centavos e movimentações preservadas. Download consulta primeiro a publicação visível ao titular e seu vínculo ativo; somente depois devolve o anexo privado e verifica seu hash. Backup usa snapshot do mesmo banco, incluindo anexos, evitando sincronização frágil entre duas fontes.
