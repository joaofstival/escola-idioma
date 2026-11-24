export interface UploadArquivo {
  nome: string;
  mime: string;
  base64: string;
}
export interface PublicacaoMaterial {
  id: number;
  grupo: string;
  versao: number;
  revisao: number;
  turma_id: number;
  turma_nome: string;
  autor_id: number;
  autor_nome: string;
  titulo: string;
  descricao: string;
  link: string | null;
  arquivo_id: string | null;
  arquivo_nome: string | null;
  mime: string | null;
  tamanho: number | null;
  estado: string;
  acesso_ate: string | null;
}
export interface AtividadeEscolar {
  id: number;
  turma_id: number;
  turma_nome: string;
  autor_id: number;
  titulo: string;
  descricao: string;
  prazo: string;
  valor_max: number;
  estado: string;
  versao: number;
}
export interface EntregaEscolar {
  id: number;
  atividade_id: number;
  aluno_id: number;
  aluno_nome: string;
  texto: string;
  arquivo_id: string | null;
  versao: number;
  entregue_em: string;
  nota: number | null;
  devolutiva: string | null;
  publicada: number | null;
  nota_versao: number | null;
}
