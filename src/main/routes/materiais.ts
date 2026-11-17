// Materiais didáticos por idioma e nível. Materiais da turma = mesmo idioma e mesmo nível da turma.
import type { Db } from '../db.ts';
import type { Router } from '../router.ts';
import { ValidationError } from '../router.ts';
import { Validador, encontrado, exigirCorpo, parseId, queryInt } from '../validation.ts';
import { NIVEL_MAX, NIVEL_MIN, buscarTurma } from './turmas.ts';
import type { Material, MaterialTipo } from '../../shared/types.ts';

export const TIPOS_MATERIAL: readonly MaterialTipo[] = ['livro', 'apostila', 'audio', 'video', 'link', 'outro'];

const SELECT_MATERIAL = `
  SELECT m.id, m.titulo, m.tipo, m.idioma_id, i.nome AS idioma_nome, m.nivel, m.autor, m.referencia, m.descricao
  FROM materiais m JOIN idiomas i ON i.id = m.idioma_id`;
const ORDEM = 'ORDER BY i.nome, m.nivel, m.titulo COLLATE NOCASE';

export function buscarMaterial(db: Db, id: number): Material {
  return encontrado(db.get<Material>(`${SELECT_MATERIAL} WHERE m.id = ?`, [id]), 'Material não encontrado');
}

function validar(db: Db, dados: Record<string, unknown>) {
  const v = new Validador(dados);
  const titulo = v.texto('titulo', { obrigatorio: true, max: 200, rotulo: 'título' });
  const tipo = v.enumeracao('tipo', TIPOS_MATERIAL, { obrigatorio: true });
  const idioma_id = v.inteiro('idioma_id', { obrigatorio: true, min: 1, rotulo: 'idioma' });
  const nivel = v.inteiro('nivel', { obrigatorio: true, min: NIVEL_MIN, max: NIVEL_MAX, rotulo: 'nível' });
  const autor = v.texto('autor', { max: 150 });
  const referencia = v.texto('referencia', { max: 500, rotulo: 'referência' });
  const descricao = v.texto('descricao', { max: 2000, rotulo: 'descrição' });
  if (idioma_id && !db.get('SELECT 1 FROM idiomas WHERE id = ?', [idioma_id])) v.erro(`Idioma ${idioma_id} não existe`);
  if (tipo === 'link' && referencia && !/^https?:\/\/\S+$/i.test(referencia))
    v.erro('referência de um link deve ser um endereço http(s)://');
  v.verificar();
  return { titulo, tipo, idioma_id, nivel, autor, referencia, descricao };
}

export function listarMateriais(db: Db, f: { idioma_id?: number; nivel?: number; tipo?: MaterialTipo; busca?: string }): Material[] {
  const where: string[] = [];
  const p: Record<string, string | number> = {};
  if (f.idioma_id !== undefined) {
    where.push('m.idioma_id = :idioma_id');
    p.idioma_id = f.idioma_id;
  }
  if (f.nivel !== undefined) {
    where.push('m.nivel = :nivel');
    p.nivel = f.nivel;
  }
  if (f.tipo) {
    where.push('m.tipo = :tipo');
    p.tipo = f.tipo;
  }
  if (f.busca) {
    where.push(`(instr(sem_acento(m.titulo), sem_acento(:busca)) > 0 OR instr(sem_acento(coalesce(m.autor, '')), sem_acento(:busca)) > 0
      OR instr(sem_acento(coalesce(m.descricao, '')), sem_acento(:busca)) > 0)`);
    p.busca = f.busca;
  }
  return db.all<Material>(`${SELECT_MATERIAL} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ${ORDEM}`, p);
}

export function register(router: Router, db: Db): void {
  router.get('/materiais', ({ query }) => {
    const tipo = query.tipo?.trim() || undefined;
    if (tipo && !(TIPOS_MATERIAL as readonly string[]).includes(tipo)) {
      throw new ValidationError([`Filtro tipo inválido: "${tipo}" (use ${TIPOS_MATERIAL.join(', ')})`], 'Filtro inválido');
    }
    return listarMateriais(db, {
      idioma_id: queryInt(query, 'idioma_id', { min: 1 }),
      nivel: queryInt(query, 'nivel', { min: NIVEL_MIN, max: NIVEL_MAX }),
      tipo: tipo as MaterialTipo | undefined,
      busca: query.busca?.trim() || undefined,
    });
  });

  router.get('/materiais/:id', ({ params }) => buscarMaterial(db, parseId(params.id, 'Material')));

  router.post(
    '/materiais',
    ({ body }) => {
      const d = validar(db, exigirCorpo(body));
      const { lastInsertRowid } = db.run(
        `INSERT INTO materiais (titulo, tipo, idioma_id, nivel, autor, referencia, descricao)
       VALUES (:titulo, :tipo, :idioma_id, :nivel, :autor, :referencia, :descricao)`,
        d,
      );
      return buscarMaterial(db, lastInsertRowid);
    },
    { status: 201 },
  );

  router.put('/materiais/:id', ({ params, body }) => {
    const id = parseId(params.id, 'Material');
    const { idioma_nome: _i, ...atual } = buscarMaterial(db, id);
    const d = validar(db, { ...atual, ...exigirCorpo(body) });
    db.run(
      `UPDATE materiais SET titulo = :titulo, tipo = :tipo, idioma_id = :idioma_id, nivel = :nivel, autor = :autor,
         referencia = :referencia, descricao = :descricao WHERE id = :id`,
      { ...d, id },
    );
    return buscarMaterial(db, id);
  });

  router.delete('/materiais/:id', ({ params }) => {
    const id = parseId(params.id, 'Material');
    buscarMaterial(db, id);
    db.run('DELETE FROM materiais WHERE id = ?', [id]);
    return { ok: true };
  });

  router.get('/turmas/:id/materiais', ({ params }) => {
    const turma = buscarTurma(db, parseId(params.id, 'Turma'));
    return listarMateriais(db, { idioma_id: turma.idioma_id, nivel: turma.nivel });
  });
}
