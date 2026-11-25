import type { Migration } from './index.ts';

export const migration006: Migration = {
  versao: 6,
  nome: 'comunicacao-cache',
  sql: `
CREATE TABLE avisos (
  id              INTEGER PRIMARY KEY,
  autor_id        INTEGER NOT NULL REFERENCES usuarios(id),
  titulo          TEXT NOT NULL,
  texto           TEXT NOT NULL,
  turma_id        INTEGER REFERENCES turmas(id),
  destinatario_id INTEGER REFERENCES usuarios(id),
  expira_em       TEXT NOT NULL,
  criado_em       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (turma_id IS NULL OR destinatario_id IS NULL)
);

CREATE TABLE avisos_leituras (
  aviso_id   INTEGER NOT NULL REFERENCES avisos(id),
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  lido_em    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (aviso_id, usuario_id)
);

CREATE TABLE solicitacoes (
  id             INTEGER PRIMARY KEY,
  usuario_id     INTEGER NOT NULL REFERENCES usuarios(id),
  assunto        TEXT NOT NULL,
  texto          TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta', 'em_atendimento', 'resolvida')),
  responsavel_id INTEGER REFERENCES usuarios(id),
  versao         INTEGER NOT NULL DEFAULT 1,
  criado_em      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE solicitacoes_historico (
  id             INTEGER PRIMARY KEY,
  solicitacao_id INTEGER NOT NULL REFERENCES solicitacoes(id),
  usuario_id     INTEGER NOT NULL REFERENCES usuarios(id),
  status         TEXT NOT NULL,
  resposta       TEXT NOT NULL,
  criado_em      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE cache_integracoes (
  chave     TEXT PRIMARY KEY,
  valor     TEXT NOT NULL CHECK (json_valid(valor)),
  obtido_em INTEGER NOT NULL
);
`,
};
