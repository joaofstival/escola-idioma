import { randomUUID, createHash } from 'node:crypto';
import type { Db } from '../../../../main/db.ts';
import type { UploadArquivo, PublicacaoMaterial } from '../../../../shared/contracts/pedagogico.ts';
import { validarArquivo } from '../domain/arquivo.ts';
import type { PortaBiblioteca, DownloadArquivo } from '../application/ports.ts';
export class RepositorioBiblioteca implements PortaBiblioteca {
  readonly db: Db;
  constructor(db: Db) {
    this.db = db;
  }
  transacao<T>(fn: () => T) {
    return this.db.transaction(fn);
  }
  listar() {
    return this.db.all<PublicacaoMaterial>(
      'SELECT p.*,t.nome turma_nome,u.nome autor_nome,f.nome arquivo_nome,f.mime,f.tamanho FROM publicacoes_material p JOIN turmas t ON t.id=p.turma_id JOIN usuarios u ON u.id=p.autor_id LEFT JOIN arquivos_privados f ON f.id=p.arquivo_id ORDER BY p.grupo,p.versao DESC',
    );
  }
  arquivo(id: string) {
    const f = this.db.get<{ nome: string; mime: string; sha256: string; dados: Uint8Array }>(
      'SELECT nome,mime,sha256,dados FROM arquivos_privados WHERE id=?',
      [id],
    );
    if (!f) return undefined;
    const bytes = Buffer.from(f.dados);
    if (createHash('sha256').update(bytes).digest('hex') !== f.sha256) throw new Error('Arquivo corrompido');
    return { nome: f.nome, mime: f.mime, sha256: f.sha256, base64: bytes.toString('base64') } satisfies DownloadArquivo;
  }
  salvarArquivo(usuario: number, upload: UploadArquivo) {
    const usado = this.db.get<{ n: number }>('SELECT coalesce(sum(tamanho),0) n FROM arquivos_privados WHERE usuario_id=?', [usuario])!.n;
    if (usado + (upload.base64.length * 3) / 4 > 100 * 1024 * 1024) throw new Error('ARQUIVO_INVALIDO');
    const bytes = Buffer.from(upload.base64, 'base64');
    if (bytes.toString('base64') !== upload.base64) throw new Error('ARQUIVO_INVALIDO');
    validarArquivo(upload.nome, upload.mime, bytes);
    const id = randomUUID();
    this.db.run('INSERT INTO arquivos_privados(id,usuario_id,nome,mime,tamanho,sha256,dados) VALUES(?,?,?,?,?,?,?)', [
      id,
      usuario,
      upload.nome,
      upload.mime,
      bytes.length,
      createHash('sha256').update(bytes).digest('hex'),
      bytes,
    ]);
    return id;
  }
  criar(v: Parameters<PortaBiblioteca['criar']>[0]) {
    return this.db.run(
      'INSERT INTO publicacoes_material(grupo,versao,turma_id,autor_id,titulo,descricao,link,arquivo_id,estado,acesso_ate) VALUES(?,?,?,?,?,?,?,?,?,?)',
      [v.grupo, v.versao, v.turma_id, v.autor_id, v.titulo, v.descricao, v.link, v.arquivo_id, v.estado, v.acesso_ate],
    ).lastInsertRowid;
  }
  estado(id: number, revisao: number, estado: string) {
    const mudou =
      this.db.run('UPDATE publicacoes_material SET estado=?,revisao=revisao+1 WHERE id=? AND revisao=?', [estado, id, revisao]).changes ===
      1;
    if (mudou && estado === 'arquivado')
      this.db.run(
        "UPDATE publicacoes_material SET estado='arquivado',revisao=revisao+1 WHERE grupo=(SELECT grupo FROM publicacoes_material WHERE id=?) AND id<>?",
        [id, id],
      );
    return mudou;
  }
  auditar(usuario: number, acao: string, recurso: string, motivo: string) {
    this.db.run('INSERT INTO auditoria(usuario_id,acao,recurso,motivo) VALUES(?,?,?,?)', [usuario, acao, recurso, motivo]);
  }
}
