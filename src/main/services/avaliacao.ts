// Avaliação configurável (PLANO.md seção 1; docs/pesquisa.md seção 5). Funções puras, sem banco:
// validação do formulário, validação das respostas (itens + nota), reconstrução das respostas, resultados e CSV.
import type {
  Answer,
  EvaluationForm,
  Question,
  QuestionOption,
  QuestionRow,
  QuestionType,
  RatingScale,
  ResultadoPergunta,
  ResultadosAvaliacao,
} from '../../shared/types.ts';

export const TIPOS_PERGUNTA: readonly QuestionType[] = ['open', 'single', 'multiple', 'rating', 'grid'];
export const LIMITES = {
  perguntasMin: 1,
  perguntasMax: 20,
  opcoesMin: 2,
  opcoesMax: 10,
  linhasMin: 1,
  linhasMax: 10,
  titulo: 300,
  descricao: 1000,
  rotulo: 150,
  id: 50,
  maxChars: 5000,
  porque: 1000,
  rotuloEscala: 50,
} as const;
/** Escalas de nota permitidas: 1–5, 1–10 e 0–10. */
export const ESCALAS: readonly (readonly [number, number])[] = [
  [1, 5],
  [1, 10],
  [0, 10],
];
/** option_id da alternativa "Outro" em perguntas de múltipla escolha com allowOther. */
export const OUTRO_ID = 'other';
export const MSG_TRAVADA = 'Avaliação travada: já possui respostas. Duplique para alterar.';

const COM_NOTA: readonly QuestionType[] = ['single', 'rating', 'grid'];
const COM_PORQUE: readonly QuestionType[] = ['single', 'rating'];
const COM_OPCOES: readonly QuestionType[] = ['single', 'multiple', 'grid'];

type Obj = Record<string, unknown>;
const ehObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const texto = (v: unknown): string => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');
const arred = (v: number, casas = 2) => Math.round((v + Number.EPSILON) * 10 ** casas) / 10 ** casas;

// ---------------------------------------------------------------- formulário

export interface ResultadoValidacaoForm {
  form: EvaluationForm;
  detalhes: string[];
}

