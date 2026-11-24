export interface Aula {
  id: number;
  turma_id: number;
  turma_nome: string;
  data: string;
  inicio: string;
  fim: string;
  local: string;
  status: string;
  conteudo: string;
  versao: number;
  reposicao_de: number | null;
  professor_id: number | null;
}
export interface TurmaDiario {
  id: number;
  idioma_id: number;
  ano_letivo: number;
  professor_id: number | null;
}
export interface AlunoAula {
  id: number;
  nome: string;
  matricula_id: number;
  status: string | null;
}
export interface PortaDiario {
  transacao<T>(fn: () => T): T;
  turma(id: number): TurmaDiario | undefined;
  aulas(): Aula[];
  alunos(aula: Aula): AlunoAula[];
  conflita(turma: number, data: string, inicio: string, fim: string, local: string): boolean;
  criarAula(v: { turma_id: number; data: string; inicio: string; fim: string; local: string; reposicao_de?: number }): number;
  atualizarAula(id: number, versao: number, status: string, conteudo: string): boolean;
  gravarPresenca(aula: number, matricula: number, status: string, motivo: string, usuario: number): void;
  auditar(usuario: number, acao: string, recurso: string, motivo: string): void;
  transferencia(operacao: string): { origem_id: number; destino_id: number; usuario_id: number } | undefined;
  matricula(id: number): { id: number; aluno_id: number; turma_id: number; ano_letivo: number; status: string } | undefined;
  transferir(origem: number, destino: number, data: string, usuario: number, motivo: string, operacao: string): number;
  frequencia(aluno: number): { aula_id: number; data: string; turma_nome: string; status: string | null }[];
  horario(turma: number, dia: number, inicio: string, fim: string, local: string, motivo: string): void;
  horarios(): { id: number; turma_id: number; dia: number; inicio: string; fim: string; local: string }[];
  conflitaHorario(turma: number, dia: number, inicio: string, fim: string, local: string): boolean;
}
