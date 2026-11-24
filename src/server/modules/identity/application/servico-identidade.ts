import { z } from 'zod';
import { HttpError } from '../../../../main/router.ts';
import type { UsuarioSessao } from '../../../../shared/contracts/identidade.ts';
import type { PortaIdentidade, PortaSegredos } from './ports.ts';
const senha = z.string().min(12).max(128);
const dadosConta = z
  .object({
    nome: z.string().trim().min(2).max(150),
    email: z
      .email()
      .max(254)
      .transform((v) => v.toLowerCase()),
    papel: z.enum(['admin', 'secretaria', 'financeiro', 'professor', 'aluno']),
    aluno_id: z.number().int().positive().nullable().optional(),
    professor_id: z.number().int().positive().nullable().optional(),
  })
  .strict();
export function publico(u: UsuarioSessao): UsuarioSessao {
  return { id: u.id, nome: u.nome, email: u.email, papel: u.papel, aluno_id: u.aluno_id, professor_id: u.professor_id };
}
export class ServicoIdentidade {
  readonly repositorio: PortaIdentidade;
  private readonly segredos: PortaSegredos;
  private readonly tentativas = new Map<string, { n: number; ate: number }>();
  constructor(repositorio: PortaIdentidade, segredos: PortaSegredos) {
    this.repositorio = repositorio;
    this.segredos = segredos;
  }
  async provisionarAdmin(email: string, segredo: string) {
    z.email().parse(email);
    senha.parse(segredo);
    const hash = await this.segredos.hashSenha(segredo);
    return this.repositorio.transacao(() => {
      if (this.repositorio.temAdmin()) throw new HttpError(409, 'Administrador já configurado');
      return this.repositorio.criar('Administrador', email.toLowerCase(), hash, 'admin', null, null, true);
    });
  }
  async login(body: unknown) {
    const v = z
      .object({ email: z.string().max(254), senha: z.string().max(128) })
      .strict()
      .parse(body);
    const email = v.email.trim().toLowerCase(),
      agora = Date.now();
    const anterior = this.tentativas.get(email);
    if (anterior && anterior.ate > agora && anterior.n >= 5) throw new HttpError(429, 'Muitas tentativas. Aguarde 15 minutos.');
    const t = anterior && anterior.ate > agora ? anterior : { n: 0, ate: agora + 900_000 };
    t.n++;
    if (this.tentativas.size > 10_000) this.tentativas.delete(this.tentativas.keys().next().value!);
    this.tentativas.set(email, t);
    const u = this.repositorio.porEmail(email);
    const correta = u ? await this.segredos.conferir(v.senha, u.senha_hash) : (await this.segredos.hashSenha(v.senha), false);
    if (!u?.ativo || !correta) throw new HttpError(401, 'E-mail ou senha inválidos');
    this.tentativas.delete(email);
    const token = this.segredos.emitir();
    this.repositorio.transacao(() => {
      const vigente = this.repositorio.porId(u.id);
      if (!vigente?.ativo || vigente.senha_hash !== u.senha_hash) throw new HttpError(401, 'Acesso alterado. Entre novamente.');
      this.repositorio.limparSessoes(agora);
      this.repositorio.criarSessao(this.segredos.hashToken(token), u.id, agora + 8 * 60 * 60 * 1000);
      this.repositorio.auditar(u.id, 'LOGIN', 'sessao');
    });
    return { usuario: publico(u), token };
  }
  exigir(token?: string) {
    const u = token ? this.repositorio.sessao(this.segredos.hashToken(token), Date.now()) : undefined;
    if (!u) throw new HttpError(401, 'Entre na sua conta para continuar');
    return publico(u);
  }
  logout(token: string) {
    this.repositorio.encerrarSessao(this.segredos.hashToken(token));
  }
  async trocarSenha(u: UsuarioSessao, body: unknown) {
    const v = z
      .object({ senha_atual: z.string().min(1).max(128), nova_senha: senha })
      .strict()
      .parse(body);
    // Reutiliza limitação de tentativas e a verificação de conta vigente.
    const sessao = await this.login({ email: u.email, senha: v.senha_atual });
    this.logout(sessao.token);
    const original = this.repositorio.porId(u.id);
    if (!original?.ativo) throw new HttpError(401, 'Entre novamente');
    const hash = await this.segredos.hashSenha(v.nova_senha);
    this.repositorio.transacao(() => {
      const atual = this.repositorio.porId(u.id);
      if (!atual?.ativo || atual.senha_hash !== original.senha_hash) throw new HttpError(409, 'Acesso alterado. Entre novamente');
      this.repositorio.ativar(u.id, hash);
      this.repositorio.revogar(u.id);
      this.repositorio.limparCodigos(u.id);
      this.repositorio.auditar(u.id, 'TROCAR_SENHA', 'conta:' + u.id);
    });
    return { ok: true };
  }
  async criarConta(ator: UsuarioSessao, body: unknown) {
    if (ator.papel !== 'admin') throw new HttpError(403, 'Acesso não permitido');
    const v = dadosConta.parse(body);
    if (v.papel === 'aluno' && (!v.aluno_id || !this.repositorio.pessoaExiste('aluno', v.aluno_id)))
      throw new HttpError(422, 'Vincule um aluno existente');
    if (v.papel === 'professor' && (!v.professor_id || !this.repositorio.pessoaExiste('professor', v.professor_id)))
      throw new HttpError(422, 'Vincule um professor existente');
    const hash = await this.segredos.hashSenha(this.segredos.emitir());
    const codigo = this.segredos.emitir();
    return this.repositorio.transacao(() => {
      const id = this.repositorio.criar(
        v.nome,
        v.email,
        hash,
        v.papel,
        v.papel === 'aluno' ? v.aluno_id! : null,
        v.papel === 'professor' ? v.professor_id! : null,
        false,
      );
      this.repositorio.criarCodigo(this.segredos.hashToken(codigo), id, Date.now() + 24 * 60 * 60 * 1000);
      this.repositorio.auditar(ator.id, 'CRIAR_CONTA', String(id));
      return { usuario: publico(this.repositorio.porId(id)!), codigoAtivacao: codigo };
    });
  }
  async ativar(body: unknown) {
    const v = z
      .object({ codigo: z.string().min(20).max(100), senha })
      .strict()
      .parse(body);
    const hash = await this.segredos.hashSenha(v.senha);
    this.repositorio.transacao(() => {
      const temporario = this.repositorio.codigo(this.segredos.hashToken(v.codigo), Date.now());
      if (!temporario) throw new HttpError(422, 'Código inválido ou expirado');
      this.repositorio.ativar(temporario.usuario_id, hash);
      this.repositorio.limparCodigos(temporario.usuario_id);
      this.repositorio.revogar(temporario.usuario_id);
      this.repositorio.auditar(temporario.usuario_id, 'ATIVAR_ACESSO', String(temporario.usuario_id));
    });
    return { mensagem: 'Acesso atualizado. Entre com sua senha.' };
  }
  desativar(ator: UsuarioSessao, id: number) {
    if (ator.papel !== 'admin') throw new HttpError(403, 'Acesso não permitido');
    this.repositorio.transacao(() => {
      const conta = this.repositorio.porId(id);
      if (!conta) throw new HttpError(404, 'Conta não encontrada');
      if (conta.papel === 'admin' && this.repositorio.contarAdmins() <= 1)
        throw new HttpError(422, 'Não é possível desativar o último administrador');
      this.repositorio.desativar(id);
      this.repositorio.revogar(id);
      this.repositorio.auditar(ator.id, 'DESATIVAR_CONTA', String(id));
    });
    return { ok: true };
  }
  recuperar(ator: UsuarioSessao, id: number) {
    if (ator.papel !== 'admin') throw new HttpError(403, 'Acesso não permitido');
    if (!this.repositorio.porId(id)) throw new HttpError(404, 'Conta não encontrada');
    const codigo = this.segredos.emitir();
    this.repositorio.transacao(() => {
      this.repositorio.limparCodigos(id);
      this.repositorio.criarCodigo(this.segredos.hashToken(codigo), id, Date.now() + 3600_000);
      this.repositorio.revogar(id);
      this.repositorio.auditar(ator.id, 'RECUPERAR_ACESSO', String(id));
    });
    return { codigoAtivacao: codigo };
  }
}
