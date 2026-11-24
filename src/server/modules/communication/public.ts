import { z } from 'zod';
import type { Db } from '../../../main/db.ts';
import { HttpError } from '../../../main/router.ts';
import { hojeIso, dataIsoValida } from '../../../main/validation.ts';
import type { UsuarioSessao } from '../../../shared/contracts/identidade.ts';
import type { ServicoAcademico } from '../academic/public.ts';
export interface Aviso {
  id: number;
  autor_id: number;
  titulo: string;
  texto: string;
  turma_id: number | null;
  destinatario_id: number | null;
  expira_em: string;
  lido: number;
  criado_em: string;
}
export interface Solicitacao {
  id: number;
  usuario_id: number;
  nome: string;
  assunto: string;
  texto: string;
  status: string;
  responsavel_id: number | null;
  versao: number;
  criado_em: string;
}
export interface PortaComunicacao {
  avisos(usuario: number): Aviso[];
  solicitacoes(): Solicitacao[];
  historico(id: number): unknown[];
  criarAviso(
    u: number,
    v: { titulo: string; texto: string; turma_id: number | null; destinatario_id: number | null; expira_em: string },
  ): number;
  ler(id: number, u: number): void;
  criarSolicitacao(u: number, assunto: string, texto: string): number;
  responder(id: number, u: number, status: string, resposta: string, versao: number): boolean;
  transacao<T>(fn: () => T): T;
  auditar(u: number, acao: string, recurso: string): void;
}
export class RepositorioComunicacao implements PortaComunicacao {
  private readonly db: Db;
  constructor(db: Db) {
    this.db = db;
  }
  avisos(u: number) {
    return this.db.all<Aviso>(
      'SELECT a.*,EXISTS(SELECT 1 FROM avisos_leituras l WHERE l.aviso_id=a.id AND l.usuario_id=?) lido FROM avisos a ORDER BY a.id DESC',
      [u],
    );
  }
  solicitacoes() {
    return this.db.all<Solicitacao>('SELECT s.*,u.nome FROM solicitacoes s JOIN usuarios u ON u.id=s.usuario_id ORDER BY s.id DESC');
  }
  historico(id: number) {
    return this.db.all(
      'SELECT h.*,u.nome FROM solicitacoes_historico h JOIN usuarios u ON u.id=h.usuario_id WHERE solicitacao_id=? ORDER BY h.id',
      [id],
    );
  }
  criarAviso(u: number, v: { titulo: string; texto: string; turma_id: number | null; destinatario_id: number | null; expira_em: string }) {
    return Number(
      this.db.run('INSERT INTO avisos(autor_id,titulo,texto,turma_id,destinatario_id,expira_em) VALUES(?,?,?,?,?,?)', [
        u,
        v.titulo,
        v.texto,
        v.turma_id,
        v.destinatario_id,
        v.expira_em,
      ]).lastInsertRowid,
    );
  }
  ler(id: number, u: number) {
    this.db.run('INSERT OR IGNORE INTO avisos_leituras(aviso_id,usuario_id) VALUES(?,?)', [id, u]);
  }
  criarSolicitacao(u: number, assunto: string, texto: string) {
    return Number(this.db.run('INSERT INTO solicitacoes(usuario_id,assunto,texto) VALUES(?,?,?)', [u, assunto, texto]).lastInsertRowid);
  }
  responder(id: number, u: number, status: string, resposta: string, versao: number) {
    const r = this.db.run('UPDATE solicitacoes SET status=?,responsavel_id=?,versao=versao+1 WHERE id=? AND versao=?', [
      status,
      u,
      id,
      versao,
    ]);
    if (!r.changes) return false;
    this.db.run('INSERT INTO solicitacoes_historico(solicitacao_id,usuario_id,status,resposta) VALUES(?,?,?,?)', [id, u, status, resposta]);
    return true;
  }
  transacao<T>(fn: () => T) {
    return this.db.transaction(fn);
  }
  auditar(u: number, acao: string, recurso: string) {
    this.db.run('INSERT INTO auditoria(usuario_id,acao,recurso) VALUES(?,?,?)', [u, acao, recurso]);
  }
}
export class ServicoComunicacao {
  private readonly repo: PortaComunicacao;
  private readonly academico: ServicoAcademico;
  constructor(repo: PortaComunicacao, academico: ServicoAcademico) {
    this.repo = repo;
    this.academico = academico;
  }
  avisos(u: UsuarioSessao) {
    const turmas = new Set(this.academico.turmas(u).map((t) => t.id));
    return this.repo
      .avisos(u.id)
      .filter(
        (a) => a.expira_em >= hojeIso() && (a.destinatario_id ? a.destinatario_id === u.id : a.turma_id ? turmas.has(a.turma_id) : true),
      );
  }
  publicar(u: UsuarioSessao, body: unknown) {
    if (!['admin', 'secretaria', 'professor'].includes(u.papel)) throw new HttpError(403, 'Publicação não permitida');
    const v = z
      .object({
        titulo: z.string().trim().min(3).max(150),
        texto: z.string().trim().min(3).max(5000),
        turma_id: z.number().int().positive().nullable().default(null),
        destinatario_id: z.number().int().positive().nullable().default(null),
        expira_em: z.string().refine(dataIsoValida),
      })
      .strict()
      .parse(body);
    if (v.expira_em < hojeIso() || (v.turma_id && v.destinatario_id)) throw new HttpError(422, 'Confira destino e validade');
    if (u.papel === 'professor' && (!v.turma_id || v.destinatario_id)) throw new HttpError(403, 'Professor publica apenas para sua turma');
    if (v.turma_id) this.academico.exigirTurma(u, v.turma_id);
    return this.repo.transacao(() => {
      const id = this.repo.criarAviso(u.id, v);
      this.repo.auditar(u.id, 'PUBLICAR_AVISO', String(id));
      return { id };
    });
  }
  ler(u: UsuarioSessao, id: number) {
    if (!this.avisos(u).some((a) => a.id === id)) throw new HttpError(404, 'Aviso não encontrado');
    this.repo.ler(id, u.id);
    return { ok: true };
  }
  solicitacoes(u: UsuarioSessao) {
    return this.repo.solicitacoes().filter((s) => ['admin', 'secretaria'].includes(u.papel) || s.usuario_id === u.id);
  }
  abrir(u: UsuarioSessao, body: unknown) {
    const v = z
      .object({ assunto: z.string().trim().min(3).max(150), texto: z.string().trim().min(5).max(5000) })
      .strict()
      .parse(body);
    return this.repo.transacao(() => {
      const id = this.repo.criarSolicitacao(u.id, v.assunto, v.texto);
      this.repo.auditar(u.id, 'ABRIR_SOLICITACAO', String(id));
      return { id };
    });
  }
  historico(u: UsuarioSessao, id: number) {
    if (!this.solicitacoes(u).some((s) => s.id === id)) throw new HttpError(404, 'Solicitação não encontrada');
    return this.repo.historico(id);
  }
  responder(u: UsuarioSessao, id: number, body: unknown) {
    if (!['admin', 'secretaria'].includes(u.papel)) throw new HttpError(403, 'Atendimento reservado à secretaria');
    this.historico(u, id);
    const v = z
      .object({
        status: z.enum(['aberta', 'em_atendimento', 'resolvida']),
        resposta: z.string().trim().min(5).max(5000),
        versao: z.number().int().positive(),
      })
      .strict()
      .parse(body);
    return this.repo.transacao(() => {
      if (!this.repo.responder(id, u.id, v.status, v.resposta, v.versao)) throw new HttpError(409, 'Solicitação alterada. Recarregue');
      this.repo.auditar(u.id, 'ATENDER_SOLICITACAO', String(id));
      return { ok: true };
    });
  }
}
