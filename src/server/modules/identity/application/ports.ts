import type { UsuarioSessao, Papel } from '../../../../shared/contracts/identidade.ts';
export interface Conta extends UsuarioSessao {
  senha_hash: string;
  ativo: boolean;
}
export interface PortaSegredos {
  hashSenha(texto: string): Promise<string>;
  conferir(texto: string, hash: string): Promise<boolean>;
  hashToken(token: string): string;
  emitir(): string;
}
export interface PortaIdentidade {
  transacao<T>(fn: () => T): T;
  porEmail(email: string): Conta | undefined;
  porId(id: number): Conta | undefined;
  sessao(hash: string, agora: number): Conta | undefined;
  auditar(usuario: number | null, acao: string, recurso: string, motivo?: string | null): void;
  criar(nome: string, email: string, hash: string, papel: Papel, aluno: number | null, professor: number | null, ativo: boolean): number;
  temAdmin(): boolean;
  contarAdmins(): number;
  pessoaExiste(tipo: 'aluno' | 'professor', id: number): boolean;
  limparSessoes(agora: number): void;
  criarSessao(hash: string, id: number, expira: number): void;
  encerrarSessao(hash: string): void;
  revogar(id: number): void;
  criarCodigo(hash: string, id: number, expira: number): void;
  codigo(hash: string, agora: number): { usuario_id: number } | undefined;
  limparCodigos(id: number): void;
  ativar(id: number, hash: string): void;
  desativar(id: number): void;
}
