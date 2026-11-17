// Migration 001: schema original do app (11 tabelas). Usa IF NOT EXISTS de propósito: os arquivos
// gravados pelo motor antigo já têm essas tabelas (user_version = 1) e seguem como estão.
import type { Migration } from './index.ts';

export const migration001: Migration = {
  versao: 1,
  nome: 'schema-inicial',
  sql: `
CREATE TABLE IF NOT EXISTS idiomas (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  nome        TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK (length(trim(nome)) > 0),
  codigo      TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK (length(trim(codigo)) > 0),
  mensalidade REAL NOT NULL CHECK (mensalidade >= 0)
);

CREATE TABLE IF NOT EXISTS alunos (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  nome            TEXT NOT NULL CHECK (length(trim(nome)) > 0),
  data_nascimento TEXT,
  documento       TEXT,
  email           TEXT,
  telefone        TEXT,
  endereco        TEXT,
  pais_origem     TEXT,
  moeda_origem    TEXT NOT NULL DEFAULT 'BRL' CHECK (length(moeda_origem) = 3),
  ativo           INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0, 1)),
  criado_em       TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_alunos_documento ON alunos(documento) WHERE documento IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_alunos_nome ON alunos(nome);
CREATE INDEX IF NOT EXISTS ix_alunos_ativo ON alunos(ativo);

CREATE TABLE IF NOT EXISTS professores (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  nome     TEXT NOT NULL CHECK (length(trim(nome)) > 0),
  email    TEXT,
  telefone TEXT,
  ativo    INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0, 1))
);

CREATE TABLE IF NOT EXISTS professor_idiomas (
  professor_id INTEGER NOT NULL REFERENCES professores(id) ON DELETE CASCADE,
  idioma_id    INTEGER NOT NULL REFERENCES idiomas(id) ON DELETE RESTRICT,
  PRIMARY KEY (professor_id, idioma_id)
);
CREATE INDEX IF NOT EXISTS ix_professor_idiomas_idioma ON professor_idiomas(idioma_id);

CREATE TABLE IF NOT EXISTS turmas (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  nome         TEXT NOT NULL CHECK (length(trim(nome)) > 0),
  idioma_id    INTEGER NOT NULL REFERENCES idiomas(id) ON DELETE RESTRICT,
  nivel        INTEGER NOT NULL CHECK (nivel BETWEEN 1 AND 12),
  ano_letivo   INTEGER NOT NULL CHECK (ano_letivo BETWEEN 2000 AND 2100),
  professor_id INTEGER REFERENCES professores(id) ON DELETE RESTRICT,
  horario      TEXT,
  capacidade   INTEGER NOT NULL CHECK (capacidade >= 1),
  UNIQUE (nome, ano_letivo)
);
CREATE INDEX IF NOT EXISTS ix_turmas_filtro ON turmas(ano_letivo, idioma_id, nivel);
CREATE INDEX IF NOT EXISTS ix_turmas_professor ON turmas(professor_id);

CREATE TABLE IF NOT EXISTS matriculas (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  aluno_id   INTEGER NOT NULL REFERENCES alunos(id) ON DELETE RESTRICT,
  turma_id   INTEGER NOT NULL REFERENCES turmas(id) ON DELETE RESTRICT,
  ano_letivo INTEGER NOT NULL CHECK (ano_letivo BETWEEN 2000 AND 2100),
  tipo       TEXT NOT NULL DEFAULT 'matricula' CHECK (tipo IN ('matricula', 'rematricula')),
  status     TEXT NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa', 'cancelada', 'concluida')),
  data       TEXT NOT NULL DEFAULT (date('now', 'localtime')),
  UNIQUE (aluno_id, turma_id, ano_letivo)
);
CREATE INDEX IF NOT EXISTS ix_matriculas_turma ON matriculas(turma_id, status);
CREATE INDEX IF NOT EXISTS ix_matriculas_aluno ON matriculas(aluno_id);
CREATE INDEX IF NOT EXISTS ix_matriculas_ano ON matriculas(ano_letivo);

CREATE TABLE IF NOT EXISTS materiais (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  titulo     TEXT NOT NULL CHECK (length(trim(titulo)) > 0),
  tipo       TEXT NOT NULL CHECK (tipo IN ('livro', 'apostila', 'audio', 'video', 'link', 'outro')),
  idioma_id  INTEGER NOT NULL REFERENCES idiomas(id) ON DELETE RESTRICT,
  nivel      INTEGER NOT NULL CHECK (nivel BETWEEN 1 AND 12),
  autor      TEXT,
  referencia TEXT,
  descricao  TEXT
);
CREATE INDEX IF NOT EXISTS ix_materiais_idioma_nivel ON materiais(idioma_id, nivel);

CREATE TABLE IF NOT EXISTS mensalidades (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  matricula_id    INTEGER NOT NULL REFERENCES matriculas(id) ON DELETE RESTRICT,
  aluno_id        INTEGER NOT NULL REFERENCES alunos(id) ON DELETE RESTRICT,
  competencia     TEXT NOT NULL CHECK (competencia GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]'),
  valor           REAL NOT NULL CHECK (valor >= 0),
  vencimento      TEXT NOT NULL CHECK (vencimento GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
  status          TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'paga', 'cancelada')),
  data_pagamento  TEXT,
  valor_pago      REAL CHECK (valor_pago IS NULL OR valor_pago >= 0),
  forma_pagamento TEXT,
  UNIQUE (matricula_id, competencia),
  CHECK (status <> 'paga' OR (data_pagamento IS NOT NULL AND valor_pago IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS ix_mensalidades_aluno ON mensalidades(aluno_id);
CREATE INDEX IF NOT EXISTS ix_mensalidades_status_venc ON mensalidades(status, vencimento);
CREATE INDEX IF NOT EXISTS ix_mensalidades_competencia ON mensalidades(competencia);

CREATE TABLE IF NOT EXISTS avaliacoes (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  turma_id  INTEGER NOT NULL REFERENCES turmas(id) ON DELETE RESTRICT,
  titulo    TEXT NOT NULL CHECK (length(trim(titulo)) > 0),
  descricao TEXT,
  form      TEXT NOT NULL CHECK (json_valid(form)),
  criado_em TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);
CREATE INDEX IF NOT EXISTS ix_avaliacoes_turma ON avaliacoes(turma_id);

CREATE TABLE IF NOT EXISTS avaliacao_respostas (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  avaliacao_id INTEGER NOT NULL REFERENCES avaliacoes(id) ON DELETE CASCADE,
  aluno_id     INTEGER NOT NULL REFERENCES alunos(id) ON DELETE RESTRICT,
  score        REAL CHECK (score IS NULL OR score BETWEEN 0 AND 10),
  criado_em    TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  UNIQUE (avaliacao_id, aluno_id)
);
CREATE INDEX IF NOT EXISTS ix_avaliacao_respostas_aluno ON avaliacao_respostas(aluno_id);

CREATE TABLE IF NOT EXISTS avaliacao_resposta_itens (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  resposta_id  INTEGER NOT NULL REFERENCES avaliacao_respostas(id) ON DELETE CASCADE,
  question_id  TEXT NOT NULL,
  row_id       TEXT,
  option_id    TEXT,
  value_text   TEXT,
  value_number REAL,
  reason       TEXT
);
CREATE INDEX IF NOT EXISTS ix_itens_resposta ON avaliacao_resposta_itens(resposta_id);
CREATE INDEX IF NOT EXISTS ix_itens_question ON avaliacao_resposta_itens(question_id);
`,
};
