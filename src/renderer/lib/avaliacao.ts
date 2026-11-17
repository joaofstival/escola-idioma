// Regras do editor de avaliações no cliente (espelham src/main/services/avaliacao.ts; o servidor continua sendo a palavra final, 422).
import type { Answer, EvaluationForm, Question, QuestionOption, QuestionType } from '../../shared/types.ts';

export const LIMITES = { perguntasMax: 20, opcoesMin: 2, opcoesMax: 10, linhasMax: 10, titulo: 300, rotulo: 150 } as const;

export const TIPOS: { tipo: QuestionType; rotulo: string; descricao: string }[] = [
  { tipo: 'open', rotulo: 'Resposta aberta', descricao: 'Texto curto ou longo' },
  { tipo: 'single', rotulo: 'Escolha única', descricao: 'Uma opção entre várias' },
  { tipo: 'multiple', rotulo: 'Múltipla escolha', descricao: 'Várias opções' },
  { tipo: 'rating', rotulo: 'Nota', descricao: 'Estrelas ou números' },
  { tipo: 'grid', rotulo: 'Grade', descricao: 'Vários itens na mesma escala' },
];
export const rotuloTipo = (t: QuestionType): string => TIPOS.find((x) => x.tipo === t)?.rotulo ?? t;

export const OPCOES_PRONTAS: { id: string; rotulo: string; opcoes: [string, number][] }[] = [
  {
    id: 'qualidade',
    rotulo: 'Excelente → Precisa melhorar',
    opcoes: [
      ['Excelente', 10],
      ['Bom', 7.5],
      ['Regular', 5],
      ['Precisa melhorar', 2.5],
    ],
  },
  {
    id: 'concordo',
    rotulo: 'Concordo → Discordo',
    opcoes: [
      ['Concordo totalmente', 10],
      ['Concordo', 7.5],
      ['Não concordo nem discordo', 5],
      ['Discordo', 2.5],
      ['Discordo totalmente', 0],
    ],
  },
  {
    id: 'frequencia',
    rotulo: 'Sempre → Nunca',
    opcoes: [
      ['Sempre', 10],
      ['Frequentemente', 7.5],
      ['Às vezes', 5],
      ['Raramente', 2.5],
      ['Nunca', 0],
    ],
  },
  {
    id: 'simnao',
    rotulo: 'Sim / Não',
    opcoes: [
      ['Sim', 10],
      ['Não', 0],
    ],
  },
];

export const novoId = (prefixo: string): string => `${prefixo}_${Math.random().toString(36).slice(2, 8)}`;

export function opcoesDe(pronta: (typeof OPCOES_PRONTAS)[number]): QuestionOption[] {
  return pronta.opcoes.map(([label, points]) => ({ id: novoId('o'), label, points }));
}

export function novaPergunta(tipo: QuestionType): Question {
  const base: Question = { id: novoId('q'), type: tipo, title: '', required: false };
  switch (tipo) {
    case 'open':
      return { ...base, length: 'short', maxChars: null };
    case 'single':
      return {
        ...base,
        countsInScore: false,
        askReason: false,
        reasonOn: [],
        options: [
          { id: novoId('o'), label: '', points: null },
          { id: novoId('o'), label: '', points: null },
        ],
      };
    case 'multiple':
      return {
        ...base,
        allowOther: false,
        maxChoices: null,
        options: [
          { id: novoId('o'), label: '' },
          { id: novoId('o'), label: '' },
        ],
      };
    case 'rating':
      return { ...base, countsInScore: false, askReason: false, reasonOnMax: null, scale: { style: 'stars', min: 1, max: 5 } };
    case 'grid':
      return {
        ...base,
        countsInScore: false,
        options: opcoesDe(OPCOES_PRONTAS[0]),
        rows: [
          { id: novoId('r'), label: '' },
          { id: novoId('r'), label: '' },
        ],
      };
  }
}

export function mover<T>(lista: T[], de: number, para: number): T[] {
  if (para < 0 || para >= lista.length || de === para) return lista;
  const c = [...lista];
  const [x] = c.splice(de, 1);
  c.splice(para, 0, x);
  return c;
}

export interface ErrosForm {
  geral: string[];
  porPergunta: Record<string, string[]>;
}

