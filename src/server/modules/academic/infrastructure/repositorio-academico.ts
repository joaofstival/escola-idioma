import type { Db } from '../../../../main/db.ts';
import type { RepositorioAcademico, ContextoAcademico, VinculoAcademico, PessoaAcademica } from '../application/servico-academico.ts';
export class RepositorioAcademicoSqlite implements RepositorioAcademico {
  private readonly db: Db;
  constructor(db: Db) {
    this.db = db;
  }
  turmas(c: ContextoAcademico): VinculoAcademico[] {
    const filtro =
      c.papel === 'aluno'
        ? "EXISTS (SELECT 1 FROM matriculas m WHERE m.turma_id=t.id AND m.aluno_id=? AND m.status='ativa')"
        : c.papel === 'professor'
          ? 't.professor_id=?'
          : '1=1';
    const params = c.papel === 'aluno' ? [c.aluno_id] : c.papel === 'professor' ? [c.professor_id] : [];
    return this.db.all<VinculoAcademico>(
      `SELECT t.id,t.nome,i.nome idioma_nome,t.nivel,t.ano_letivo,t.horario FROM turmas t JOIN idiomas i ON i.id=t.idioma_id WHERE ${filtro} ORDER BY t.ano_letivo DESC,t.nome`,
      params,
    );
  }
  alunos(turmaId: number): PessoaAcademica[] {
    return this.db.all<PessoaAcademica>(
      "SELECT a.id,a.nome FROM alunos a JOIN matriculas m ON m.aluno_id=a.id WHERE m.turma_id=? AND m.status='ativa' ORDER BY a.nome",
      [turmaId],
    );
  }
}