/** Valida e normaliza o formulário (descarta campos que não se aplicam ao tipo). `detalhes` vazio = válido. */
export function validarForm(entrada: unknown): ResultadoValidacaoForm {
  const detalhes: string[] = [];
  let bruto = entrada;
  if (typeof bruto === 'string') {
    try {
      bruto = JSON.parse(bruto);
    } catch {
      return { form: { questions: [] }, detalhes: ['form não é um JSON válido'] };
    }
  }
  if (!ehObj(bruto) || !Array.isArray(bruto.questions)) {
    return { form: { questions: [] }, detalhes: ['form deve ser um objeto com a lista "questions"'] };
  }
  const lista = bruto.questions as unknown[];
  if (lista.length < LIMITES.perguntasMin) detalhes.push('O formulário deve ter pelo menos 1 pergunta');
  if (lista.length > LIMITES.perguntasMax)
    detalhes.push(`O formulário pode ter no máximo ${LIMITES.perguntasMax} perguntas (tem ${lista.length})`);

  const ids = new Set<string>();
  const questions: Question[] = [];
  lista.forEach((qb, i) => {
    const ref = `Pergunta ${i + 1}`;
    if (!ehObj(qb)) {
      detalhes.push(`${ref}: deve ser um objeto`);
      return;
    }
    const erro = (m: string) => detalhes.push(`${ref}${texto(qb.title) ? ` ("${texto(qb.title).slice(0, 40)}")` : ''}: ${m}`);

    const id = texto(qb.id);
    if (!id) erro('id é obrigatório');
    else if (id.length > LIMITES.id) erro(`id deve ter no máximo ${LIMITES.id} caracteres`);
    else if (ids.has(id)) erro(`id "${id}" repetido`);
    ids.add(id);

    const type = texto(qb.type) as QuestionType;
    if (!TIPOS_PERGUNTA.includes(type)) {
      erro(`tipo deve ser um destes: ${TIPOS_PERGUNTA.join(', ')}`);
      return;
    }
    const title = texto(qb.title);
    if (!title) erro('título é obrigatório');
    else if (title.length > LIMITES.titulo) erro(`título deve ter no máximo ${LIMITES.titulo} caracteres`);
    const description = texto(qb.description);
    if (description.length > LIMITES.descricao) erro(`descrição deve ter no máximo ${LIMITES.descricao} caracteres`);

    const q: Question = { id, type, title, required: qb.required === true };
    if (description) q.description = description;

    const countsInScore = qb.countsInScore === true;
    if (countsInScore && !COM_NOTA.includes(type)) erro('"conta na nota" só vale para escolha única, nota e grade');
    else if (COM_NOTA.includes(type)) q.countsInScore = countsInScore;
    const askReason = qb.askReason === true;
    if (askReason && !COM_PORQUE.includes(type)) erro('"pedir o porquê" só vale para escolha única e nota');
    else if (COM_PORQUE.includes(type)) q.askReason = askReason;

    if (COM_OPCOES.includes(type)) {
      q.options = validarOpcoes(qb.options, erro, type === 'multiple' ? [OUTRO_ID] : [], countsInScore);
    }

    if (type === 'open') {
      const length = qb.length === undefined || qb.length === null ? 'short' : qb.length;
      if (length !== 'short' && length !== 'long') erro('length deve ser "short" ou "long"');
      q.length = length === 'long' ? 'long' : 'short';
      q.maxChars = inteiroOpcional(qb.maxChars, 1, LIMITES.maxChars, 'limite de caracteres', erro);
    } else if (type === 'single') {
      q.reasonOn = [];
      if (askReason && qb.reasonOn !== undefined && qb.reasonOn !== null) {
        if (!Array.isArray(qb.reasonOn)) erro('reasonOn deve ser uma lista de ids de opções');
        else {
          const validos = new Set(q.options!.map((o) => o.id));
          for (const r of qb.reasonOn) {
            if (!validos.has(texto(r))) erro(`reasonOn cita a opção inexistente "${texto(r)}"`);
          }
          q.reasonOn = [...new Set(qb.reasonOn.map(texto))];
        }
      }
    } else if (type === 'multiple') {
      q.allowOther = qb.allowOther === true;
      q.maxChoices = inteiroOpcional(qb.maxChoices, 1, Math.max(1, q.options!.length), 'limite de escolhas (maxChoices)', erro);
    } else if (type === 'rating') {
      q.scale = validarEscala(qb.scale, erro);
      q.reasonOnMax = null;
      if (askReason && qb.reasonOnMax !== undefined && qb.reasonOnMax !== null) {
        q.reasonOnMax = inteiroOpcional(qb.reasonOnMax, q.scale.min, q.scale.max, 'reasonOnMax', erro);
      }
    } else if (type === 'grid') {
      q.rows = validarLinhas(qb.rows, erro);
    }
    questions.push(q);
  });

  if (lista.length && questions.length === lista.length && !questions.some((q) => q.required)) {
    detalhes.push('Pelo menos 1 pergunta deve ser obrigatória');
  }
  return { form: { questions }, detalhes };
}

function inteiroOpcional(v: unknown, min: number, max: number, nome: string, erro: (m: string) => void): number | null {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) {
    erro(`${nome} deve ser um número inteiro entre ${min} e ${max}`);
    return null;
  }
  return n;
}

function validarOpcoes(v: unknown, erro: (m: string) => void, reservados: string[], exigirPontos: boolean): QuestionOption[] {
  if (!Array.isArray(v)) {
    erro(`opções são obrigatórias (de ${LIMITES.opcoesMin} a ${LIMITES.opcoesMax})`);
    return [];
  }
  if (v.length < LIMITES.opcoesMin || v.length > LIMITES.opcoesMax)
    erro(`deve ter de ${LIMITES.opcoesMin} a ${LIMITES.opcoesMax} opções (tem ${v.length})`);
  const ids = new Set<string>();
  const out: QuestionOption[] = [];
  v.forEach((o, i) => {
    if (!ehObj(o)) {
      erro(`opção ${i + 1} inválida`);
      return;
    }
    const id = texto(o.id);
    const label = texto(o.label);
    if (!id) erro(`opção ${i + 1}: id é obrigatório`);
    else if (ids.has(id)) erro(`id de opção "${id}" repetido`);
    else if (reservados.includes(id)) erro(`id de opção "${id}" é reservado`);
    ids.add(id);
    if (!label) erro(`opção ${i + 1}: texto é obrigatório`);
    else if (label.length > LIMITES.rotulo) erro(`opção ${i + 1}: texto deve ter no máximo ${LIMITES.rotulo} caracteres`);
    let points: number | null = null;
    if (o.points !== undefined && o.points !== null && o.points !== '') {
      const n = Number(o.points);
      if (!Number.isFinite(n) || n < 0 || n > 10) erro(`opção ${i + 1}: pontos devem estar entre 0 e 10`);
      else points = n;
    }
    if (exigirPontos && points === null) erro(`opção ${i + 1}: informe os pontos (0 a 10), pois a pergunta conta na nota`);
    out.push({ id, label, points });
  });
  return out;
}

