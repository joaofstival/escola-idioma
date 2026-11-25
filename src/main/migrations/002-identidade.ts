import type { Migration } from './index.ts';

export const migration002: Migration = {
  versao: 2,
  nome: 'identidade-central',
  sql: `
CREATE TABLE usuarios (
  id           INTEGER PRIMARY KEY,
  nome         TEXT NOT NULL,
  email        TEXT NOT NULL COLLATE NOCASE UNIQUE,
  senha_hash   TEXT NOT NULL,
  papel        TEXT NOT NULL CHECK (papel IN ('admin', 'secretaria', 'financeiro', 'professor', 'aluno')),
  aluno_id     INTEGER UNIQUE REFERENCES alunos(id) ON DELETE RESTRICT,
  professor_id INTEGER UNIQUE REFERENCES professores(id) ON DELETE RESTRICT,
  ativo        INTEGER NOT NULL DEFAULT 0 CHECK (ativo IN (0, 1)),
  CHECK (
    (papel = 'aluno' AND aluno_id IS NOT NULL AND professor_id IS NULL)
    OR (papel = 'professor' AND professor_id IS NOT NULL AND aluno_id IS NULL)
    OR (papel NOT IN ('aluno', 'professor') AND aluno_id IS NULL AND professor_id IS NULL)
  )
);

CREATE TABLE sessoes (
  token_hash TEXT PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  expira_em  INTEGER NOT NULL
);

CREATE TABLE acessos_temporarios (
  codigo_hash TEXT PRIMARY KEY,
  usuario_id  INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  expira_em   INTEGER NOT NULL
);

CREATE TABLE auditoria (
  id         INTEGER PRIMARY KEY,
  usuario_id INTEGER REFERENCES usuarios(id),
  acao       TEXT NOT NULL,
  recurso    TEXT NOT NULL,
  motivo     TEXT,
  criado_em  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_sessoes_usuario ON sessoes(usuario_id);
`,
};
