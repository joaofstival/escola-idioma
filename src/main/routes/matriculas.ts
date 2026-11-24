// Matrículas e rematrículas anuais. Ao matricular, gera as mensalidades do mês da matrícula até dezembro
// com o valor fixo do idioma (services/financeiro.ts). Regras: aluno ativo, capacidade da turma, ano igual ao
// da turma, uma matrícula ativa por aluno/idioma/ano; rematrícula bloqueada para inadimplentes (Lei 9.870/99, art. 5º).
import type { Db } from '../db.ts';
import type { Router } from '../router.ts';
import { HttpError, ValidationError } from '../router.ts';
import { Validador, encontrado, exigirCorpo, parseId, queryInt } from '../validation.ts';
import { gerarParcelas, hoje } from '../services/financeiro.ts';
import { NIVEL_MAX } from './turmas.ts';
import type { Matricula, MatriculaStatus, MatriculaTipo, SugestaoRematricula, Turma } from '../../shared/types.ts';

export const STATUS_MATRICULA: readonly MatriculaStatus[] = ['ativa', 'cancelada', 'concluida'];

const SELECT_MATRICULA = `
  SELECT m.id, m.aluno_id, a.nome AS aluno_nome, m.turma_id, t.nome AS turma_nome, t.idioma_id, i.nome AS idioma_nome,
         t.nivel, m.ano_letivo, m.tipo, m.status, m.data
  FROM matriculas m
  JOIN alunos a ON a.id = m.aluno_id
  JOIN turmas t ON t.id = m.turma_id
  JOIN idiomas i ON i.id = t.idioma_id`;

export function buscarMatricula(db: Db, id: number): Matricula {
  return encontrado(db.get<Matricula>(`${SELECT_MATRICULA} WHERE m.id = ?`, [id]), 'Matrícula não encontrada');
}

export interface FiltrosMatricula {
  ano?: number;
  turma_id?: number;
  aluno_id?: number;
  idioma_id?: number;
  status?: MatriculaStatus;
}

export function listarMatriculas(db: Db, f: FiltrosMatricula): Matricula[] {
  const where: string[] = [];
  const p: Record<string, string | number> = {};
  if (f.ano !== undefined) {
    where.push('m.ano_letivo = :ano');
    p.ano = f.ano;
  }
  if (f.turma_id !== undefined) {
    where.push('m.turma_id = :turma_id');
    p.turma_id = f.turma_id;
  }
  if (f.aluno_id !== undefined) {
    where.push('m.aluno_id = :aluno_id');
    p.aluno_id = f.aluno_id;
  }
  if (f.idioma_id !== undefined) {
    where.push('t.idioma_id = :idioma_id');
    p.idioma_id = f.idioma_id;
  }
  if (f.status) {
    where.push('m.status = :status');
    p.status = f.status;
  }
  return db.all<Matricula>(
    `${SELECT_MATRICULA} ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY m.ano_letivo DESC, a.nome COLLATE NOCASE, i.nome, t.nivel`,
    p,
  );
}

type TurmaInfo = Pick<Turma, 'id' | 'nome' | 'idioma_id' | 'nivel' | 'ano_letivo' | 'capacidade'> & {
  idioma_nome: string;
  ocupacao: number;
  mensalidade: number;
};

function buscarTurmaInfo(db: Db, id: number): TurmaInfo | undefined {
  return db.get<TurmaInfo>(
    `SELECT t.id, t.nome, t.idioma_id, i.nome AS idioma_nome, i.mensalidade, t.nivel, t.ano_letivo, t.capacidade,
            (SELECT count(*) FROM matriculas m WHERE m.turma_id = t.id AND m.status = 'ativa') AS ocupacao
     FROM turmas t JOIN idiomas i ON i.id = t.idioma_id WHERE t.id = ?`,
    [id],
  );
}

/** true se o aluno tem alguma mensalidade pendente com vencimento anterior a hoje. */
export function mensalidadesEmAtraso(db: Db, alunoId: number, hojeRef: string) {
  return db.all<{ id: number; competencia: string; vencimento: string; valor: number }>(
    `SELECT id, competencia, vencimento, valor FROM mensalidades
     WHERE aluno_id = ? AND status = 'pendente' AND vencimento < ? ORDER BY vencimento`,
    [alunoId, hojeRef],
  );
}

/**
 * Gera (ou reativa, se estavam canceladas) as mensalidades da matrícula: do mês da matrícula até dezembro,
 * com o valor atual do idioma. Mensalidades pagas ou pendentes já existentes são mantidas. Devolve quantas mudaram.
 */