function validarLinhas(v: unknown, erro: (m: string) => void): QuestionRow[] {
  if (!Array.isArray(v)) {
    erro(`a grade precisa de linhas (de ${LIMITES.linhasMin} a ${LIMITES.linhasMax})`);
    return [];
  }
  if (v.length < LIMITES.linhasMin || v.length > LIMITES.linhasMax)
    erro(`a grade deve ter de ${LIMITES.linhasMin} a ${LIMITES.linhasMax} linhas (tem ${v.length})`);
  const ids = new Set<string>();
  return v.map((r, i) => {
    const id = ehObj(r) ? texto(r.id) : '';
    const label = ehObj(r) ? texto(r.label) : '';
    if (!id) erro(`linha ${i + 1}: id é obrigatório`);
    else if (ids.has(id)) erro(`id de linha "${id}" repetido`);
    ids.add(id);
    if (!label) erro(`linha ${i + 1}: texto é obrigatório`);
    else if (label.length > LIMITES.rotulo) erro(`linha ${i + 1}: texto deve ter no máximo ${LIMITES.rotulo} caracteres`);
    return { id, label };
  });
}

function validarEscala(v: unknown, erro: (m: string) => void): RatingScale {
  const padrao: RatingScale = { style: 'numbers', min: 1, max: 5 };
  if (!ehObj(v)) {
    erro('escala é obrigatória (1–5, 1–10 ou 0–10)');
    return padrao;
  }
  const style = v.style ?? 'numbers';
  if (style !== 'stars' && style !== 'numbers') erro('estilo da escala deve ser "stars" ou "numbers"');
  const min = Number(v.min);
  const max = Number(v.max);
  if (!ESCALAS.some(([a, b]) => a === min && b === max)) {
    erro(`escala inválida (${String(v.min)}–${String(v.max)}): use 1–5, 1–10 ou 0–10`);
    return padrao;
  }
  const s: RatingScale = { style: style === 'stars' ? 'stars' : 'numbers', min: min as 0 | 1, max: max as 5 | 10 };
  for (const k of ['minLabel', 'maxLabel'] as const) {
    const t = texto(v[k]);
    if (t.length > LIMITES.rotuloEscala) erro(`${k} deve ter no máximo ${LIMITES.rotuloEscala} caracteres`);
    if (t) s[k] = t;
  }
  return s;
}

// ---------------------------------------------------------------- respostas

/** Uma linha de avaliacao_resposta_itens. */
export interface ItemResposta {
  question_id: string;
  row_id: string | null;
  option_id: string | null;
  value_text: string | null;
  value_number: number | null;
  reason: string | null;
}

export interface ResultadoValidacaoRespostas {
  itens: ItemResposta[];
  score: number | null;
  detalhes: string[];
}

const item = (question_id: string, campos: Partial<ItemResposta>): ItemResposta => ({
  question_id,
  row_id: null,
  option_id: null,
  value_text: null,
  value_number: null,
  reason: null,
  ...campos,
});

/** Nota de uma escala normalizada para 0–10. */
export function normalizarNota(v: number, s: RatingScale): number {
  return ((v - s.min) / (s.max - s.min)) * 10;
}

/** true se a resposta pede o porquê (single: opção em reasonOn ou reasonOn vazio; rating: nota <= reasonOnMax ou sempre). */
export function pedePorque(q: Question, valor: string | number): boolean {
  if (!q.askReason) return false;
  if (q.type === 'single') return !q.reasonOn?.length || q.reasonOn.includes(String(valor));
  if (q.type === 'rating') return q.reasonOnMax === null || q.reasonOnMax === undefined || Number(valor) <= q.reasonOnMax;
  return false;
}

/**
 * Valida as respostas contra o formulário e devolve os itens a gravar (uma linha por valor) e a nota (0–10).
 * O porquê só é guardado quando pedido; é obrigatório quando pedido em pergunta obrigatória.
 */
