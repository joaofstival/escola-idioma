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
  private readonly legado: ReturnType<typeof createApi>;
  constructor(db: Db) {
    this.db = db;
    this.legado = createApi(db);
    this.identidade = new ServicoIdentidade(new RepositorioIdentidade(db), new SegredosScrypt());
    this.academico = new ServicoAcademico(new RepositorioAcademicoSqlite(db));
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
      if (caminho === '/portal/turmas' && req.method === 'GET') return this.ok(this.academico.turmas(u));
      const turma = /^\/portal\/turmas\/(\d+)\/alunos$/.exec(caminho);
      if (turma && req.method === 'GET') return this.ok(this.academico.alunos(u, Number(turma[1])));
      if (caminho === '/portal/dashboard' && req.method === 'GET')
        return this.ok({ turmas: this.academico.turmas(u).length, perfil: u.papel });
      if (caminho === '/portal/mensalidades' && req.method === 'GET') {
        if (u.papel !== 'aluno') throw new HttpError(403, 'Acesso não permitido');
        return this.legado.handle({ method: 'GET', path: `/mensalidades?aluno_id=${u.aluno_id}` });
      }
      if (!this.permitido(u, req.method, caminho)) throw new HttpError(403, 'Acesso não permitido');
      if (u.papel === 'financeiro' && caminho === '/alunos' && req.method === 'GET')
        return this.ok(this.db.all('SELECT id,nome FROM alunos ORDER BY nome'));
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
