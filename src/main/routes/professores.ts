// Rotas de professores. Cada professor é habilitado em um ou mais idiomas (tabela professor_idiomas).
import type { Db } from '../db.ts';
import type { Router } from '../router.ts';
import { HttpError } from '../router.ts';
import { Validador, encontrado, exigirCorpo, parseId, queryBool, queryInt } from '../validation.ts';
import type { Professor } from '../../shared/types.ts';

type ProfessorRow = Omit<Professor, 'idiomas'>;
type IdiomaRef = { professor_id: number; id: number; nome: string };

/** Anexa a lista `idiomas: {id, nome}[]` a cada professor. */
function comIdiomas(db: Db, rows: ProfessorRow[]): Professor[] {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const refs = db.all<IdiomaRef>(
    `SELECT pi.professor_id, i.id, i.nome FROM professor_idiomas pi JOIN idiomas i ON i.id = pi.idioma_id
     WHERE pi.professor_id IN (${ids.map(() => '?').join(',')}) ORDER BY i.nome`, ids);
  const porProfessor = new Map<number, { id: number; nome: string }[]>();
  for (const r of refs) {
    const lista = porProfessor.get(r.professor_id) ?? [];
    lista.push({ id: r.id, nome: r.nome });
    porProfessor.set(r.professor_id, lista);
  }
  return rows.map((r) => ({ ...r, idiomas: porProfessor.get(r.id) ?? [] }));
}

export function buscarProfessor(db: Db, id: number): Professor {
  const row = encontrado(db.get<ProfessorRow>('SELECT id, nome, email, telefone, ativo FROM professores WHERE id = ?', [id]), 'Professor não encontrado');
  return comIdiomas(db, [row])[0];
}

/** true se o professor está habilitado no idioma. */
export function professorHabilitado(db: Db, professorId: number, idiomaId: number): boolean {
  return !!db.get('SELECT 1 FROM professor_idiomas WHERE professor_id = ? AND idioma_id = ?', [professorId, idiomaId]);
}

function validar(db: Db, dados: Record<string, unknown>, id: number | null) {
  const v = new Validador(dados);
  const nome = v.texto('nome', { obrigatorio: true, max: 150 });
  const email = v.email('email', { rotulo: 'e-mail' });
  const telefone = v.texto('telefone', { max: 30 });
  const ativo = v.booleano('ativo', { padrao: true });
  const idiomas = v.listaIds('idiomas');
  for (const idiomaId of idiomas) {
    if (!db.get('SELECT 1 FROM idiomas WHERE id = ?', [idiomaId])) v.erro(`Idioma ${idiomaId} não existe`);
  }
  if (id !== null && v.valido) {
    // Não deixa remover a habilitação de um idioma em que o professor tem turmas.
    const emUso = db.all<{ nome: string; turmas: number }>(
      `SELECT i.nome, count(*) AS turmas FROM turmas t JOIN idiomas i ON i.id = t.idioma_id
       WHERE t.professor_id = ? ${idiomas.length ? `AND t.idioma_id NOT IN (${idiomas.map(() => '?').join(',')})` : ''}
       GROUP BY i.id, i.nome ORDER BY i.nome`, [id, ...idiomas]);
    for (const u of emUso) {
      v.erro(`O professor leciona em ${u.turmas} turma(s) de ${u.nome}; troque o professor dessas turmas antes de remover a habilitação`);
    }
  }
  v.verificar();
  return { nome, email, telefone, ativo: ativo ?? true, idiomas };
}

function salvarIdiomas(db: Db, professorId: number, idiomas: number[]): void {
  db.run('DELETE FROM professor_idiomas WHERE professor_id = ?', [professorId]);
  for (const idiomaId of idiomas) {
    db.run('INSERT INTO professor_idiomas (professor_id, idioma_id) VALUES (?, ?)', [professorId, idiomaId]);
  }
}

export function register(router: Router, db: Db): void {
  router.get('/professores', ({ query }) => {
    const where: string[] = [];
    const p: Record<string, number | boolean> = {};
    const ativo = queryBool(query, 'ativo');
    if (ativo !== undefined) {
      where.push('p.ativo = :ativo');
      p.ativo = ativo;
    }
    const idiomaId = queryInt(query, 'idioma_id', { min: 1 });
    if (idiomaId !== undefined) {
      where.push('EXISTS (SELECT 1 FROM professor_idiomas pi WHERE pi.professor_id = p.id AND pi.idioma_id = :idioma_id)');
      p.idioma_id = idiomaId;
    }
    const rows = db.all<ProfessorRow>(
      `SELECT p.id, p.nome, p.email, p.telefone, p.ativo FROM professores p
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY p.nome COLLATE NOCASE`, p);
    return comIdiomas(db, rows);
  });

  router.get('/professores/:id', ({ params }) => buscarProfessor(db, parseId(params.id, 'Professor')));

  router.post('/professores', ({ body }) => {
    const d = validar(db, exigirCorpo(body), null);
    const id = db.transaction(() => {
      const { lastInsertRowid } = db.run('INSERT INTO professores (nome, email, telefone, ativo) VALUES (?, ?, ?, ?)', [d.nome, d.email, d.telefone, d.ativo]);
      salvarIdiomas(db, lastInsertRowid, d.idiomas);
      return lastInsertRowid;
    });
    return buscarProfessor(db, id);
  }, { status: 201 });

  router.put('/professores/:id', ({ params, body }) => {
    const id = parseId(params.id, 'Professor');
    const atual = buscarProfessor(db, id);
    const d = validar(db, { ...atual, ...exigirCorpo(body) }, id);
    db.transaction(() => {
      db.run('UPDATE professores SET nome = ?, email = ?, telefone = ?, ativo = ? WHERE id = ?', [d.nome, d.email, d.telefone, d.ativo, id]);
      salvarIdiomas(db, id, d.idiomas);
    });
    return buscarProfessor(db, id);
  });

  router.delete('/professores/:id', ({ params }) => {
    const id = parseId(params.id, 'Professor');
    const prof = buscarProfessor(db, id);
    const turmas = db.get<{ n: number }>('SELECT count(*) AS n FROM turmas WHERE professor_id = ?', [id])!.n;
    if (turmas) {
      throw new HttpError(422,
        `Não é possível excluir o professor "${prof.nome}" porque ele está alocado em ${turmas} turma(s). Troque o professor das turmas ou inative o cadastro (ativo = falso).`,
        [`${turmas} turma(s)`]);
    }
    db.run('DELETE FROM professores WHERE id = ?', [id]); // professor_idiomas sai em cascata
    return { ok: true };
  });
}
