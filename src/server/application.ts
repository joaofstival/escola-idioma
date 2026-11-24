import { ServicoDiario } from './modules/academic/application/servico-diario.ts';
import { RepositorioDiario } from './modules/academic/infrastructure/repositorio-diario.ts';
import { ServicoFinanceiro, RepositorioFinanceiro } from './modules/finance/public.ts';
import { z } from 'zod';
import type { Db } from '../main/db.ts';
import { createApi } from '../main/app.ts';
import { HttpError } from '../main/router.ts';
import type { ApiRequest, ApiResponse } from '../shared/types.ts';
import type { UsuarioSessao } from '../shared/contracts/identidade.ts';
import { ServicoIdentidade, RepositorioIdentidade, SegredosScrypt } from './modules/identity/public.ts';
import { ServicoAcademico, RepositorioAcademicoSqlite } from './modules/academic/public.ts';

export class AplicacaoCentral {
  readonly db: Db;
  readonly identidade: ServicoIdentidade;
  readonly academico: ServicoAcademico;
  readonly diario: ServicoDiario;
  readonly financeiro: ServicoFinanceiro;
  private readonly legado: ReturnType<typeof createApi>;
  constructor(db: Db) {
    this.db = db;
    this.financeiro = new ServicoFinanceiro(new RepositorioFinanceiro(db));
    this.legado = createApi(db);
    this.identidade = new ServicoIdentidade(new RepositorioIdentidade(db), new SegredosScrypt());
    this.academico = new ServicoAcademico(new RepositorioAcademicoSqlite(db));
    this.diario = new ServicoDiario(new RepositorioDiario(db), this.academico);
  }
  async handle(req: ApiRequest, token?: string): Promise<ApiResponse> {
    try {
      const caminho = decodeURIComponent(req.path.split('?')[0]);
      if (caminho.split('/').some((p) => p === '..' || p === '.') || caminho.includes('//')) throw new HttpError(400, 'Caminho inválido');
      const request = { ...req, path: caminho + (req.path.includes('?') ? '?' + req.path.split('?')[1] : '') };
      if (req.method === 'POST' && caminho === '/auth/login') return this.ok(await this.identidade.login(req.body));
      if (req.method === 'POST' && caminho === '/auth/ativar') return this.ok(await this.identidade.ativar(req.body));
      const u = this.identidade.exigir(token);
      if (req.method === 'GET' && caminho === '/auth/session') return this.ok({ usuario: u });
      if (req.method === 'POST' && caminho === '/auth/logout') {
        this.identidade.logout(token!);
        return this.ok({ ok: true });
      }
      if (caminho.startsWith('/admin/')) {
        if (u.papel !== 'admin') throw new HttpError(403, 'Acesso não permitido');
        if (caminho === '/admin/usuarios' && req.method === 'GET')
          return this.ok(this.db.all('SELECT id,nome,email,papel,aluno_id,professor_id,ativo FROM usuarios ORDER BY nome'));
        if (caminho === '/admin/usuarios' && req.method === 'POST') return this.ok(await this.identidade.criarConta(u, req.body), 201);
        const conta = /^\/admin\/usuarios\/(\d+)\/(desativar|recuperar)$/.exec(caminho);
        if (conta && req.method === 'POST')
          return this.ok(
            conta[2] === 'desativar' ? this.identidade.desativar(u, Number(conta[1])) : this.identidade.recuperar(u, Number(conta[1])),
          );
        throw new HttpError(404, 'Rota não encontrada');
      }
      if (caminho === '/academico/aulas' && req.method === 'GET') return this.ok(this.diario.listar(u));
      if (caminho === '/academico/aulas' && req.method === 'POST') return this.ok(this.diario.criar(u, req.body), 201);
      if (caminho === '/academico/horarios' && req.method === 'GET') return this.ok(this.diario.horarios(u));
      if (caminho === '/academico/horarios' && req.method === 'POST') return this.ok(this.diario.horario(u, req.body));
      if (caminho === '/academico/transferencias' && req.method === 'POST') return this.ok(this.diario.transferir(u, req.body));
      if (caminho === '/academico/frequencia' && req.method === 'GET') return this.ok(this.diario.frequencia(u));
      const aula = /^\/academico\/aulas\/(\d+)(?:\/(alunos|chamada))?$/.exec(caminho);
      if (aula) {
        const id = Number(aula[1]);
        if (req.method === 'GET' && aula[2] === 'alunos') return this.ok(this.diario.alunos(u, id));
        if (req.method === 'PUT' && !aula[2]) return this.ok(this.diario.atualizar(u, id, req.body));
        if (req.method === 'POST' && aula[2] === 'chamada') return this.ok(this.diario.chamada(u, id, req.body));
      }
      if (caminho === '/portal/turmas' && req.method === 'GET') return this.ok(this.academico.turmas(u));
      const turma = /^\/portal\/turmas\/(\d+)\/alunos$/.exec(caminho);
      if (turma && req.method === 'GET') return this.ok(this.academico.alunos(u, Number(turma[1])));
      if (caminho === '/portal/dashboard' && req.method === 'GET')
        return this.ok({ turmas: this.academico.turmas(u).length, perfil: u.papel });
      if (caminho === '/portal/mensalidades' && req.method === 'GET') {
        if (u.papel !== 'aluno') throw new HttpError(403, 'Acesso não permitido');
        return this.ok(this.financeiro.listar(u));
      }
      const extrato = /^\/portal\/mensalidades\/(\d+)\/extrato$/.exec(caminho);
      if (extrato && req.method === 'GET') return this.ok(this.financeiro.extrato(u, Number(extrato[1])));
      if (!this.permitido(u, req.method, caminho)) throw new HttpError(403, 'Acesso não permitido');
      if (caminho === '/financeiro/matriculas' && req.method === 'GET') return this.ok(this.financeiro.referencias(u));
      if (caminho === '/mensalidades' && req.method === 'POST') return this.ok(this.financeiro.criar(u, req.body), 201);
      const consulta = new URLSearchParams(req.path.split('?')[1] ?? '');
      const mensalidade = /^\/mensalidades\/(\d+)(?:\/(pagar|estornar|extrato|ajustar|simulacao|cancelar))?$/.exec(caminho);
      if (caminho === '/mensalidades' && req.method === 'GET') return this.ok(this.financeiro.listar(u, consulta));
      if (mensalidade) {
        const id = Number(mensalidade[1]);
        if (req.method === 'PUT' && !mensalidade[2]) return this.ok(this.financeiro.corrigir(u, id, req.body));
        if (req.method === 'PUT' && mensalidade[2] === 'cancelar') return this.ok(this.financeiro.cancelar(u, id, req.body));
        if (req.method === 'GET' && mensalidade[2] === 'simulacao')
          return this.ok(this.financeiro.simular(u, id, consulta.get('data') ?? ''));
        if (req.method === 'GET')
          return this.ok(mensalidade[2] === 'extrato' ? this.financeiro.extrato(u, id) : this.financeiro.extrato(u, id).mensalidade);
        if (req.method === 'POST' && mensalidade[2] === 'pagar') return this.ok(this.financeiro.pagar(u, id, req.body));
        if (req.method === 'POST' && mensalidade[2] === 'estornar') return this.ok(this.financeiro.estornar(u, id, req.body));
        if (req.method === 'POST' && mensalidade[2] === 'ajustar') return this.ok(this.financeiro.ajustar(u, id, req.body));
      }
      if (caminho === '/financeiro/configuracoes')
        return this.ok(req.method === 'GET' ? this.financeiro.configuracao(u) : this.financeiro.configurar(u, req.body));
      if (caminho === '/financeiro/resumo' && req.method === 'GET')
        return this.ok(
          this.financeiro.resumo(u, Number(consulta.get('ano') ?? new Date().getFullYear()), consulta.get('regime') === 'caixa'),
        );
      if (caminho === '/financeiro/inadimplentes' && req.method === 'GET') return this.ok(this.financeiro.inadimplentes(u));
      if (u.papel === 'financeiro' && caminho === '/alunos' && req.method === 'GET')
        return this.ok(this.db.all('SELECT id,nome FROM alunos ORDER BY nome'));
      if (req.method === 'GET' && caminho === '/dashboard') {
        const base = await this.legado.handle(request);
        if (!base.ok) return base;
        const hoje = new Date(),
          ano = hoje.getFullYear(),
          mes = hoje.getMonth();
        const resumo = this.financeiro.resumo(u, ano, true);
        return this.ok({
          ...(base.data as object),
          receita_mes: resumo.por_mes[mes].recebido,
          a_receber_mes:
            this.financeiro
              .listar(u, new URLSearchParams({ competencia: `${ano}-${String(mes + 1).padStart(2, '0')}` }))
              .reduce((n, m) => n + m.saldo_centavos, 0) / 100,
          inadimplentes: this.financeiro.inadimplentes(u).length,
        });
      }
      const historico = /^\/alunos\/(\d+)\/historico$/.exec(caminho);
      if (req.method === 'GET' && historico) {
        const base = await this.legado.handle(request);
        if (!base.ok) return base;
        const mensalidades = this.financeiro.listar(u, new URLSearchParams({ aluno_id: historico[1] }));
        return this.ok({
          ...(base.data as object),
          mensalidades,
          resumo: {
            pago: mensalidades.reduce((n, m) => n + m.pago_centavos, 0) / 100,
            pendente: mensalidades.filter((m) => !m.atrasada).reduce((n, m) => n + m.saldo_centavos, 0) / 100,
            atrasado: mensalidades.filter((m) => m.atrasada).reduce((n, m) => n + m.saldo_centavos, 0) / 100,
          },
        });
      }
      const r = await this.legado.handle(request, (fn) =>
        this.db.transaction(() => {
          const valor = fn();
          if (valor instanceof Promise) throw new Error('Mutação assíncrona sem unidade de trabalho');
          this.identidade.repositorio.auditar(u.id, req.method, caminho);
          return valor;
        }),
      );
      return r;
    } catch (err) {
      if (err instanceof HttpError) return { ok: false, status: err.status, erro: err.erro };
      if (err instanceof z.ZodError) return { ok: false, status: 422, erro: 'Dados inválidos. Confira os campos e os limites informados.' };
      if (err instanceof Error && err.message === 'TURMA_NAO_AUTORIZADA') return { ok: false, status: 403, erro: 'Turma não autorizada' };
      if (err instanceof Error && /UNIQUE|FOREIGN KEY|CHECK/.test(err.message))
        return { ok: false, status: 422, erro: 'Dados incompatíveis ou já cadastrados' };
      console.error('[api] falha interna');
      return { ok: false, status: 500, erro: 'Não foi possível concluir a operação' };
    }
  }
  private permitido(u: UsuarioSessao, metodo: string, caminho: string) {
    if (u.papel === 'admin') return true;
    if (metodo === 'GET' && /^\/(cotacao|traducao)(\/|$)/.test(caminho)) return true;
    if (u.papel === 'financeiro') return /^\/(mensalidades|financeiro)(\/|$)/.test(caminho) || (metodo === 'GET' && caminho === '/alunos');
    if (u.papel === 'secretaria')
      return /^\/(alunos|professores|idiomas|turmas|matriculas|materiais)(\/|$)/.test(caminho) && !caminho.endsWith('/historico');
    return false;
  }
  private ok(data: unknown, status = 200): ApiResponse {
    return { ok: true, status, data };
  }
}
