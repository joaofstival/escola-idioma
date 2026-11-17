// Rotas de idiomas: cada idioma tem um valor fixo de mensalidade.
import type { Db } from '../db.ts';
import type { Router } from '../router.ts';
import { HttpError } from '../router.ts';
import { Validador, encontrado, exigirCorpo, parseId } from '../validation.ts';
import type { Idioma } from '../../shared/types.ts';

const CODIGO_RE = /^[a-z]{2,3}(-[a-z0-9]{2,8})?$/;

export function buscarIdioma(db: Db, id: number): Idioma {
  return encontrado(db.get<Idioma>('SELECT id, nome, codigo, mensalidade FROM idiomas WHERE id = ?', [id]), 'Idioma não encontrado');
}

function validar(db: Db, dados: Record<string, unknown>, id: number | null) {
  const v = new Validador(dados);
  const nome = v.texto('nome', { obrigatorio: true, max: 60 });
  const codigo = v.texto('codigo', { obrigatorio: true, max: 12, rotulo: 'código' })?.toLowerCase() ?? null;
  const mensalidade = v.numero('mensalidade', { obrigatorio: true, min: 0, max: 100000 });
  if (codigo && !CODIGO_RE.test(codigo)) v.erro('código deve seguir o padrão ISO 639-1, ex.: "en", "es", "pt-br"');
  if (nome && db.get('SELECT 1 FROM idiomas WHERE nome = ? COLLATE NOCASE AND id <> ?', [nome, id ?? 0])) {
    v.erro(`Já existe um idioma com o nome "${nome}"`);
  }
  if (codigo && db.get('SELECT 1 FROM idiomas WHERE codigo = ? COLLATE NOCASE AND id <> ?', [codigo, id ?? 0])) {
    v.erro(`Já existe um idioma com o código "${codigo}"`);
  }
  v.verificar();
  return { nome: nome!, codigo: codigo!, mensalidade: Math.round(mensalidade! * 100) / 100 };
}

export function register(router: Router, db: Db): void {
  router.get('/idiomas', () => db.all<Idioma>('SELECT id, nome, codigo, mensalidade FROM idiomas ORDER BY nome'));

  router.get('/idiomas/:id', ({ params }) => buscarIdioma(db, parseId(params.id, 'Idioma')));

  router.post(
    '/idiomas',
    ({ body }) => {
      const d = validar(db, exigirCorpo(body), null);
      const { lastInsertRowid } = db.run('INSERT INTO idiomas (nome, codigo, mensalidade) VALUES (:nome, :codigo, :mensalidade)', d);
      return buscarIdioma(db, lastInsertRowid);
    },
    { status: 201 },
  );

  router.put('/idiomas/:id', ({ params, body }) => {
    const id = parseId(params.id, 'Idioma');
    const atual = buscarIdioma(db, id);
    const d = validar(db, { ...atual, ...exigirCorpo(body) }, id);
    db.run('UPDATE idiomas SET nome = :nome, codigo = :codigo, mensalidade = :mensalidade WHERE id = :id', { ...d, id });
    return buscarIdioma(db, id);
  });

  router.delete('/idiomas/:id', ({ params }) => {
    const id = parseId(params.id, 'Idioma');
    const idioma = buscarIdioma(db, id);
    const c = db.get<{ turmas: number; materiais: number; professores: number }>(
      `SELECT (SELECT count(*) FROM turmas WHERE idioma_id = :id) AS turmas,
              (SELECT count(*) FROM materiais WHERE idioma_id = :id) AS materiais,
              (SELECT count(*) FROM professor_idiomas WHERE idioma_id = :id) AS professores`,
      { id },
    )!;
    const deps: string[] = [];
    if (c.turmas) deps.push(`${c.turmas} turma(s)`);
    if (c.materiais) deps.push(`${c.materiais} material(is)`);
    if (c.professores) deps.push(`${c.professores} professor(es) habilitado(s)`);
    if (deps.length) {
      throw new HttpError(422, `Não é possível excluir o idioma "${idioma.nome}": ele está vinculado a ${deps.join(', ')}.`, deps);
    }
    db.run('DELETE FROM idiomas WHERE id = ?', [id]);
    return { ok: true };
  });
}