export function gerarMensalidades(db: Db, matriculaId: number): number {
  const m = encontrado(
    db.get<{ aluno_id: number; ano_letivo: number; data: string; mensalidade: number }>(
      `SELECT m.aluno_id, m.ano_letivo, m.data, i.mensalidade FROM matriculas m
     JOIN turmas t ON t.id = m.turma_id JOIN idiomas i ON i.id = t.idioma_id WHERE m.id = ?`,
      [matriculaId],
    ),
    'Matrícula não encontrada',
  );
  let n = 0;
  db.transaction(() => {
    for (const p of gerarParcelas(
      m.ano_letivo,
      m.mensalidade,
      m.data,
      db.get<{ dia_vencimento: number; prazo_inicial: number }>(
        'SELECT dia_vencimento,prazo_inicial FROM politicas_financeiras ORDER BY id DESC LIMIT 1',
      ),
    )) {
      const ex = db.get<{ id: number; status: string }>('SELECT id, status FROM mensalidades WHERE matricula_id = ? AND competencia = ?', [
        matriculaId,
        p.competencia,
      ]);
      if (!ex) {
        db.run('INSERT INTO mensalidades (matricula_id, aluno_id, competencia, valor, vencimento) VALUES (?, ?, ?, ?, ?)', [
          matriculaId,
          m.aluno_id,
          p.competencia,
          p.valor,
          p.vencimento,
        ]);
        n++;
      } else if (ex.status === 'cancelada') {
        db.run(
          `UPDATE mensalidades SET status = 'pendente', valor = ?, vencimento = ?, data_pagamento = NULL, valor_pago = NULL,
                  forma_pagamento = NULL WHERE id = ?`,
          [p.valor, p.vencimento, ex.id],
        );
        n++;
      }
    }
  });
  return n;
}

export interface DadosMatricula {
  aluno_id?: unknown;
  turma_id?: unknown;
  ano_letivo?: unknown;
  data?: unknown;
}

/** Valida e cria a matrícula (tipo 'matricula' ou 'rematricula') e gera as mensalidades. */
export function matricular(db: Db, dados: DadosMatricula, hojeRef: string, tipo: MatriculaTipo = 'matricula'): Matricula {
  const v = new Validador(dados as Record<string, unknown>);
  const alunoId = v.inteiro('aluno_id', { obrigatorio: true, min: 1, rotulo: 'aluno' });
  const turmaId = v.inteiro('turma_id', { obrigatorio: true, min: 1, rotulo: 'turma' });
  const anoInformado = v.inteiro('ano_letivo', { min: 2000, max: 2100, rotulo: 'ano letivo' });
  const dataInformada = v.data('data', { rotulo: 'data da matrícula' });
  v.verificar();

  const aluno = db.get<{ nome: string; ativo: boolean }>('SELECT nome, ativo FROM alunos WHERE id = ?', [alunoId]);
  if (!aluno) v.erro(`Aluno ${alunoId} não existe`);
  else if (!aluno.ativo) v.erro(`O aluno ${aluno.nome} está inativo e não pode ser matriculado`);
  const turma = buscarTurmaInfo(db, turmaId!);
  if (!turma) v.erro(`Turma ${turmaId} não existe`);
  v.verificar('Não foi possível realizar a matrícula');

  const t = turma!;
  const ano = t.ano_letivo;
  const data = dataInformada ?? hojeRef;
  if (anoInformado !== null && anoInformado !== ano)
    v.erro(`O ano letivo informado (${anoInformado}) é diferente do ano da turma ${t.nome} (${ano})`);
  if (Number(data.slice(0, 4)) > ano) v.erro(`A data da matrícula (${data}) é posterior ao ano letivo ${ano}`);

  const existente = db.get<{ id: number; status: MatriculaStatus }>(
    'SELECT id, status FROM matriculas WHERE aluno_id = ? AND turma_id = ? AND ano_letivo = ?',
    [alunoId, t.id, ano],
  );
  const duplicada = db.get<{ turma_nome: string }>(
    `SELECT t.nome AS turma_nome FROM matriculas m JOIN turmas t ON t.id = m.turma_id
     WHERE m.aluno_id = ? AND m.ano_letivo = ? AND t.idioma_id = ? AND m.status = 'ativa'`,
    [alunoId, ano, t.idioma_id],
  );
  if (duplicada) v.erro(`${aluno!.nome} já tem matrícula ativa em ${t.idioma_nome} em ${ano} (turma ${duplicada.turma_nome})`);
  else if (existente?.status === 'concluida') v.erro(`${aluno!.nome} já concluiu a turma ${t.nome} em ${ano}`);
  if (!duplicada && t.ocupacao >= t.capacidade) v.erro(`A turma ${t.nome} está lotada (${t.ocupacao}/${t.capacidade} vagas ocupadas)`);
  v.verificar('Não foi possível realizar a matrícula');

  return db.transaction(() => {
    let id: number;
    if (existente) {
      // Matrícula cancelada na mesma turma/ano: reativa (o UNIQUE impede uma segunda linha).
      db.run("UPDATE matriculas SET status = 'ativa', tipo = ?, data = ? WHERE id = ?", [tipo, data, existente.id]);
      id = existente.id;
    } else {
      id = db.run('INSERT INTO matriculas (aluno_id, turma_id, ano_letivo, tipo, status, data) VALUES (?, ?, ?, ?, ?, ?)', [
        alunoId,
        t.id,
        ano,
        tipo,
        'ativa',
        data,
      ]).lastInsertRowid;
    }
    const geradas = gerarMensalidades(db, id);
    return { ...buscarMatricula(db, id), mensalidades_geradas: geradas };
  });
}