/** Validação do editor antes de enviar: o que o servidor recusaria, dito perto da pergunta. */
export function validarFormulario(titulo: string, form: EvaluationForm): ErrosForm {
  const geral: string[] = [];
  const porPergunta: Record<string, string[]> = {};
  if (!titulo.trim()) geral.push('Dê um título à avaliação.');
  if (form.questions.length === 0) geral.push('Adicione pelo menos uma pergunta.');
  if (form.questions.length > LIMITES.perguntasMax) geral.push(`No máximo ${LIMITES.perguntasMax} perguntas.`);
  if (form.questions.length > 0 && !form.questions.some((q) => q.required)) geral.push('Marque pelo menos uma pergunta como obrigatória.');
  for (const q of form.questions) {
    const e: string[] = [];
    if (!q.title.trim()) e.push('Escreva o enunciado da pergunta.');
    if (q.options) {
      if (q.options.length < LIMITES.opcoesMin) e.push(`Use pelo menos ${LIMITES.opcoesMin} opções.`);
      if (q.options.some((o) => !o.label.trim())) e.push('Preencha o texto de todas as opções.');
      if (q.countsInScore && q.options.some((o) => o.points === null || o.points === undefined))
        e.push('Informe os pontos (0 a 10) de cada opção, pois a pergunta conta na nota.');
    }
    if (q.type === 'grid') {
      if (!q.rows?.length) e.push('Adicione pelo menos um item à grade.');
      else if (q.rows.some((r) => !r.label.trim())) e.push('Preencha o texto de todos os itens da grade.');
    }
    if (e.length) porPergunta[q.id] = e;
  }
  return { geral, porPergunta };
}

export const temErros = (e: ErrosForm): boolean => e.geral.length > 0 || Object.keys(e.porPergunta).length > 0;

/** Pergunta de porquê: só aparece depois da resposta que o pede (mesma regra do servidor). */
export function pedePorque(q: Question, valor: string | number | null | undefined): boolean {
  if (!q.askReason || valor === null || valor === undefined || valor === '') return false;
  if (q.type === 'single') return !q.reasonOn?.length || q.reasonOn.includes(String(valor));
  if (q.type === 'rating') return q.reasonOnMax === null || q.reasonOnMax === undefined || Number(valor) <= q.reasonOnMax;
  return false;
}

/** Estado local de preenchimento por pergunta. */
export interface Preenchimento {
  texto?: string;
  opcao?: string;
  opcoes?: string[];
  nota?: number;
  porque?: string;
  linhas?: Record<string, string>;
}

export function montarRespostas(form: EvaluationForm, p: Record<string, Preenchimento>): Answer[] {
  const out: Answer[] = [];
  for (const q of form.questions) {
    const v = p[q.id] ?? {};
    switch (q.type) {
      case 'open':
        if (v.texto?.trim()) out.push({ question_id: q.id, value_text: v.texto.trim() });
        break;
      case 'single':
        if (v.opcao) out.push({ question_id: q.id, option_id: v.opcao, reason: pedePorque(q, v.opcao) ? v.porque?.trim() || null : null });
        break;
      case 'multiple':
        if (v.opcoes?.length)
          out.push({ question_id: q.id, option_ids: v.opcoes, value_text: v.opcoes.includes('other') ? (v.texto?.trim() ?? '') : null });
        break;
      case 'rating':
        if (v.nota !== undefined)
          out.push({ question_id: q.id, value_number: v.nota, reason: pedePorque(q, v.nota) ? v.porque?.trim() || null : null });
        break;
      case 'grid':
        for (const [row, op] of Object.entries(v.linhas ?? {})) if (op) out.push({ question_id: q.id, row_id: row, option_id: op });
        break;
    }
  }
  return out;
}

/** Erros de preenchimento (obrigatórias, porquê, limite de escolhas) antes de enviar. */
export function validarPreenchimento(form: EvaluationForm, p: Record<string, Preenchimento>): Record<string, string> {
  const erros: Record<string, string> = {};
  for (const q of form.questions) {
    const v = p[q.id] ?? {};
    const obrig = q.required;
    switch (q.type) {
      case 'open':
        if (obrig && !v.texto?.trim()) erros[q.id] = 'Responda esta pergunta.';
        break;
      case 'single':
        if (!v.opcao) {
          if (obrig) erros[q.id] = 'Escolha uma opção.';
        } else if (obrig && pedePorque(q, v.opcao) && !v.porque?.trim()) erros[q.id] = 'Conte o porquê da resposta.';
        break;
      case 'multiple':
        if (!v.opcoes?.length) {
          if (obrig) erros[q.id] = 'Escolha pelo menos uma opção.';
        } else if (q.maxChoices && v.opcoes.length > q.maxChoices) erros[q.id] = `Escolha no máximo ${q.maxChoices}.`;
        else if (v.opcoes.includes('other') && !v.texto?.trim()) erros[q.id] = 'Descreva a opção “Outro”.';
        break;
      case 'rating':
        if (v.nota === undefined) {
          if (obrig) erros[q.id] = 'Dê uma nota.';
        } else if (obrig && pedePorque(q, v.nota) && !v.porque?.trim()) erros[q.id] = 'Conte o porquê da nota.';
        break;
      case 'grid': {
        const faltam = (q.rows ?? []).filter((r) => !v.linhas?.[r.id]);
        if (obrig && faltam.length) erros[q.id] = `Responda todos os itens (faltam: ${faltam.map((r) => r.label).join(', ')}).`;
        break;
      }
    }
  }
  return erros;
}
