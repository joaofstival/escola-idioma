import assert from 'node:assert/strict';
import { openDb } from '../main/db.ts';
import { AplicacaoCentral } from './application.ts';
import type { ApiResponse } from '../shared/types.ts';
export function dados<T = any>(r: ApiResponse): T {
  assert.ok(r.ok, JSON.stringify(r));
  return r.data as T;
}
export async function cenarioCentral() {
  const db = await openDb();
  db.exec(
    "INSERT INTO idiomas(id,nome,codigo,mensalidade) VALUES(1,'Inglês','en',300); INSERT INTO professores(id,nome) VALUES(1,'Professor A'),(2,'Professor B'); INSERT INTO professor_idiomas VALUES(1,1),(2,1); INSERT INTO alunos(id,nome) VALUES(1,'Aluno A'),(2,'Aluno B'); INSERT INTO turmas(id,nome,idioma_id,nivel,ano_letivo,professor_id,capacidade) VALUES(1,'Turma A',1,1,2026,1,10),(2,'Turma B',1,1,2026,2,10); INSERT INTO matriculas(id,aluno_id,turma_id,ano_letivo,data) VALUES(1,1,1,2026,'2026-01-01'),(2,2,2,2026,'2026-01-01');",
  );
  const app = new AplicacaoCentral(db);
  await app.identidade.provisionarAdmin('admin@escola.test', 'Senha-Admin-2026!');
  const admin = dados(
    await app.handle({ method: 'POST', path: '/auth/login', body: { email: 'admin@escola.test', senha: 'Senha-Admin-2026!' } }),
  );
  const tokens: Record<string, string> = { admin: admin.token };
  for (const [nome, papel, id] of [
    ['alunoA', 'aluno', 1],
    ['alunoB', 'aluno', 2],
    ['profA', 'professor', 1],
    ['profB', 'professor', 2],
  ] as const) {
    const conta = dados(
      await app.handle(
        {
          method: 'POST',
          path: '/admin/usuarios',
          body: { nome, email: nome + '@escola.test', papel, ...(papel === 'aluno' ? { aluno_id: id } : { professor_id: id }) },
        },
        tokens.admin,
      ),
    );
    dados(await app.handle({ method: 'POST', path: '/auth/ativar', body: { codigo: conta.codigoAtivacao, senha: 'Senha-Aluno-2026!' } }));
    tokens[nome] = dados(
      await app.handle({ method: 'POST', path: '/auth/login', body: { email: nome + '@escola.test', senha: 'Senha-Aluno-2026!' } }),
    ).token;
  }
  return { db, app, tokens };
}
