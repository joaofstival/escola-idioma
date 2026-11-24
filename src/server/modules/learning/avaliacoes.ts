import { z } from 'zod';
import type { Db } from '../../../main/db.ts';
import type { Router } from '../../../main/router.ts';
import { HttpError } from '../../../main/router.ts';
import type { ApiRequest, ApiResponse } from '../../../shared/types.ts';
import type { UsuarioSessao } from '../../../shared/contracts/identidade.ts';
import type { ServicoAcademico } from '../academic/public.ts';
interface Info {
  id: number;
  turma_id: number;
  autor_id: number | null;
  publicada: number;
  finalidade: string;
}
/** Adaptador seguro das avaliações legadas; perguntas e respostas preservam o validador existente. */
export class ControladorAvaliacoes {
  private readonly db: Db;
  private readonly acesso: ServicoAcademico;
  private readonly legado: Router;
  constructor(db: Db, acesso: ServicoAcademico, legado: Router) {
    this.db = db;
    this.acesso = acesso;
    this.legado = legado;
  }
  async handle(req: ApiRequest, u: UsuarioSessao): Promise<ApiResponse | null> {
    const caminho = req.path.split('?')[0];
    if (!/^\/avaliacoes(?:\/|$)/.test(caminho)) return null;
    if (!['admin', 'professor', 'aluno'].includes(u.papel)) throw new HttpError(403, 'Acesso não permitido');
    const ok = (data: unknown): ApiResponse => ({ ok: true, status: 200, data });
    const turmas = new Set(this.acesso.turmas(u).map((t) => t.id));
    if (caminho === '/avaliacoes' && req.method === 'GET') {
      const r = await this.legado.handle(req);
      if (!r.ok) return r;
      return ok((r.data as Info[]).filter((a) => turmas.has(a.turma_id) && (u.papel !== 'aluno' || a.publicada)));
    }
    if (caminho === '/avaliacoes/modelos') {
      if (u.papel === 'aluno') throw new HttpError(403, 'Acesso não permitido');
      return this.legado.handle(req);
    }
    if (caminho === '/avaliacoes' && req.method === 'POST') {
      if (u.papel === 'aluno') throw new HttpError(403, 'Acesso não permitido');
      const b = z.object({ turma_id: z.number().int().positive() }).passthrough().parse(req.body);
      this.acesso.exigirTurma(u, b.turma_id);
      return this.legado.handle(req, (fn) =>
        this.db.transaction(() => {
          const r = fn() as { id: number };
          this.db.run('UPDATE avaliacoes SET autor_id=? WHERE id=?', [u.id, r.id]);
          this.auditar(u, 'CRIAR_AVALIACAO', r.id);
          return r;
        }),
      );
    }
    const match = /^\/avaliacoes\/(\d+)(?:\/(.*))?$/.exec(caminho);
    if (!match) throw new HttpError(404, 'Avaliação não encontrada');
    const id = Number(match[1]),
      acao = match[2] ?? '';
    if (u.papel === 'aluno' && (acao === 'exportar' || acao === 'resultados' || (acao === 'respostas' && req.method === 'GET')))
      throw new HttpError(403, 'Resultados coletivos não estão disponíveis ao aluno');
    const info = this.db.get<Info>('SELECT id,turma_id,autor_id,publicada,finalidade FROM avaliacoes WHERE id=?', [id]);
    if (!info || !turmas.has(info.turma_id) || (u.papel === 'aluno' && !info.publicada))
      throw new HttpError(404, 'Avaliação não encontrada ou sem acesso');
    if (acao === 'minha-resposta' && req.method === 'GET') {
      if (u.papel !== 'aluno') throw new HttpError(403, 'Acesso não permitido');
      return ok(this.db.get('SELECT id,criado_em FROM avaliacao_respostas WHERE avaliacao_id=? AND aluno_id=?', [id, u.aluno_id]) ?? null);
    }
    if (acao === 'publicar' && req.method === 'POST') {
      this.editor(u, info);
      const v = z
        .object({ publicada: z.boolean(), finalidade: z.enum(['feedback', 'academica', 'autoavaliacao', 'nivel']) })
        .strict()
        .parse(req.body);
      if (v.finalidade !== info.finalidade && this.db.get('SELECT id FROM avaliacao_respostas WHERE avaliacao_id=?', [id]))
        throw new HttpError(422, 'Finalidade não pode mudar após respostas');
      return this.db.transaction(() => {
        this.db.run('UPDATE avaliacoes SET publicada=?,finalidade=? WHERE id=?', [v.publicada, v.finalidade, id]);
        this.auditar(u, 'PUBLICAR_AVALIACAO', id);
        return ok({ ok: true });
      });
    }
    let pedido = req;
    if (u.papel === 'aluno') {
      if (req.method === 'GET' && acao === '') return this.legado.handle(req);
      if (req.method !== 'POST' || acao !== 'respostas') throw new HttpError(403, 'Ação não permitida');
      const v = z
        .object({ answers: z.array(z.unknown()).max(200) })
        .strict()
        .parse(req.body);
      pedido = { ...req, body: { answers: v.answers, aluno_id: u.aluno_id } };
    } else if (req.method !== 'GET' && acao !== 'respostas') {
      this.editor(u, info);
      if (acao === 'duplicar') {
        const v = z
          .object({ turma_id: z.number().int().positive().optional() })
          .passthrough()
          .parse(req.body ?? {});
        if (v.turma_id) this.acesso.exigirTurma(u, v.turma_id);
      }
      if (req.method === 'PUT') {
        const v = z
          .object({ turma_id: z.number().int().positive().optional() })
          .passthrough()
          .parse(req.body ?? {});
        if (v.turma_id) this.acesso.exigirTurma(u, v.turma_id);
      }
    }
    return this.legado.handle(pedido, (fn) =>
      this.db.transaction(() => {
        const r = fn() as { id?: number };
        if (acao === 'respostas' && r.id)
          this.db.run('UPDATE avaliacao_respostas SET usuario_id=?,origem=? WHERE id=?', [
            u.id,
            u.papel === 'aluno' ? 'aluno' : 'operador',
            r.id,
          ]);
        if (acao === 'duplicar' && r.id) this.db.run('UPDATE avaliacoes SET autor_id=?,publicada=0 WHERE id=?', [u.id, r.id]);
        this.auditar(u, req.method, id);
        return r;
      }),
    );
  }
  private editor(u: UsuarioSessao, a: Info) {
    if (u.papel === 'aluno' || (u.papel === 'professor' && a.autor_id !== u.id))
      throw new HttpError(403, 'Somente o autor ou administrador pode alterar esta avaliação');
  }
  private auditar(u: UsuarioSessao, acao: string, id: number) {
    this.db.run('INSERT INTO auditoria(usuario_id,acao,recurso) VALUES(?,?,?)', [u.id, acao, 'avaliacao:' + id]);
  }
}
