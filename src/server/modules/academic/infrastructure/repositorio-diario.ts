import type { Db } from '../../../../main/db.ts';
import { matricular } from '../../../../main/routes/matriculas.ts';
import type { PortaDiario, Aula, TurmaDiario, AlunoAula } from '../application/ports-diario.ts';
export class RepositorioDiario implements PortaDiario {
  private readonly db: Db;
  constructor(db: Db) {
    this.db = db;
  }
  transacao<T>(fn: () => T) {
    return this.db.transaction(fn);
  }
  turma(id: number) {
    return this.db.get<TurmaDiario>('SELECT id,idioma_id,ano_letivo,professor_id FROM turmas WHERE id=?', [id]);
  }
  aulas() {
    return this.db.all<Aula>(
      'SELECT a.*,t.nome turma_nome,t.professor_id FROM aulas a JOIN turmas t ON t.id=a.turma_id ORDER BY a.data,a.inicio',
    );
  }
  alunos(a: Aula) {
    return this.db.all<AlunoAula>(
      `SELECT al.id,al.nome,m.id matricula_id,p.status FROM matriculas m JOIN alunos al ON al.id=m.aluno_id LEFT JOIN presencas p ON p.matricula_id=m.id AND p.aula_id=? WHERE m.turma_id=? AND m.data<=? AND (m.encerrada_em IS NULL OR m.encerrada_em>=?) AND (m.status<>'cancelada' OR m.encerrada_em IS NOT NULL) ORDER BY al.nome`,
      [a.id, a.turma_id, a.data, a.data],
    );
  }
  private conflitos(turma: number, inicio: string, fim: string, local: string, periodo: string, valor: string | number) {
    return !!this.db.get(
      `SELECT a.id FROM ${periodo === 'data' ? 'aulas' : 'horarios_turma'} a JOIN turmas t ON t.id=a.turma_id JOIN turmas nova ON nova.id=? WHERE a.${periodo}=? AND a.inicio<? AND a.fim>? ${periodo === 'data' ? "AND a.status<>'cancelada'" : ''} AND (a.turma_id=nova.id OR (t.professor_id IS NOT NULL AND t.professor_id=nova.professor_id) OR (?<>'' AND lower(a.local)=lower(?)) OR EXISTS(SELECT 1 FROM matriculas x JOIN matriculas y ON x.aluno_id=y.aluno_id WHERE x.turma_id=a.turma_id AND y.turma_id=nova.id AND x.status='ativa' AND y.status='ativa')) LIMIT 1`,
      [turma, valor, fim, inicio, local, local],
    );
  }
  conflita(turma: number, data: string, inicio: string, fim: string, local: string) {
    return this.conflitos(turma, inicio, fim, local, 'data', data);
  }
  conflitaHorario(turma: number, dia: number, inicio: string, fim: string, local: string) {
    return this.conflitos(turma, inicio, fim, local, 'dia', dia);
  }
  criarAula(v: { turma_id: number; data: string; inicio: string; fim: string; local: string; reposicao_de?: number }) {
    return this.db.run('INSERT INTO aulas(turma_id,data,inicio,fim,local,reposicao_de) VALUES(?,?,?,?,?,?)', [
      v.turma_id,
      v.data,
      v.inicio,
      v.fim,
      v.local,
      v.reposicao_de,
    ]).lastInsertRowid;
  }
  atualizarAula(id: number, versao: number, status: string, conteudo: string) {
    return (
      this.db.run('UPDATE aulas SET status=?,conteudo=?,versao=versao+1 WHERE id=? AND versao=?', [status, conteudo, id, versao])
        .changes === 1
    );
  }
  gravarPresenca(aula: number, matricula: number, status: string, motivo: string, usuario: number) {
    this.db.run('INSERT INTO presencas_historico(aula_id,matricula_id,status,motivo,usuario_id) VALUES(?,?,?,?,?)', [
      aula,
      matricula,
      status,
      motivo,
      usuario,
    ]);
    this.db.run(
      'INSERT INTO presencas(aula_id,matricula_id,status,motivo,usuario_id) VALUES(?,?,?,?,?) ON CONFLICT(aula_id,matricula_id) DO UPDATE SET status=excluded.status,motivo=excluded.motivo,usuario_id=excluded.usuario_id',
      [aula, matricula, status, motivo, usuario],
    );
  }
  auditar(usuario: number, acao: string, recurso: string, motivo: string) {
    this.db.run('INSERT INTO auditoria(usuario_id,acao,recurso,motivo) VALUES(?,?,?,?)', [usuario, acao, recurso, motivo]);
  }
  transferencia(operacao: string) {
    return this.db.get<{ origem_id: number; destino_id: number; usuario_id: number }>(
      'SELECT origem_id,destino_id,usuario_id FROM transferencias WHERE operacao_id=?',
      [operacao],
    );
  }
  matricula(id: number) {
    return this.db.get<{ id: number; aluno_id: number; turma_id: number; ano_letivo: number; status: string }>(
      'SELECT * FROM matriculas WHERE id=?',
      [id],
    );
  }
  transferir(origem: number, destino: number, data: string, usuario: number, motivo: string, operacao: string) {
    const m = this.matricula(origem)!;
    this.db.run("UPDATE matriculas SET status='concluida',encerrada_em=? WHERE id=?", [data, origem]);
    const nova = matricular(this.db, { aluno_id: m.aluno_id, turma_id: destino, ano_letivo: m.ano_letivo, data }, data, 'matricula', false);
    this.db.run('INSERT INTO transferencias(operacao_id,origem_id,destino_id,usuario_id,motivo,data) VALUES(?,?,?,?,?,?)', [
      operacao,
      origem,
      nova.id,
      usuario,
      motivo,
      data,
    ]);
    return nova.id;
  }
  frequencia(aluno: number) {
    return this.db.all<{ aula_id: number; data: string; turma_nome: string; status: string | null }>(
      `SELECT a.id aula_id,a.data,t.nome turma_nome,p.status FROM aulas a JOIN turmas t ON t.id=a.turma_id JOIN matriculas m ON m.turma_id=t.id LEFT JOIN presencas p ON p.aula_id=a.id AND p.matricula_id=m.id WHERE m.aluno_id=? AND (m.status<>'cancelada' OR m.encerrada_em IS NOT NULL) AND a.status='realizada' AND m.data<=a.data AND (m.encerrada_em IS NULL OR m.encerrada_em>=a.data) ORDER BY a.data`,
      [aluno],
    );
  }
  horario(turma: number, dia: number, inicio: string, fim: string, local: string, motivo: string) {
    this.db.run('INSERT INTO horarios_turma(turma_id,dia,inicio,fim,local,excecao_motivo) VALUES(?,?,?,?,?,?)', [
      turma,
      dia,
      inicio,
      fim,
      local,
      motivo,
    ]);
  }
  horarios() {
    return this.db.all<{ id: number; turma_id: number; dia: number; inicio: string; fim: string; local: string }>(
      'SELECT * FROM horarios_turma ORDER BY dia,inicio',
    );
  }
}
