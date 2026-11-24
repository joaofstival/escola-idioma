import type { UploadArquivo, PublicacaoMaterial } from '../../../../shared/contracts/pedagogico.ts';
export interface DownloadArquivo {
  nome: string;
  mime: string;
  base64: string;
  sha256: string;
}
export interface PortaBiblioteca {
  transacao<T>(fn: () => T): T;
  listar(): PublicacaoMaterial[];
  arquivo(id: string): DownloadArquivo | undefined;
  salvarArquivo(usuario: number, upload: UploadArquivo): string;
  criar(v: {
    grupo: string;
    versao: number;
    turma_id: number;
    autor_id: number;
    titulo: string;
    descricao: string;
    link: string | null;
    arquivo_id: string | null;
    estado: string;
    acesso_ate: string | null;
  }): number;
  estado(id: number, revisao: number, estado: string): boolean;
  auditar(usuario: number, acao: string, recurso: string, motivo: string): void;
}
