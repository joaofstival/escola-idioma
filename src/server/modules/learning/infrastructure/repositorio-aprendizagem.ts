import type { Db } from '../../../../main/db.ts';
import type { AtividadeEscolar, EntregaEscolar, UploadArquivo } from '../../../../shared/contracts/pedagogico.ts';
import type { RepositorioBiblioteca } from '../../library/public.ts';
import type { PortaAprendizagem, DadosAtividade } from '../application/ports.ts';
export class RepositorioAprendizagem implements PortaAprendizagem {
  private readonly db: Db;
  private readonly arquivos: RepositorioBiblioteca;
  constructor(db: Db, arquivos: RepositorioBiblioteca) {
    this.db = db;
    this.arquivos = arquivos;
  }
  transacao<T>(fn: () => T) {
    return this.db.transaction(fn);
  }
  atividades() {
    return this.db.all<AtividadeEscolar>(
      'SELECT a.*,t.nome turma_nome FROM atividades a JOIN turmas t ON t.id=a.turma_id ORDER BY a.prazo,a.id',
    );
  }
  criar(u: number, v: DadosAtividade) {
    return this.db.run('INSERT INTO atividades(turma_id,autor_id,titulo,descricao,prazo,valor_max,estado) VALUES(?,?,?,?,?,?,?)', [
      v.turma_id,
      u,
      v.titulo,
      v.descricao,
      v.prazo,
      v.valor_max,
      v.estado,
    ]).lastInsertRowid;
  }
  editar(id: number, versao: number, v: DadosAtividade) {
    return (
      this.db.run('UPDATE atividades SET titulo=?,descricao=?,prazo=?,valor_max=?,estado=?,versao=versao+1 WHERE id=? AND versao=?', [
        v.titulo,
        v.descricao,
        v.prazo,
        v.valor_max,
        v.estado,
        id,
        versao,
      ]).changes === 1
    );
  }
  apagar(id: number) {
    this.db.run('DELETE FROM atividades WHERE id=?', [id]);
  }
  entregas(atividade: number) {
    return this.db.all<EntregaEscolar>(
      'SELECT e.*,a.nome aluno_nome,n.nota,n.devolutiva,n.publicada,n.versao nota_versao FROM entregas e JOIN alunos a ON a.id=e.aluno_id LEFT JOIN notas n ON n.entrega_id=e.id WHERE e.atividade_id=? ORDER BY a.nome',
      [atividade],
    );
  }
  versoesEntrega(entrega: number) {
    return this.db.get<{ n: number }>('SELECT count(*) n FROM entregas_versoes WHERE entrega_id=?', [entrega])!.n;
  }
  operacao(id: string) {
    return this.db.get<{ usuario_id: number; payload_hash: string; entrega_id: number }>(
      'SELECT usuario_id,payload_hash,entrega_id FROM entregas_versoes WHERE operacao_id=?',
      [id],
    );
  }
  enviar(atividade: number, aluno: number, usuario: number, texto: string, arquivo: string | null, operacao: string, hash: string) {
    this.db.run(
      'INSERT INTO entregas(atividade_id,aluno_id,texto,arquivo_id) VALUES(?,?,?,?) ON CONFLICT(atividade_id,aluno_id) DO UPDATE SET texto=excluded.texto,arquivo_id=excluded.arquivo_id,versao=versao+1,entregue_em=CURRENT_TIMESTAMP',
      [atividade, aluno, texto, arquivo],
    );
    const entrega = this.db.get<{ id: number; versao: number }>('SELECT id,versao FROM entregas WHERE atividade_id=? AND aluno_id=?', [
      atividade,
      aluno,
    ])!;
    this.db.run(
      'INSERT INTO entregas_versoes(entrega_id,usuario_id,operacao_id,payload_hash,texto,arquivo_id,versao) VALUES(?,?,?,?,?,?,?)',
      [entrega.id, usuario, operacao, hash, texto, arquivo, entrega.versao],
    );
    return entrega.id;
  }
  nota(entrega: number, usuario: number, nota: number, devolutiva: string, publicada: boolean, versao: number | null, motivo: string) {
    const atual = this.db.get<{ id: number; versao: number }>('SELECT id,versao FROM notas WHERE entrega_id=?', [entrega]);
    if ((atual && atual.versao !== versao) || (!atual && versao !== null)) throw new Error('VERSAO_CONFLITO');
    let id = atual?.id;
    if (atual)
      this.db.run('UPDATE notas SET nota=?,devolutiva=?,publicada=?,versao=versao+1,usuario_id=? WHERE id=?', [
        nota,
        devolutiva,
        publicada,
        usuario,
        id,
      ]);
    else
      id = this.db.run('INSERT INTO notas(entrega_id,usuario_id,nota,devolutiva,publicada) VALUES(?,?,?,?,?)', [
        entrega,
        usuario,
        nota,
        devolutiva,
        publicada,
      ]).lastInsertRowid;
    this.db.run('INSERT INTO notas_versoes(nota_id,usuario_id,nota,devolutiva,publicada,versao,motivo) VALUES(?,?,?,?,?,?,?)', [
      id,
      usuario,
      nota,
      devolutiva,
      publicada,
      (atual?.versao ?? 0) + 1,
      motivo,
    ]);
  }
  salvarArquivo(usuario: number, arquivo: UploadArquivo) {
    return this.arquivos.salvarArquivo(usuario, arquivo);
  }
  arquivo(id: string) {
    return this.arquivos.arquivo(id);
  }
  auditar(usuario: number, acao: string, recurso: string, motivo: string) {
    this.db.run('INSERT INTO auditoria(usuario_id,acao,recurso,motivo) VALUES(?,?,?,?)', [usuario, acao, recurso, motivo]);
  }
}
