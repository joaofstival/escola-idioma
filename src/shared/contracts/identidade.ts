export type Papel = 'admin' | 'secretaria' | 'financeiro' | 'professor' | 'aluno';
export interface UsuarioSessao {
  id: number;
  nome: string;
  email: string;
  papel: Papel;
  aluno_id: number | null;
  professor_id: number | null;
}
export interface SessaoResposta {
  usuario: UsuarioSessao;
}
