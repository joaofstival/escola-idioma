import { createHash } from 'node:crypto';
import { z } from 'zod';
import { HttpError } from '../../../../main/router.ts';
import { hojeIso, dataIsoValida } from '../../../../main/validation.ts';
import type { UsuarioSessao } from '../../../../shared/contracts/identidade.ts';
import type { PortaAprendizagem } from './ports.ts';
import type { ServicoAcademico } from '../../academic/public.ts';
import { uploadSchema } from '../../library/public.ts';
const campos = {
  turma_id: z.number().int().positive(),
  titulo: z.string().trim().min(2).max(150),
  descricao: z.string().trim().min(2).max(10000),
  prazo: z.string().refine(dataIsoValida),
  valor_max: z.number().positive().max(100),
  estado: z.enum(['rascunho', 'publicada', 'encerrada']),
};
export class ServicoAprendizagem {
  private readonly repo: PortaAprendizagem;
  private readonly acesso: ServicoAcademico;
  constructor(repo: PortaAprendizagem, acesso: ServicoAcademico) {
    this.repo = repo;
    this.acesso = acesso;
  }
  listar(u: UsuarioSessao) {
    if (!['admin', 'professor', 'aluno'].includes(u.papel)) throw new HttpError(403, 'Acesso não permitido');
    const turmas = new Set(this.acesso.turmas(u).map((t) => t.id));
    return this.repo.atividades().filter((a) => turmas.has(a.turma_id) && (u.papel !== 'aluno' || a.estado !== 'rascunho'));
  }
  private atividade(u: UsuarioSessao, id: number) {
    const a = this.listar(u).find((a) => a.id === id);
    if (!a) throw new HttpError(404, 'Atividade não encontrada');
    return a;
  }
  private professor(u: UsuarioSessao, turma: number, autor?: number) {
    if (!['admin', 'professor'].includes(u.papel) || (u.papel === 'professor' && autor !== undefined && autor !== u.id))
      throw new HttpError(403, 'Ação não permitida');
    this.acesso.exigirTurma(u, turma);
  }
  criar(u: UsuarioSessao, body: unknown) {
    const v = z.object(campos).strict().parse(body);
    this.professor(u, v.turma_id);
    return this.repo.transacao(() => {
      const id = this.repo.criar(u.id, v);
      this.repo.auditar(u.id, 'CRIAR_ATIVIDADE', String(id), 'Nova atividade');
      return this.atividade(u, id);
    });
  }
  editar(u: UsuarioSessao, id: number, body: unknown) {
    const v = z
      .object({ ...campos, versao: z.number().int().positive(), motivo: z.string().trim().min(5).max(500) })
      .strict()
      .parse(body);
    return this.repo.transacao(() => {
      const a = this.atividade(u, id);
      this.professor(u, a.turma_id, a.autor_id);
      if (v.turma_id !== a.turma_id) throw new HttpError(422, 'A turma não pode ser alterada');
      if (this.repo.entregas(id).length && (v.valor_max !== a.valor_max || v.estado === 'rascunho'))
        throw new HttpError(422, 'Atividade com entregas preserva a escala e não volta a rascunho');
      if (!this.repo.editar(id, v.versao, v)) throw new HttpError(409, 'Atividade alterada. Recarregue');
      this.repo.auditar(u.id, 'EDITAR_ATIVIDADE', String(id), v.motivo);
      return this.atividade(u, id);
    });
  }
  excluir(u: UsuarioSessao, id: number) {
    return this.repo.transacao(() => {
      const a = this.atividade(u, id);
      this.professor(u, a.turma_id, a.autor_id);
      if (a.estado !== 'rascunho' || this.repo.entregas(id).length)
        throw new HttpError(422, 'Somente rascunho sem entregas pode ser apagado; encerre para preservar histórico');
      this.repo.apagar(id);
      this.repo.auditar(u.id, 'EXCLUIR_ATIVIDADE', String(id), 'Rascunho sem entregas');
      return { ok: true };
    });
  }
  entregas(u: UsuarioSessao, id: number) {
    this.atividade(u, id);
    return this.repo
      .entregas(id)
      .filter((e) => u.papel !== 'aluno' || e.aluno_id === u.aluno_id)
      .map((e) => (u.papel === 'aluno' && !e.publicada ? { ...e, nota: null, devolutiva: null, nota_versao: null } : e));
  }
  enviar(u: UsuarioSessao, id: number, body: unknown) {
    if (u.papel !== 'aluno' || !u.aluno_id) throw new HttpError(403, 'Envio disponível apenas na própria conta de aluno');
    const v = z
      .object({ texto: z.string().trim().max(20000), arquivo: uploadSchema.optional(), operacao_id: z.string().uuid() })
      .strict()
      .refine((v) => !!v.texto || !!v.arquivo)
      .parse(body);
    const hash = createHash('sha256')
      .update(JSON.stringify({ id, aluno: u.aluno_id, texto: v.texto, arquivo: v.arquivo }))
      .digest('hex');
    return this.repo.transacao(() => {
      const anterior = this.repo.operacao(v.operacao_id);
      if (anterior) {
        if (anterior.usuario_id !== u.id || anterior.payload_hash !== hash) throw new HttpError(409, 'Identificador já utilizado');
        return this.entregas(u, id).find((e) => e.id === anterior.entrega_id);
      }
      const a = this.atividade(u, id);
      if (a.estado !== 'publicada' || a.prazo < hojeIso()) throw new HttpError(422, 'Atividade encerrada ou prazo finalizado');
      const atual = this.repo.entregas(id).find((e) => e.aluno_id === u.aluno_id);
      if (atual?.nota !== null && atual?.nota !== undefined) throw new HttpError(422, 'Entrega avaliada não permite substituição');
      if (atual && this.repo.versoesEntrega(atual.id) >= 10) throw new HttpError(422, 'Limite de versões atingido; procure o professor');
      const arquivo = v.arquivo ? this.repo.salvarArquivo(u.id, v.arquivo) : null;
      const entrega = this.repo.enviar(id, u.aluno_id!, u.id, v.texto, arquivo, v.operacao_id, hash);
      this.repo.auditar(u.id, 'ENTREGAR_ATIVIDADE', String(entrega), 'Entrega autenticada');
      return this.entregas(u, id).find((e) => e.id === entrega);
    });
  }
  avaliar(u: UsuarioSessao, id: number, entrega: number, body: unknown) {
    const v = z
      .object({
        nota: z.number().nonnegative().max(100),
        devolutiva: z.string().max(5000),
        publicada: z.boolean(),
        versao: z.number().int().positive().nullable(),
        motivo: z.string().trim().min(5).max(500),
      })
      .strict()
      .parse(body);
    return this.repo.transacao(() => {
      const a = this.atividade(u, id);
      this.professor(u, a.turma_id);
      if (v.nota > a.valor_max) throw new HttpError(422, 'Nota excede a escala da atividade');
      if (!this.repo.entregas(id).some((e) => e.id === entrega)) throw new HttpError(404, 'Entrega não encontrada');
      this.repo.nota(entrega, u.id, v.nota, v.devolutiva, v.publicada, v.versao, v.motivo);
      this.repo.auditar(u.id, 'AVALIAR_ENTREGA', String(entrega), v.motivo);
      return this.entregas(u, id).find((e) => e.id === entrega);
    });
  }
  arquivo(u: UsuarioSessao, id: number, entrega: number) {
    const e = this.entregas(u, id).find((e) => e.id === entrega);
    if (!e?.arquivo_id) throw new HttpError(404, 'Arquivo não encontrado');
    const arquivo = this.repo.arquivo(e.arquivo_id);
    if (!arquivo) throw new HttpError(404, 'Arquivo não encontrado');
    this.repo.auditar(u.id, 'BAIXAR_ENTREGA', String(entrega), 'Download autorizado');
    return arquivo;
  }
}
