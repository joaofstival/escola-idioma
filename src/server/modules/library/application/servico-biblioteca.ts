import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { HttpError } from '../../../../main/router.ts';
import { hojeIso, dataIsoValida } from '../../../../main/validation.ts';
import type { UsuarioSessao } from '../../../../shared/contracts/identidade.ts';
import type { PortaBiblioteca } from './ports.ts';
import type { ServicoAcademico } from '../../academic/public.ts';
export const uploadSchema = z
  .object({ nome: z.string().min(1).max(150), mime: z.string().max(100), base64: z.string().min(1).max(7000000) })
  .strict();
const novo = z
  .object({
    turma_id: z.number().int().positive(),
    titulo: z.string().trim().min(2).max(150),
    descricao: z.string().max(2000).default(''),
    link: z
      .url()
      .refine((u) => new URL(u).protocol === 'https:')
      .optional(),
    arquivo: uploadSchema.optional(),
    estado: z.enum(['rascunho', 'publicado']).default('rascunho'),
    acesso_ate: z.string().refine(dataIsoValida).nullable().optional(),
  })
  .strict()
  .refine((v) => !!v.link !== !!v.arquivo, 'Informe arquivo ou link');
export class ServicoBiblioteca {
  private readonly repo: PortaBiblioteca;
  private readonly acesso: ServicoAcademico;
  constructor(repo: PortaBiblioteca, acesso: ServicoAcademico) {
    this.repo = repo;
    this.acesso = acesso;
  }
  listar(u: UsuarioSessao) {
    if (u.papel === 'financeiro') throw new HttpError(403, 'Acesso não permitido');
    const turmas = new Set(this.acesso.turmas(u).map((t) => t.id));
    const visiveis = this.repo
      .listar()
      .filter(
        (p) =>
          turmas.has(p.turma_id) && (u.papel !== 'aluno' || (p.estado === 'publicado' && (!p.acesso_ate || p.acesso_ate >= hojeIso()))),
      );
    return visiveis.filter((p) => !visiveis.some((outro) => outro.grupo === p.grupo && outro.versao > p.versao));
  }
  private obter(u: UsuarioSessao, id: number) {
    const p = this.listar(u).find((p) => p.id === id);
    if (!p) throw new HttpError(404, 'Material não encontrado ou sem acesso');
    return p;
  }
  private editor(u: UsuarioSessao, turma: number, autor?: number) {
    if (!['admin', 'professor'].includes(u.papel) || (u.papel === 'professor' && autor !== undefined && autor !== u.id))
      throw new HttpError(403, 'Publicação não permitida');
    this.acesso.exigirTurma(u, turma);
  }
  criar(u: UsuarioSessao, body: unknown, anteriorId?: number) {
    const v = novo.parse(body);
    this.editor(u, v.turma_id);
    return this.repo.transacao(() => {
      const anterior = anteriorId ? this.obter(u, anteriorId) : undefined;
      if (anterior && anterior.versao >= 20) throw new HttpError(422, 'Limite de versões atingido. Crie uma nova publicação.');
      if (anterior) {
        this.editor(u, anterior.turma_id, anterior.autor_id);
        if (v.turma_id !== anterior.turma_id) throw new HttpError(422, 'Não é possível trocar a turma de uma versão');
      }
      const arquivo = v.arquivo ? this.repo.salvarArquivo(u.id, v.arquivo) : null;
      const id = this.repo.criar({
        grupo: anterior?.grupo ?? randomUUID(),
        versao: (anterior?.versao ?? 0) + 1,
        turma_id: v.turma_id,
        autor_id: anterior?.autor_id ?? u.id,
        titulo: v.titulo,
        descricao: v.descricao,
        link: v.link ?? null,
        arquivo_id: arquivo,
        estado: v.estado,
        acesso_ate: v.acesso_ate ?? null,
      });
      this.repo.auditar(u.id, 'PUBLICAR_MATERIAL', String(id), anterior ? 'Nova versão' : 'Nova publicação');
      return this.repo.listar().find((p) => p.id === id)!;
    });
  }
  estado(u: UsuarioSessao, id: number, body: unknown) {
    const v = z
      .object({
        revisao: z.number().int().positive(),
        estado: z.enum(['rascunho', 'publicado', 'arquivado']),
        motivo: z.string().trim().min(5).max(500),
      })
      .strict()
      .parse(body);
    return this.repo.transacao(() => {
      const p = this.obter(u, id);
      this.editor(u, p.turma_id, p.autor_id);
      if (!this.repo.estado(id, v.revisao, v.estado)) throw new HttpError(409, 'Material alterado. Recarregue');
      this.repo.auditar(u.id, 'ESTADO_MATERIAL', String(id), v.motivo);
      return { ok: true };
    });
  }
  arquivo(u: UsuarioSessao, id: number) {
    const p = this.obter(u, id);
    if (!p.arquivo_id) throw new HttpError(404, 'Publicação sem arquivo');
    const arquivo = this.repo.arquivo(p.arquivo_id);
    if (!arquivo) throw new HttpError(404, 'Arquivo não encontrado');
    this.repo.auditar(u.id, 'BAIXAR_MATERIAL', String(id), 'Download autorizado');
    return arquivo;
  }
}