export interface DadosRematricula {
  aluno_id?: unknown;
  turma_id_destino?: unknown;
  ano_letivo?: unknown;
  data?: unknown;
}

/** Rematrícula: exige matrícula ativa/concluída no ano anterior no mesmo idioma, que passa a 'concluida'. */
export function rematricular(db: Db, dados: DadosRematricula, hojeRef: string): Matricula & { matricula_anterior_id: number } {
  const v = new Validador(dados as Record<string, unknown>);
  const alunoId = v.inteiro('aluno_id', { obrigatorio: true, min: 1, rotulo: 'aluno' });
  const turmaId = v.inteiro('turma_id_destino', { obrigatorio: true, min: 1, rotulo: 'turma de destino' });
  const anoInformado = v.inteiro('ano_letivo', { min: 2000, max: 2100, rotulo: 'ano letivo' });
  v.verificar();
  const aluno = db.get<{ nome: string }>('SELECT nome FROM alunos WHERE id = ?', [alunoId]);
  if (!aluno) v.erro(`Aluno ${alunoId} não existe`);
  const turma = buscarTurmaInfo(db, turmaId!);
  if (!turma) v.erro(`Turma ${turmaId} não existe`);
  v.verificar('Não foi possível realizar a rematrícula');

  const ano = anoInformado ?? turma!.ano_letivo;
  const atrasos = mensalidadesEmAtraso(db, alunoId!, hojeRef);
  if (atrasos.length) {
    throw new HttpError(
      422,
      `Rematrícula bloqueada: ${aluno!.nome} tem ${atrasos.length} mensalidade(s) em atraso. Regularize os pagamentos antes (Lei 9.870/99, art. 5º).`,
      atrasos.map((m) => `Competência ${m.competencia}, vencida em ${m.vencimento}`),
    );
  }
  const anterior = db.get<{ id: number; status: MatriculaStatus }>(
    `SELECT m.id, m.status FROM matriculas m JOIN turmas t ON t.id = m.turma_id
     WHERE m.aluno_id = ? AND m.ano_letivo = ? AND t.idioma_id = ? AND m.status IN ('ativa', 'concluida')
     ORDER BY m.status = 'ativa' DESC, t.nivel DESC, m.id DESC LIMIT 1`,
    [alunoId, ano - 1, turma!.idioma_id],
  );
  if (!anterior) {
    throw new ValidationError(
      [`${aluno!.nome} não tem matrícula ativa ou concluída em ${turma!.idioma_nome} em ${ano - 1}. Use a matrícula comum.`],
      'Não foi possível realizar a rematrícula',
    );
  }

  return db.transaction(() => {
    const nova = matricular(db, { aluno_id: alunoId, turma_id: turmaId, ano_letivo: ano, data: dados.data }, hojeRef, 'rematricula');
    if (anterior.status === 'ativa') db.run("UPDATE matriculas SET status = 'concluida' WHERE id = ?", [anterior.id]);
    return { ...nova, matricula_anterior_id: anterior.id };
  });
}

/** Cancela a matrícula ativa e as mensalidades pendentes com vencimento futuro (as vencidas continuam devidas). */
export function cancelarMatricula(db: Db, id: number, hojeRef: string): Matricula {
  const m = buscarMatricula(db, id);
  if (m.status !== 'ativa') throw new HttpError(422, `Só é possível cancelar uma matrícula ativa (situação atual: ${m.status})`);
  return db.transaction(() => {
    db.run("UPDATE matriculas SET status = 'cancelada' WHERE id = ?", [id]);
    const { changes } = db.run(
      "UPDATE mensalidades SET status = 'cancelada' WHERE matricula_id = ? AND status = 'pendente' AND vencimento > ?",
      [id, hojeRef],
    );
    return { ...buscarMatricula(db, id), mensalidades_canceladas: changes };
  });
}

