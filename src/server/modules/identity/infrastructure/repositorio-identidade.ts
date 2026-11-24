import type { Db } from '../../../../main/db.ts';
import type { UsuarioSessao, Papel } from '../../../../shared/contracts/identidade.ts';
export interface Conta extends UsuarioSessao {
  senha_hash: string;
  ativo: boolean;
}
export class RepositorioIdentidade {
  transacao<T>(fn: () => T): T {
    return this.db.transaction(fn);
  }
  temAdmin() {
    return !!this.db.get("SELECT id FROM usuarios WHERE papel='admin'");
  }
  contarAdmins() {
    return this.db.get<{ n: number }>("SELECT count(*) n FROM usuarios WHERE papel='admin' AND ativo=1")!.n;
  }
  pessoaExiste(tipo: 'aluno' | 'professor', id: number) {
    return !!this.db.get(`SELECT id FROM ${tipo === 'aluno' ? 'alunos' : 'professores'} WHERE id=?`, [id]);
  }
  limparSessoes(agora: number) {
    this.db.run('DELETE FROM sessoes WHERE expira_em<=?', [agora]);
  }
  criarSessao(hash: string, id: number, expira: number) {
    this.db.run('INSERT INTO sessoes VALUES(?,?,?)', [hash, id, expira]);
  }
  encerrarSessao(hash: string) {
    this.db.run('DELETE FROM sessoes WHERE token_hash=?', [hash]);
  }
  revogar(id: number) {
    this.db.run('DELETE FROM sessoes WHERE usuario_id=?', [id]);
  }
  criarCodigo(hash: string, id: number, expira: number) {
    this.db.run('INSERT INTO acessos_temporarios VALUES(?,?,?)', [hash, id, expira]);
  }
  codigo(hash: string, agora: number) {
    return this.db.get<{ usuario_id: number }>('SELECT usuario_id FROM acessos_temporarios WHERE codigo_hash=? AND expira_em>?', [
      hash,
      agora,
    ]);
  }
  limparCodigos(id: number) {
    this.db.run('DELETE FROM acessos_temporarios WHERE usuario_id=?', [id]);
  }
  ativar(id: number, hash: string) {
    this.db.run('UPDATE usuarios SET senha_hash=?,ativo=1 WHERE id=?', [hash, id]);
  }
  desativar(id: number) {
    this.db.run('UPDATE usuarios SET ativo=0 WHERE id=?', [id]);
  }

  readonly db: Db;
  constructor(db: Db) {
    this.db = db;
  }
  porEmail(email: string) {
    return this.db.get<Conta>('SELECT * FROM usuarios WHERE email=?', [email]);
  }
  porId(id: number) {
    return this.db.get<Conta>('SELECT * FROM usuarios WHERE id=?', [id]);
  }
  sessao(hash: string, agora: number) {
    return this.db.get<Conta>(
      'SELECT u.* FROM usuarios u JOIN sessoes s ON s.usuario_id=u.id WHERE s.token_hash=? AND s.expira_em>? AND u.ativo=1',
      [hash, agora],
    );
  }
  auditar(usuario: number | null, acao: string, recurso: string, motivo: string | null = null) {
    this.db.run('INSERT INTO auditoria(usuario_id,acao,recurso,motivo) VALUES(?,?,?,?)', [usuario, acao, recurso, motivo]);
  }
  criar(nome: string, email: string, hash: string, papel: Papel, aluno: number | null, professor: number | null, ativo: boolean) {
    return this.db.run('INSERT INTO usuarios(nome,email,senha_hash,papel,aluno_id,professor_id,ativo) VALUES(?,?,?,?,?,?,?)', [
      nome,
      email,
      hash,
      papel,
      aluno,
      professor,
      ativo,
    ]).lastInsertRowid;
  }
}
