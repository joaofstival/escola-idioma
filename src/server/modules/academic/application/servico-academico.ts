export interface VinculoAcademico {
  id: number;
  nome: string;
  idioma_nome: string;
  nivel: number;
  ano_letivo: number;
  horario: string | null;
}
export interface PessoaAcademica {
  id: number;
  nome: string;
}
export interface ContextoAcademico {
  papel: string;
  aluno_id: number | null;
  professor_id: number | null;
}
export interface RepositorioAcademico {
  turmas(contexto: ContextoAcademico): VinculoAcademico[];
  alunos(turmaId: number): PessoaAcademica[];
}
export class ServicoAcademico {
  private readonly repositorio: RepositorioAcademico;
  constructor(repositorio: RepositorioAcademico) {
    this.repositorio = repositorio;
  }
  turmas(contexto: ContextoAcademico) {
    return this.repositorio.turmas(contexto);
  }
  exigirTurma(contexto: ContextoAcademico, turmaId: number) {
    if (!this.turmas(contexto).some((t) => t.id === turmaId)) throw new Error('TURMA_NAO_AUTORIZADA');
  }
  alunos(contexto: ContextoAcademico, turmaId: number) {
    this.exigirTurma(contexto, turmaId);
    if (contexto.papel === 'aluno') throw new Error('TURMA_NAO_AUTORIZADA');
    return this.repositorio.alunos(turmaId);
  }
}
