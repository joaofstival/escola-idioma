import type { Migration } from './index.ts';

export const migration005: Migration = {
  versao: 5,
  nome: 'biblioteca-atividades-notas',
  sql: `
CREATE TABLE arquivos_privados (
  id         TEXT PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  nome       TEXT NOT NULL,
  mime       TEXT NOT NULL,
  tamanho    INTEGER NOT NULL CHECK (tamanho BETWEEN 1 AND 5242880),
  sha256     TEXT NOT NULL,
  dados      BLOB NOT NULL
);

CREATE TABLE publicacoes_material (
  id         INTEGER PRIMARY KEY,
  grupo      TEXT NOT NULL,
  versao     INTEGER NOT NULL,
  revisao    INTEGER NOT NULL DEFAULT 1,
  turma_id   INTEGER NOT NULL REFERENCES turmas(id),
  autor_id   INTEGER NOT NULL REFERENCES usuarios(id),
  titulo     TEXT NOT NULL,
  descricao  TEXT NOT NULL DEFAULT '',
  link       TEXT,
  arquivo_id TEXT REFERENCES arquivos_privados(id),
  estado     TEXT NOT NULL CHECK (estado IN ('rascunho', 'publicado', 'arquivado')),
  acesso_ate TEXT,
  criado_em  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (grupo, versao),
  CHECK ((link IS NULL) <> (arquivo_id IS NULL))
);
CREATE INDEX ix_publicacoes_turma ON publicacoes_material(turma_id, estado);

CREATE TABLE atividades (
  id        INTEGER PRIMARY KEY,
  turma_id  INTEGER NOT NULL REFERENCES turmas(id),
  autor_id  INTEGER NOT NULL REFERENCES usuarios(id),
  titulo    TEXT NOT NULL,
  descricao TEXT NOT NULL,
  prazo     TEXT NOT NULL,
  valor_max REAL NOT NULL CHECK (valor_max > 0 AND valor_max <= 100),
  estado    TEXT NOT NULL CHECK (estado IN ('rascunho', 'publicada', 'encerrada')),
  versao    INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE entregas (
  id           INTEGER PRIMARY KEY,
  atividade_id INTEGER NOT NULL REFERENCES atividades(id),
  aluno_id     INTEGER NOT NULL REFERENCES alunos(id),
  texto        TEXT NOT NULL,
  arquivo_id   TEXT REFERENCES arquivos_privados(id),
  versao       INTEGER NOT NULL DEFAULT 1,
  entregue_em  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (atividade_id, aluno_id)
);

CREATE TABLE entregas_versoes (
  id           INTEGER PRIMARY KEY,
  entrega_id   INTEGER NOT NULL REFERENCES entregas(id),
  usuario_id   INTEGER NOT NULL REFERENCES usuarios(id),
  operacao_id  TEXT NOT NULL UNIQUE,
  payload_hash TEXT NOT NULL,
  texto        TEXT NOT NULL,
  arquivo_id   TEXT REFERENCES arquivos_privados(id),
  versao       INTEGER NOT NULL,
  criado_em    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE notas (
  id         INTEGER PRIMARY KEY,
  entrega_id INTEGER NOT NULL UNIQUE REFERENCES entregas(id),
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  nota       REAL NOT NULL CHECK (nota >= 0),
  devolutiva TEXT NOT NULL,
  publicada  INTEGER NOT NULL CHECK (publicada IN (0, 1)),
  versao     INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE notas_versoes (
  id         INTEGER PRIMARY KEY,
  nota_id    INTEGER NOT NULL REFERENCES notas(id),
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  nota       REAL NOT NULL,
  devolutiva TEXT NOT NULL,
  publicada  INTEGER NOT NULL,
  versao     INTEGER NOT NULL,
  motivo     TEXT NOT NULL,
  criado_em  TEXT NOT NULL DEFAULT (datetime('now'))
);

ALTER TABLE avaliacoes ADD COLUMN autor_id INTEGER REFERENCES usuarios(id);
ALTER TABLE avaliacoes ADD COLUMN publicada INTEGER NOT NULL DEFAULT 0 CHECK (publicada IN (0, 1));
ALTER TABLE avaliacoes
  ADD COLUMN finalidade TEXT NOT NULL DEFAULT 'feedback' CHECK (finalidade IN ('feedback', 'academica', 'autoavaliacao', 'nivel'));
ALTER TABLE avaliacao_respostas ADD COLUMN usuario_id INTEGER REFERENCES usuarios(id);
ALTER TABLE avaliacao_respostas
  ADD COLUMN origem TEXT NOT NULL DEFAULT 'legado' CHECK (origem IN ('legado', 'aluno', 'operador'));
`,
};