export function validarRespostas(form: EvaluationForm, answers: unknown): ResultadoValidacaoRespostas {
  const detalhes: string[] = [];
  const itens: ItemResposta[] = [];
  const notas: number[] = [];
  if (!Array.isArray(answers)) return { itens, score: null, detalhes: ['answers deve ser uma lista de respostas'] };

  const porQuestao = new Map<string, Obj[]>();
  const qIds = new Set(form.questions.map((q) => q.id));
  answers.forEach((a, i) => {
    if (!ehObj(a) || !texto(a.question_id)) {
      detalhes.push(`Resposta ${i + 1}: question_id é obrigatório`);
      return;
    }
    const qid = texto(a.question_id);
    if (!qIds.has(qid)) {
      detalhes.push(`Resposta ${i + 1}: a pergunta "${qid}" não existe nesta avaliação`);
      return;
    }
    const l = porQuestao.get(qid) ?? [];
    l.push(a);
    porQuestao.set(qid, l);
  });

  for (const q of form.questions) {
    const lista = porQuestao.get(q.id) ?? [];
    const erro = (m: string) => detalhes.push(`"${q.title}": ${m}`);
    const faltou = () => {
      if (q.required) erro('resposta obrigatória');
    };
    if (q.type !== 'grid' && lista.length > 1) {
      erro('respondida mais de uma vez');
      continue;
    }
    const a: Obj = lista[0] ?? {};
    const lerPorque = (valor: string | number): string | null => {
      if (!pedePorque(q, valor)) return null;
      const r = texto(a.reason);
      if (!r && q.required) erro('informe o porquê da resposta');
      if (r.length > LIMITES.porque) erro(`o porquê deve ter no máximo ${LIMITES.porque} caracteres`);
      return r || null;
    };

    switch (q.type) {
      case 'open': {
        const t = texto(a.value_text);
        if (!t) {
          faltou();
          break;
        }
        const max = q.maxChars ?? LIMITES.maxChars;
        if (t.length > max) {
          erro(`texto deve ter no máximo ${max} caracteres (tem ${t.length})`);
          break;
        }
        itens.push(item(q.id, { value_text: t }));
        break;
      }
      case 'single': {
        const op = texto(a.option_id);
        if (!op) {
          faltou();
          break;
        }
        const opcao = q.options!.find((o) => o.id === op);
        if (!opcao) {
          erro(`opção "${op}" não existe`);
          break;
        }
        itens.push(item(q.id, { option_id: op, reason: lerPorque(op) }));
        if (q.countsInScore && typeof opcao.points === 'number') notas.push(opcao.points);
        break;
      }
      case 'multiple': {
        const bruto = Array.isArray(a.option_ids) ? a.option_ids : texto(a.option_id) ? [a.option_id] : [];
        const escolhidas = [...new Set(bruto.map(texto).filter(Boolean))];
        if (bruto.length !== escolhidas.length) erro('opção repetida ou vazia');
        if (!escolhidas.length) {
          faltou();
          break;
        }
        let ok = true;
        for (const op of escolhidas) {
          if (op === OUTRO_ID) {
            if (!q.allowOther) {
              erro('esta pergunta não aceita "Outro"');
              ok = false;
            } else if (!texto(a.value_text)) {
              erro('descreva a opção "Outro"');
              ok = false;
            } else if (texto(a.value_text).length > LIMITES.rotulo) {
              erro(`"Outro" deve ter no máximo ${LIMITES.rotulo} caracteres`);
              ok = false;
            }
          } else if (!q.options!.some((o) => o.id === op)) {
            erro(`opção "${op}" não existe`);
            ok = false;
          }
        }
        if (q.maxChoices && escolhidas.length > q.maxChoices) {
          erro(`escolha no máximo ${q.maxChoices} opção(ões)`);
          ok = false;
        }
        if (!ok) break;
        for (const op of escolhidas) itens.push(item(q.id, { option_id: op, value_text: op === OUTRO_ID ? texto(a.value_text) : null }));
        break;
      }
      case 'rating': {
        const s = q.scale!;
        if (a.value_number === undefined || a.value_number === null || a.value_number === '') {
          faltou();
          break;
        }
        const v = Number(a.value_number);
        if (!Number.isInteger(v) || v < s.min || v > s.max) {
          erro(`nota deve ser um número inteiro de ${s.min} a ${s.max}`);
          break;
        }
        itens.push(item(q.id, { value_number: v, reason: lerPorque(v) }));
        if (q.countsInScore) notas.push(normalizarNota(v, s));
        break;
      }
      case 'grid': {
        const vistas = new Set<string>();
        const pontos: number[] = [];
        for (const r of lista) {
          const row = texto(r.row_id);
          const op = texto(r.option_id);
          const linha = q.rows!.find((x) => x.id === row);
          if (!linha) {
            erro(`linha "${row}" não existe`);
            continue;
          }
          if (vistas.has(row)) {
            erro(`linha "${linha.label}" respondida mais de uma vez`);
            continue;
          }
          if (!op) continue;
          const opcao = q.options!.find((o) => o.id === op);
          if (!opcao) {
            erro(`opção "${op}" não existe (linha "${linha.label}")`);
            continue;
          }
          vistas.add(row);
          itens.push(item(q.id, { row_id: row, option_id: op }));
          if (typeof opcao.points === 'number') pontos.push(opcao.points);
        }
        if (q.required) {
          const faltam = q.rows!.filter((r) => !vistas.has(r.id));
          if (faltam.length) erro(`responda todas as linhas (faltam: ${faltam.map((r) => r.label).join(', ')})`);
        }
        if (q.countsInScore && pontos.length) notas.push(pontos.reduce((x, y) => x + y, 0) / pontos.length);
        break;
      }
    }
  }
  const score = notas.length ? arred(notas.reduce((x, y) => x + y, 0) / notas.length) : null;
  return { itens, score, detalhes };
}

