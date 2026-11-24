# Validação local — 24/11/2026

- 155 testes de backend aprovados, cobrindo banco novo e legado, rollback, backups Windows, recuperação em duas fases, autenticação/revogação, isolamento entre alunos/professores, arquivos privados, notas, pagamentos parciais/estornos, horário/frequência/transferência, avisos e paginação.
- 25 testes de interface aprovados, incluindo entrada sem sessão e limpeza da área do aluno após logout sem rede.
- Typecheck, lint e Prettier aprovados; os três avisos anteriores de React Hook Form foram corrigidos.
- Electron real conectado à API central: capturas de administração (agenda, biblioteca, atividades, avisos, configurações), aluno e professor; dados fictícios. Capturas locais ficam em var/capturas-*, fora do Git.
- Build separado do cliente e ferramentas de servidor; instalador NSIS x64 gerado em release. Sem assinatura digital.
- Recuperação em pasta temporária confirmou restauração do anexo privado, hash íntegro, dados anteriores ao snapshot e invalidação das sessões/códigos.
- Auditoria de dependências de produção: nenhuma vulnerabilidade reportada pelo npm audit --omit=dev na validação local. Dependências de build têm alertas moderados que exigem acompanhamento de atualizações; não foi aplicado upgrade incompatível automático.

A matriz do CI remoto ainda não foi executada nesta sessão. Não foram certificados Windows limpo sem ferramentas, carga de produção ou acesso externo pelo domínio da escola. Instalar na máquina de desenvolvimento não comprova esses ambientes. Hospedagem, TLS/DNS, entrega real de e-mail, supervisão e migração dos dados reais exigem homologação operacional conforme OPERACAO.md.
