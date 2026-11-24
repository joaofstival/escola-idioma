import type { AtividadeEscolar, EntregaEscolar, UploadArquivo } from '../../../../shared/contracts/pedagogico.ts';
import type { DownloadArquivo } from '../../library/public.ts';
export interface DadosAtividade {
  turma_id: number;
  titulo: string;
  descricao: string;
  prazo: string;
  valor_max: number;
  estado: string;
}
export interface PortaAprendizagem {
  transacao<T>(fn: () => T): T;
  atividades(): AtividadeEscolar[];
  criar(u: number, v: DadosAtividade): number;
  editar(id: number, versao: number, v: DadosAtividade): boolean;
  apagar(id: number): void;
  entregas(atividade: number): EntregaEscolar[];
  versoesEntrega(entrega: number): number;
  operacao(id: string): { usuario_id: number; payload_hash: string; entrega_id: number } | undefined;
  enviar(atividade: number, aluno: number, usuario: number, texto: string, arquivo: string | null, operacao: string, hash: string): number;
  nota(entrega: number, usuario: number, nota: number, devolutiva: string, publicada: boolean, versao: number | null, motivo: string): void;
  salvarArquivo(usuario: number, arquivo: UploadArquivo): string;
  arquivo(id: string): DownloadArquivo | undefined;
  auditar(usuario: number, acao: string, recurso: string, motivo: string): void;
}