/** Reconstrói as respostas (formato Answer) a partir dos itens gravados, na ordem do formulário. */
export function montarAnswers(form: EvaluationForm, itens: ItemResposta[]): Answer[] {
  const out: Answer[] = [];
  for (const q of form.questions) {
    const meus = itens.filter((i) => i.question_id === q.id);
    if (!meus.length) continue;
    if (q.type === 'grid') {
      for (const i of meus) out.push({ question_id: q.id, row_id: i.row_id, option_id: i.option_id });
    } else if (q.type === 'multiple') {
      const outro = meus.find((i) => i.option_id === OUTRO_ID);
      out.push({ question_id: q.id, option_ids: meus.map((i) => i.option_id!), value_text: outro?.value_text ?? null });
    } else if (q.type === 'single') {
      out.push({ question_id: q.id, option_id: meus[0].option_id, reason: meus[0].reason });
    } else if (q.type === 'rating') {
      out.push({ question_id: q.id, value_number: meus[0].value_number, reason: meus[0].reason });
    } else {
      out.push({ question_id: q.id, value_text: meus[0].value_text });
    }
  }
  return out;
}

// ---------------------------------------------------------------- resultados

export interface RespostaComItens {
  aluno_nome: string;
  criado_em: string;
  score: number | null;
  itens: ItemResposta[];
}

const pct = (n: number, total: number) => (total ? arred((n / total) * 100, 1) : 0);
const media = (v: number[]) => (v.length ? arred(v.reduce((a, b) => a + b, 0) / v.length) : null);

export function calcularResultados(avaliacaoId: number, form: EvaluationForm, respostas: RespostaComItens[]): ResultadosAvaliacao {
  const perguntas: ResultadoPergunta[] = form.questions.map((q) => {
    const porAluno = respostas
      .map((r) => ({ aluno_nome: r.aluno_nome, itens: r.itens.filter((i) => i.question_id === q.id) }))
      .filter((r) => r.itens.length);
    const todos = porAluno.flatMap((r) => r.itens);
    const res: ResultadoPergunta = {
      question_id: q.id,
      type: q.type,
      title: q.title,
      respostas: porAluno.length,
      com_porque: porAluno.filter((r) => r.itens.some((i) => i.reason)).length,
    };
    const contar = (lista: ItemResposta[], total: number, extras: QuestionOption[] = []) =>
      [...q.options!, ...extras].map((o) => {
        const count = lista.filter((i) => i.option_id === o.id).length;
        return { option_id: o.id, label: o.label, count, percent: pct(count, total) };
      });
    const porques = porAluno.flatMap((r) => r.itens.filter((i) => i.reason).map((i) => ({ aluno_nome: r.aluno_nome, texto: i.reason! })));

    if (q.type === 'open') {
      res.textos = porAluno.map((r) => ({ aluno_nome: r.aluno_nome, texto: r.itens[0].value_text ?? '' }));
    } else if (q.type === 'single') {
      res.opcoes = contar(todos, porAluno.length);
      if (q.countsInScore)
        res.media = media(
          todos.map((i) => q.options!.find((o) => o.id === i.option_id)?.points).filter((p): p is number => typeof p === 'number'),
        );
      res.textos = porques;
    } else if (q.type === 'multiple') {
      res.opcoes = contar(todos, porAluno.length, q.allowOther ? [{ id: OUTRO_ID, label: 'Outro' }] : []);
      res.textos = porAluno.flatMap((r) =>
        r.itens.filter((i) => i.option_id === OUTRO_ID && i.value_text).map((i) => ({ aluno_nome: r.aluno_nome, texto: i.value_text! })),
      );
    } else if (q.type === 'rating') {
      const valores = todos.map((i) => i.value_number!).filter((v) => typeof v === 'number');
      res.media = media(valores);
      res.distribuicao = [];
      for (let v = q.scale!.min; v <= q.scale!.max; v++) res.distribuicao.push({ valor: v, count: valores.filter((x) => x === v).length });
      res.textos = porques;
    } else if (q.type === 'grid') {
      const pontosDe = (op: string | null) => q.options!.find((o) => o.id === op)?.points;
      const temPontos = q.options!.every((o) => typeof o.points === 'number');
      res.linhas = q.rows!.map((row) => {
        const daLinha = todos.filter((i) => i.row_id === row.id);
        return {
          row_id: row.id,
          label: row.label,
          opcoes: contar(daLinha, daLinha.length),
          media: temPontos ? media(daLinha.map((i) => pontosDe(i.option_id) as number)) : null,
        };
      });
      res.media = temPontos ? media(todos.map((i) => pontosDe(i.option_id) as number)) : null;
    }
    return res;
  });
  return {
    avaliacao_id: avaliacaoId,
    total_respostas: respostas.length,
    nota_media: media(respostas.map((r) => r.score).filter((s): s is number => typeof s === 'number')),
    perguntas,
  };
}

