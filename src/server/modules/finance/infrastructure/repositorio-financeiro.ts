import type { Db } from '../../../../main/db.ts';
import type { PortaFinanceira, MensalidadeCentral, Lancamento, Politica } from '../application/ports.ts';
export class RepositorioFinanceiro implements PortaFinanceira {
  referencias() {
    return this.db.all<{ id: number; aluno_id: number; aluno_nome: string; turma_nome: string; ano_letivo: number }>(
      "SELECT m.id,m.aluno_id,a.nome aluno_nome,t.nome turma_nome,m.ano_letivo FROM matriculas m JOIN alunos a ON a.id=m.aluno_id JOIN turmas t ON t.id=m.turma_id WHERE m.status='ativa' ORDER BY a.nome",
    );
  }
  nova(matricula: number, aluno: number, competencia: string, valor: number, vencimento: string) {
    return this.db.run('INSERT INTO mensalidades(matricula_id,aluno_id,competencia,valor,vencimento) VALUES(?,?,?,?,?)', [
      matricula,
      aluno,
      competencia,
      valor / 100,
      vencimento,
    ]).lastInsertRowid;
  }
  vencimento(id: number, data: string) {
    this.db.run('UPDATE mensalidades SET vencimento=? WHERE id=?', [data, id]);
  }

  private readonly db: Db;
  constructor(db: Db) {
    this.db = db;
  }
  transacao<T>(fn: () => T) {
    return this.db.transaction(fn);
  }
  listar() {
    return this.db.all<MensalidadeCentral>(
      `SELECT m.*,coalesce(m.valor_centavos,CAST(round(m.valor*100) AS INTEGER)) valor_centavos,a.nome aluno_nome,a.email,a.telefone,i.nome idioma_nome,t.nome turma_nome,p.multa_bp,p.juros_bp FROM mensalidades m JOIN alunos a ON a.id=m.aluno_id JOIN matriculas mt ON mt.id=m.matricula_id JOIN turmas t ON t.id=mt.turma_id JOIN idiomas i ON i.id=t.idioma_id JOIN politicas_financeiras p ON p.id=m.politica_id ORDER BY m.vencimento,m.id`,
    );
  }
  movimentos(id: number) {
    return this.db.all<Lancamento>('SELECT * FROM movimentacoes_financeiras WHERE mensalidade_id=? ORDER BY data,criado_em,rowid', [id]);
  }
  porOperacao(id: string) {
    return this.db.get<Lancamento>('SELECT * FROM movimentacoes_financeiras WHERE operacao_id=?', [id]);
  }
  gravar(m: Lancamento) {
    this.db.run(
      'INSERT INTO movimentacoes_financeiras(id,operacao_id,mensalidade_id,usuario_id,tipo,valor_centavos,data,forma,motivo,estorno_de) VALUES(?,?,?,?,?,?,?,?,?,?)',
      [m.id, m.operacao_id, m.mensalidade_id, m.usuario_id, m.tipo, m.valor_centavos, m.data, m.forma, m.motivo, m.estorno_de],
    );
  }
  sincronizar(id: number, saldo: number, pago: number, data: string, forma: string | null) {
    this.db.run('UPDATE mensalidades SET status=?,valor_pago=?,data_pagamento=?,forma_pagamento=? WHERE id=?', [
      saldo === 0 ? 'paga' : 'pendente',
      saldo === 0 ? pago / 100 : null,
      saldo === 0 ? data : null,
      saldo === 0 ? forma : null,
      id,
    ]);
  }
  cancelar(id: number) {
    this.db.run("UPDATE mensalidades SET status='cancelada' WHERE id=?", [id]);
  }
  auditar(usuario: number, acao: string, recurso: string, motivo?: string) {
    this.db.run('INSERT INTO auditoria(usuario_id,acao,recurso,motivo) VALUES(?,?,?,?)', [usuario, acao, recurso, motivo]);
  }
  politica() {
    return this.db.get<Politica>('SELECT * FROM politicas_financeiras ORDER BY id DESC LIMIT 1')!;
  }
  configurar(p: Omit<Politica, 'id'>) {
    this.db.run('INSERT INTO politicas_financeiras(dia_vencimento,prazo_inicial,multa_bp,juros_bp) VALUES(?,?,?,?)', [
      p.dia_vencimento,
      p.prazo_inicial,
      p.multa_bp,
      p.juros_bp,
    ]);
  }
}