/** Alunos ativos com matrícula ativa/concluída no ano anterior e sem matrícula no ano pedido naquele idioma. */
export function sugestoesRematricula(db: Db, ano: number, hojeRef: string): SugestaoRematricula[] {
  const linhas = db.all<{
    matricula_anterior_id: number;
    aluno_id: number;
    aluno_nome: string;
    idioma_id: number;
    idioma_nome: string;
    nivel_atual: number;
  }>(
    `SELECT m.id AS matricula_anterior_id, m.aluno_id, a.nome AS aluno_nome, t.idioma_id, i.nome AS idioma_nome, t.nivel AS nivel_atual
     FROM matriculas m
     JOIN alunos a ON a.id = m.aluno_id
     JOIN turmas t ON t.id = m.turma_id
     JOIN idiomas i ON i.id = t.idioma_id
     WHERE m.ano_letivo = :anterior AND m.status IN ('ativa', 'concluida') AND a.ativo = 1
       AND NOT EXISTS (
         SELECT 1 FROM matriculas m2 JOIN turmas t2 ON t2.id = m2.turma_id
         WHERE m2.aluno_id = m.aluno_id AND m2.ano_letivo = :ano AND t2.idioma_id = t.idioma_id AND m2.status <> 'cancelada')
     ORDER BY a.nome COLLATE NOCASE, i.nome, t.nivel DESC, m.id DESC`,
    { ano, anterior: ano - 1 },
  );

  const turmasCache = new Map<string, SugestaoRematricula['turmas_sugeridas']>();
  const vistos = new Set<string>();
  const out: SugestaoRematricula[] = [];
  for (const l of linhas) {
    const chave = `${l.aluno_id}|${l.idioma_id}`;
    if (vistos.has(chave)) continue; // fica a de maior nível
    vistos.add(chave);
    const nivel_sugerido = Math.min(l.nivel_atual + 1, NIVEL_MAX);
    const chaveTurmas = `${l.idioma_id}|${nivel_sugerido}`;
    let turmas = turmasCache.get(chaveTurmas);
    if (!turmas) {
      turmas = db.all<{ id: number; nome: string; capacidade: number; ocupacao: number }>(
        `SELECT * FROM (
           SELECT t.id, t.nome, t.capacidade,
                  (SELECT count(*) FROM matriculas m WHERE m.turma_id = t.id AND m.status = 'ativa') AS ocupacao
           FROM turmas t WHERE t.ano_letivo = ? AND t.idioma_id = ? AND t.nivel = ?)
         WHERE ocupacao < capacidade ORDER BY nome COLLATE NOCASE`,
        [ano, l.idioma_id, nivel_sugerido],
      );
      turmasCache.set(chaveTurmas, turmas);
    }
    out.push({ ...l, nivel_sugerido, turmas_sugeridas: turmas, inadimplente: mensalidadesEmAtraso(db, l.aluno_id, hojeRef).length > 0 });
  }
  return out;
}

export function register(router: Router, db: Db): void {
  router.get('/matriculas', ({ query }) => {
    const status = query.status?.trim() || undefined;
    if (status && !(STATUS_MATRICULA as readonly string[]).includes(status)) {
      throw new ValidationError([`Filtro status inválido: "${status}" (use ${STATUS_MATRICULA.join(', ')})`], 'Filtro inválido');
    }
    return listarMatriculas(db, {
      ano: queryInt(query, 'ano', { min: 2000, max: 2100 }),
      turma_id: queryInt(query, 'turma_id', { min: 1 }),
      aluno_id: queryInt(query, 'aluno_id', { min: 1 }),
      idioma_id: queryInt(query, 'idioma_id', { min: 1 }),
      status: status as MatriculaStatus | undefined,
    });
  });

  router.get('/matriculas/sugestoes-rematricula', ({ query }) => {
    const h = hoje();
    const ano = queryInt(query, 'ano', { min: 2001, max: 2100 }) ?? Number(h.slice(0, 4));
    return sugestoesRematricula(db, ano, h);
  });

  router.get('/matriculas/:id', ({ params }) => buscarMatricula(db, parseId(params.id, 'Matrícula')));

  router.post('/matriculas', ({ body }) => matricular(db, exigirCorpo(body), hoje()), { status: 201 });

  router.post('/matriculas/rematricula', ({ body }) => rematricular(db, exigirCorpo(body), hoje()), { status: 201 });

  router.put('/matriculas/:id/cancelar', ({ params }) => cancelarMatricula(db, parseId(params.id, 'Matrícula'), hoje()));
}
