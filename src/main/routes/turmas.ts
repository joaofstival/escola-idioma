// Rotas de turmas. Regras: nível inteiro 1–12, capacidade ≥ 1 e professor habilitado no idioma da turma.
// GET /turmas/:id/materiais fica em routes/materiais.ts.
import type { Db } from '../db.ts';
import type { Router } from '../router.ts';
import { HttpError } from '../router.ts';
import { Validador, encontrado, exigirCorpo, parseId, queryInt } from '../validation.ts';
import { professorHabilitado } from './professores.ts';
import type { Turma } from '../../shared/types.ts';

export const NIVEL_MIN = 1;
export const NIVEL_MAX = 12;

/** Ocupação = matrículas ativas na turma. */
const SELECT_TURMA = `
  SELECT t.id, t.nome, t.idioma_id, i.nome AS idioma_nome, t.nivel, t.ano_letivo, t.professor_id,
         p.nome AS professor_nome, t.horario, t.capacidade,
         (SELECT count(*) FROM matriculas m WHERE m.turma_id = t.id AND m.status = 'ativa') AS ocupacao
  FROM turmas t
  JOIN idiomas i ON i.id = t.idioma_id
  LEFT JOIN professores p ON p.id = t.professor_id`;

export function buscarTurma(db: Db, id: number): Turma {
  const turma = encontrado(db.get<Turma>(`${SELECT_TURMA} WHERE t.id = ?`, [id]), 'Turma não encontrada');
  turma.alunos = db.all<{ id: number; nome: string }>(
    `SELECT a.id, a.nome FROM matriculas m JOIN alunos a ON a.id = m.aluno_id
     WHERE m.turma_id = ? AND m.status = 'ativa' ORDER BY a.nome COLLATE NOCASE`,
    [id],
  );
  return turma;
}

function validar(db: Db, dados: Record<string, unknown>, atual: Turma | null) {
  const v = new Validador(dados);
  const nome = v.texto('nome', { obrigatorio: true, max: 80 });
  const idioma_id = v.inteiro('idioma_id', { obrigatorio: true, min: 1, rotulo: 'idioma' });
  const nivel = v.inteiro('nivel', { obrigatorio: true, min: NIVEL_MIN, max: NIVEL_MAX, rotulo: 'nível' });
  const ano_letivo = v.inteiro('ano_letivo', { obrigatorio: true, min: 2000, max: 2100, rotulo: 'ano letivo' });
  const professor_id = v.inteiro('professor_id', { min: 1, rotulo: 'professor' });
  const horario = v.texto('horario', { max: 120, rotulo: 'horário' });
  const capacidade = v.inteiro('capacidade', { obrigatorio: true, min: 1, max: 500 });

  const idioma = idioma_id ? db.get<{ nome: string }>('SELECT nome FROM idiomas WHERE id = ?', [idioma_id]) : undefined;
  if (idioma_id && !idioma) v.erro(`Idioma ${idioma_id} não existe`);

  if (professor_id) {
    const prof = db.get<{ nome: string; ativo: boolean }>('SELECT nome, ativo FROM professores WHERE id = ?', [professor_id]);
    if (!prof) v.erro(`Professor ${professor_id} não existe`);
    else {
      if (!prof.ativo && professor_id !== atual?.professor_id) v.erro(`O professor ${prof.nome} está inativo e não pode ser alocado`);
      if (idioma && !professorHabilitado(db, professor_id, idioma_id!)) {
        v.erro(`O professor ${prof.nome} não está habilitado em ${idioma.nome}`);
      }
    }
  }

  if (
    nome &&
    ano_letivo &&
    db.get('SELECT 1 FROM turmas WHERE nome = ? AND ano_letivo = ? AND id <> ?', [nome, ano_letivo, atual?.id ?? 0])
  ) {
    v.erro(`Já existe uma turma "${nome}" em ${ano_letivo}`);
  }

  if (atual) {
    const ocupacao = atual.ocupacao ?? 0;
    if (capacidade && capacidade < ocupacao)
      v.erro(`capacidade não pode ser menor que a ocupação atual (${ocupacao} aluno(s) matriculados)`);
    const temMatriculas = !!db.get('SELECT 1 FROM matriculas WHERE turma_id = ?', [atual.id]);
    if (temMatriculas && idioma_id && idioma_id !== atual.idioma_id)
      v.erro('Não é possível trocar o idioma de uma turma que já tem matrículas');
    if (temMatriculas && ano_letivo && ano_letivo !== atual.ano_letivo)
      v.erro('Não é possível trocar o ano letivo de uma turma que já tem matrículas');
  }

  v.verificar();
  return { nome, idioma_id, nivel, ano_letivo, professor_id, horario, capacidade };
}

