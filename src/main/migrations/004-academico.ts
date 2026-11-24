import type { Migration } from './index.ts';
export const migration004: Migration = {
  versao: 4,
  nome: 'agenda-frequencia-transferencia',
  sql: `
ALTER TABLE matriculas ADD COLUMN encerrada_em TEXT;
CREATE TABLE horarios_turma(id INTEGER PRIMARY KEY,turma_id INTEGER NOT NULL REFERENCES turmas(id),dia INTEGER NOT NULL CHECK(dia BETWEEN 0 AND 6),inicio TEXT NOT NULL,fim TEXT NOT NULL,local TEXT NOT NULL DEFAULT '',excecao_motivo TEXT, CHECK(inicio<fim),UNIQUE(turma_id,dia,inicio));
CREATE TABLE aulas(id INTEGER PRIMARY KEY,turma_id INTEGER NOT NULL REFERENCES turmas(id),data TEXT NOT NULL,inicio TEXT NOT NULL,fim TEXT NOT NULL,local TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'prevista' CHECK(status IN ('prevista','realizada','cancelada')),conteudo TEXT NOT NULL DEFAULT '',versao INTEGER NOT NULL DEFAULT 1,reposicao_de INTEGER UNIQUE REFERENCES aulas(id),CHECK(inicio<fim),UNIQUE(turma_id,data,inicio));
CREATE INDEX ix_aulas_turma_data ON aulas(turma_id,data);
CREATE TABLE presencas(aula_id INTEGER NOT NULL REFERENCES aulas(id),matricula_id INTEGER NOT NULL REFERENCES matriculas(id),status TEXT NOT NULL CHECK(status IN ('presente','falta','justificada')),motivo TEXT,usuario_id INTEGER NOT NULL REFERENCES usuarios(id),PRIMARY KEY(aula_id,matricula_id));
CREATE TABLE presencas_historico(id INTEGER PRIMARY KEY,aula_id INTEGER NOT NULL REFERENCES aulas(id),matricula_id INTEGER NOT NULL REFERENCES matriculas(id),status TEXT NOT NULL,motivo TEXT,usuario_id INTEGER NOT NULL REFERENCES usuarios(id),criado_em TEXT NOT NULL DEFAULT(datetime('now')));
CREATE TABLE transferencias(id INTEGER PRIMARY KEY,operacao_id TEXT NOT NULL UNIQUE,origem_id INTEGER NOT NULL REFERENCES matriculas(id),destino_id INTEGER NOT NULL REFERENCES matriculas(id),usuario_id INTEGER NOT NULL REFERENCES usuarios(id),motivo TEXT NOT NULL,data TEXT NOT NULL);
`,
};
