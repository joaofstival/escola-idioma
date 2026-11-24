import { z } from 'zod';
import { HttpError } from '../../../../main/router.ts';
import { hojeIso, dataIsoValida } from '../../../../main/validation.ts';
import type { UsuarioSessao } from '../../../../shared/contracts/identidade.ts';
import type { PortaDiario } from './ports-diario.ts';
import { ServicoAcademico } from './servico-academico.ts';
const hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  data = z.string().refine(dataIsoValida),
  motivo = z.string().trim().min(5).max(500);
export class ServicoDiario {
  private readonly repo: PortaDiario;
  private readonly acesso: ServicoAcademico;
  constructor(repo: PortaDiario, acesso: ServicoAcademico) {
    this.repo = repo;
    this.acesso = acesso;
  }
  private gestao(u: UsuarioSessao) {
    if (!['admin', 'secretaria'].includes(u.papel)) throw new HttpError(403, 'Somente a gestão pode alterar a agenda');
  }
  private exigir(u: UsuarioSessao, turma: number) {
    if (u.papel === 'financeiro') throw new HttpError(403, 'Acesso pedagógico não permitido');
    this.acesso.exigirTurma(u, turma);
  }
  listar(u: UsuarioSessao) {
    if (u.papel === 'financeiro') throw new HttpError(403, 'Acesso pedagógico não permitido');
    const ids = new Set(this.acesso.turmas(u).map((t) => t.id));
    return this.repo.aulas().filter((a) => ids.has(a.turma_id));
  }
  aula(u: UsuarioSessao, id: number) {
    const a = this.repo.aulas().find((a) => a.id === id);
    if (!a) throw new HttpError(404, 'Aula não encontrada');
    this.exigir(u, a.turma_id);
    return a;
  }
  criar(u: UsuarioSessao, body: unknown) {
    this.gestao(u);
    const v = z
      .object({
        turma_id: z.number().int().positive(),
        data,
        inicio: hora,
        fim: hora,
        local: z.string().trim().max(100).default(''),
        reposicao_de: z.number().int().positive().optional(),
        excecao_motivo: z.string().trim().min(10).max(500).optional(),
      })
      .strict()
      .parse(body);
    return this.repo.transacao(() => {
      const t = this.repo.turma(v.turma_id);
      if (!t || Number(v.data.slice(0, 4)) !== t.ano_letivo || v.inicio >= v.fim)
        throw new HttpError(422, 'Turma, data ou horário incompatível');
      const conflito = this.repo.conflita(v.turma_id, v.data, v.inicio, v.fim, v.local);
      if (conflito && !(u.papel === 'admin' && v.excecao_motivo)) throw new HttpError(422, 'Conflito de professor, aluno ou local');
      if (v.reposicao_de) {
        const original = this.aula(u, v.reposicao_de);
        if (original.status !== 'cancelada' || original.turma_id !== v.turma_id)
          throw new HttpError(422, 'Reposição exige aula cancelada da mesma turma');
      }
      const id = this.repo.criarAula(v);
      this.repo.auditar(u.id, 'CRIAR_AULA', String(id), v.excecao_motivo ?? 'Agenda presencial');
      return this.aula(u, id);
    });
  }
  atualizar(u: UsuarioSessao, id: number, body: unknown) {
    const v = z
      .object({
        versao: z.number().int().positive(),
        status: z.enum(['prevista', 'realizada', 'cancelada']),
        conteudo: z.string().max(5000),
        motivo,
      })
      .strict()
      .parse(body);
    return this.repo.transacao(() => {
      const a = this.aula(u, id);
      if (!['admin', 'secretaria', 'professor'].includes(u.papel) || (u.papel === 'professor' && v.status !== 'realizada'))
        throw new HttpError(403, 'Ação não permitida');
      if (v.status === 'realizada' && a.data > hojeIso()) throw new HttpError(422, 'Não é possível realizar uma aula futura');
      if (!this.repo.atualizarAula(id, v.versao, v.status, v.conteudo))
        throw new HttpError(409, 'Aula alterada. Recarregue antes de salvar');
      this.repo.auditar(u.id, 'ATUALIZAR_AULA', String(id), v.motivo);
      return this.aula(u, id);
    });
  }
  alunos(u: UsuarioSessao, id: number) {
    const a = this.aula(u, id);
    if (u.papel === 'aluno') throw new HttpError(403, 'Acesso não permitido');
    return this.repo.alunos(a);
  }
  chamada(u: UsuarioSessao, id: number, body: unknown) {
    const v = z
      .object({
        versao: z.number().int().positive(),
        motivo,
        presencas: z
          .array(z.object({ aluno_id: z.number().int().positive(), status: z.enum(['presente', 'falta', 'justificada']) }).strict())
          .max(500),
      })
      .strict()
      .parse(body);
    return this.repo.transacao(() => {
      const a = this.aula(u, id);
      if (!['admin', 'professor'].includes(u.papel)) throw new HttpError(403, 'Acesso não permitido');
      if (a.status !== 'realizada' || a.data > hojeIso()) throw new HttpError(422, 'Realize a aula antes da chamada');
      const alunos = this.repo.alunos(a);
      if (
        v.presencas.length !== alunos.length ||
        new Set(v.presencas.map((p) => p.aluno_id)).size !== alunos.length ||
        v.presencas.some((p) => !alunos.some((a) => a.id === p.aluno_id))
      )
        throw new HttpError(422, 'A chamada deve conter somente os alunos vinculados na data da aula, sem omissões');
      if (!this.repo.atualizarAula(id, v.versao, a.status, a.conteudo)) throw new HttpError(409, 'Chamada alterada. Recarregue');
      for (const p of v.presencas)
        this.repo.gravarPresenca(id, alunos.find((a) => a.id === p.aluno_id)!.matricula_id, p.status, v.motivo, u.id);
      this.repo.auditar(u.id, 'CHAMADA', String(id), v.motivo);
      return this.aula(u, id);
    });
  }
  frequencia(u: UsuarioSessao) {
    if (u.papel !== 'aluno' || !u.aluno_id) throw new HttpError(403, 'Consulta disponível para a própria conta de aluno');
    const aulas = this.repo.frequencia(u.aluno_id);
    const presentes = aulas.filter((a) => a.status === 'presente').length,
      faltas = aulas.filter((a) => a.status === 'falta').length;
    return {
      aulas,
      presentes,
      faltas,
      justificadas: aulas.filter((a) => a.status === 'justificada').length,
      pendentes: aulas.filter((a) => !a.status).length,
      percentual: presentes + faltas ? Math.round((presentes / (presentes + faltas)) * 100) : null,
      criterio: 'Percentual considera presenças e faltas registradas; justificadas e chamadas pendentes ficam fora do denominador.',
    };
  }
  transferir(u: UsuarioSessao, body: unknown) {
    this.gestao(u);
    const v = z
      .object({
        matricula_id: z.number().int().positive(),
        turma_destino: z.number().int().positive(),
        motivo,
        operacao_id: z.string().uuid(),
      })
      .strict()
      .parse(body);
    return this.repo.transacao(() => {
      const anterior = this.repo.transferencia(v.operacao_id);
      if (anterior) {
        if (
          anterior.origem_id !== v.matricula_id ||
          anterior.usuario_id !== u.id ||
          this.repo.matricula(anterior.destino_id)?.turma_id !== v.turma_destino
        )
          throw new HttpError(409, 'Operação já utilizada');
        return { id: anterior.destino_id };
      }
      const m = this.repo.matricula(v.matricula_id),
        destino = this.repo.turma(v.turma_destino),
        origem = m ? this.repo.turma(m.turma_id) : undefined;
      if (
        !m ||
        m.status !== 'ativa' ||
        !destino ||
        destino.id === origem?.id ||
        origem?.idioma_id !== destino.idioma_id ||
        m.ano_letivo !== destino.ano_letivo
      )
        throw new HttpError(422, 'Transferência exige matrícula ativa e turma do mesmo idioma e ano');
      const id = this.repo.transferir(m.id, destino.id, hojeIso(), u.id, v.motivo, v.operacao_id);
      this.repo.auditar(u.id, 'TRANSFERENCIA', String(id), v.motivo);
      return { id, mensagem: 'Transferência concluída; cobranças anteriores preservadas sem duplicação.' };
    });
  }
  horarios(u: UsuarioSessao) {
    if (u.papel === 'financeiro') throw new HttpError(403, 'Acesso não permitido');
    const ids = new Set(this.acesso.turmas(u).map((t) => t.id));
    return this.repo.horarios().filter((h) => ids.has(h.turma_id));
  }
  horario(u: UsuarioSessao, body: unknown) {
    this.gestao(u);
    const v = z
      .object({
        turma_id: z.number().int().positive(),
        dia: z.number().int().min(0).max(6),
        inicio: hora,
        fim: hora,
        local: z.string().trim().max(100).default(''),
        excecao_motivo: z.string().trim().min(10).max(500).optional(),
      })
      .strict()
      .parse(body);
    return this.repo.transacao(() => {
      if (!this.repo.turma(v.turma_id) || v.inicio >= v.fim) throw new HttpError(422, 'Horário ou turma inválida');
      if (this.repo.conflitaHorario(v.turma_id, v.dia, v.inicio, v.fim, v.local) && !(u.papel === 'admin' && v.excecao_motivo))
        throw new HttpError(422, 'Conflito de professor, aluno ou sala');
      this.repo.horario(v.turma_id, v.dia, v.inicio, v.fim, v.local, v.excecao_motivo ?? '');
      this.repo.auditar(u.id, 'HORARIO', String(v.turma_id), v.excecao_motivo ?? 'Novo horário');
      return this.horarios(u);
    });
  }
}