export function register(router: Router, db: Db): void {
  router.get('/turmas', ({ query }) => {
    const where: string[] = [];
    const p: Record<string, number> = {};
    const ano = queryInt(query, 'ano', { min: 2000, max: 2100 });
    if (ano !== undefined) {
      where.push('t.ano_letivo = :ano');
      p.ano = ano;
    }
    const idiomaId = queryInt(query, 'idioma_id', { min: 1 });
    if (idiomaId !== undefined) {
      where.push('t.idioma_id = :idioma_id');
      p.idioma_id = idiomaId;
    }
    const nivel = queryInt(query, 'nivel', { min: NIVEL_MIN, max: NIVEL_MAX });
    if (nivel !== undefined) {
      where.push('t.nivel = :nivel');
      p.nivel = nivel;
    }
    const professorId = queryInt(query, 'professor_id', { min: 1 });
    if (professorId !== undefined) {
      where.push('t.professor_id = :professor_id');
      p.professor_id = professorId;
    }
    return db.all<Turma>(
      `${SELECT_TURMA} ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY t.ano_letivo DESC, i.nome, t.nivel, t.nome COLLATE NOCASE`,
      p,
    );
  });

  router.get('/turmas/:id', ({ params }) => buscarTurma(db, parseId(params.id, 'Turma')));

  router.post(
    '/turmas',
    ({ body }) => {
      const d = validar(db, exigirCorpo(body), null);
      const { lastInsertRowid } = db.run(
        `INSERT INTO turmas (nome, idioma_id, nivel, ano_letivo, professor_id, horario, capacidade)
       VALUES (:nome, :idioma_id, :nivel, :ano_letivo, :professor_id, :horario, :capacidade)`,
        d,
      );
      return buscarTurma(db, lastInsertRowid);
    },
    { status: 201 },
  );

  router.put('/turmas/:id', ({ params, body }) => {
    const id = parseId(params.id, 'Turma');
    const atual = buscarTurma(db, id);
    const { alunos: _a, ocupacao: _o, idioma_nome: _i, professor_nome: _p, ...base } = atual;
    const d = validar(db, { ...base, ...exigirCorpo(body) }, atual);
    db.run(
      `UPDATE turmas SET nome = :nome, idioma_id = :idioma_id, nivel = :nivel, ano_letivo = :ano_letivo,
         professor_id = :professor_id, horario = :horario, capacidade = :capacidade WHERE id = :id`,
      { ...d, id },
    );
    return buscarTurma(db, id);
  });

  router.delete('/turmas/:id', ({ params }) => {
    const id = parseId(params.id, 'Turma');
    const turma = buscarTurma(db, id);
    const c = db.get<{ matriculas: number; avaliacoes: number }>(
      `SELECT (SELECT count(*) FROM matriculas WHERE turma_id = :id) AS matriculas,
              (SELECT count(*) FROM avaliacoes WHERE turma_id = :id) AS avaliacoes`,
      { id },
    )!;
    const deps: string[] = [];
    if (c.matriculas) deps.push(`${c.matriculas} matrícula(s)`);
    if (c.avaliacoes) deps.push(`${c.avaliacoes} avaliação(ões)`);
    if (deps.length) {
      throw new HttpError(
        422,
        `Não é possível excluir a turma "${turma.nome}" porque ela possui ${deps.join(' e ')}. Cancele ou transfira as matrículas antes.`,
        deps,
      );
    }
    db.run('DELETE FROM turmas WHERE id = ?', [id]);
    return { ok: true };
  });
}