// ---------------------------------------------------------------- CSV

/** Escapa uma célula de CSV (separador ;). Textos que começam com = + - @ ganham ' para não virarem fórmula. */
export function celulaCsv(v: unknown): string {
  if (v === null || v === undefined) return '';
  let s = typeof v === 'number' ? String(v).replace('.', ',') : String(v);
  if (typeof v !== 'number' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function dataBr(v: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/.exec(v);
  return m ? `${m[3]}/${m[2]}/${m[1]}${m[4] ? ` ${m[4]}:${m[5]}` : ''}` : v;
}

/** Uma linha por aluno; uma coluna por pergunta (na grade, uma por linha) e uma "(porquê)" para quem tem askReason. */
export function gerarCsv(form: EvaluationForm, respostas: RespostaComItens[]): string {
  const cab = ['Aluno', 'Data', 'Nota'];
  type Col = (itens: ItemResposta[]) => unknown;
  const cols: Col[] = [];
  const rotulo = (q: Question, id: string | null) => (id === OUTRO_ID ? 'Outro' : (q.options?.find((o) => o.id === id)?.label ?? id ?? ''));
  for (const q of form.questions) {
    const meus = (itens: ItemResposta[]) => itens.filter((i) => i.question_id === q.id);
    if (q.type === 'grid') {
      for (const row of q.rows!) {
        cab.push(`${q.title} - ${row.label}`);
        cols.push((itens) => {
          const i = meus(itens).find((x) => x.row_id === row.id);
          return i ? rotulo(q, i.option_id) : null;
        });
      }
      continue;
    }
    cab.push(q.title);
    if (q.type === 'open') cols.push((itens) => meus(itens)[0]?.value_text ?? null);
    else if (q.type === 'rating') cols.push((itens) => meus(itens)[0]?.value_number ?? null);
    else if (q.type === 'single')
      cols.push((itens) => {
        const i = meus(itens)[0];
        return i ? rotulo(q, i.option_id) : null;
      });
    else
      cols.push(
        (itens) =>
          meus(itens)
            .map((i) => (i.option_id === OUTRO_ID ? `Outro: ${i.value_text ?? ''}` : rotulo(q, i.option_id)))
            .join(', ') || null,
      );
    if (q.askReason) {
      cab.push(`${q.title} (porquê)`);
      cols.push((itens) => meus(itens)[0]?.reason ?? null);
    }
  }
  const linhas = [cab.map(celulaCsv).join(';')];
  for (const r of respostas) {
    linhas.push([r.aluno_nome, dataBr(r.criado_em), r.score, ...cols.map((c) => c(r.itens))].map(celulaCsv).join(';'));
  }
  return linhas.join('\r\n') + '\r\n';
}

/** Nome de arquivo seguro: "avaliacao-12-avaliacao-de-nivel.csv". */
export function nomeArquivoCsv(id: number, titulo: string): string {
  const slug = titulo
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
  return `avaliacao-${id}${slug ? '-' + slug : ''}.csv`;
}
