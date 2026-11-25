import type { Migration } from './index.ts';

export const migration007: Migration = {
  versao: 7,
  nome: 'audiencia-por-perfil',
  sql: `
ALTER TABLE avisos
  ADD COLUMN papel_destino TEXT CHECK (papel_destino IS NULL OR papel_destino IN ('admin', 'secretaria', 'financeiro', 'professor', 'aluno'));
`,
};
