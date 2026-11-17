// Modelos prontos de avaliação (GET /avaliacoes/modelos) e conjuntos de opções prontos do editor.
import type { ModeloAvaliacao, QuestionOption } from '../../shared/types.ts';

/** Opções prontas (PLANO seção 1). Pontos 0–10 para poderem contar na nota. */
export const OPCOES_PRONTAS: Record<string, QuestionOption[]> = {
  excelente: [
    { id: 'excelente', label: 'Excelente', points: 10 },
    { id: 'bom', label: 'Bom', points: 7.5 },
    { id: 'regular', label: 'Regular', points: 5 },
    { id: 'precisa_melhorar', label: 'Precisa melhorar', points: 2.5 },
  ],
  concordo: [
    { id: 'concordo_totalmente', label: 'Concordo totalmente', points: 10 },
    { id: 'concordo', label: 'Concordo', points: 7.5 },
    { id: 'neutro', label: 'Não concordo nem discordo', points: 5 },
    { id: 'discordo', label: 'Discordo', points: 2.5 },
    { id: 'discordo_totalmente', label: 'Discordo totalmente', points: 0 },
  ],
  frequencia: [
    { id: 'sempre', label: 'Sempre', points: 10 },
    { id: 'frequentemente', label: 'Frequentemente', points: 7.5 },
    { id: 'as_vezes', label: 'Às vezes', points: 5 },
    { id: 'raramente', label: 'Raramente', points: 2.5 },
    { id: 'nunca', label: 'Nunca', points: 0 },
  ],
  simnao: [
    { id: 'sim', label: 'Sim', points: 10 },
    { id: 'nao', label: 'Não', points: 0 },
  ],
};

const copia = (k: keyof typeof OPCOES_PRONTAS) => OPCOES_PRONTAS[k].map((o) => ({ ...o }));

export const COMPETENCIAS = [
  { id: 'compreensao_oral', label: 'Compreensão oral' },
  { id: 'expressao_oral', label: 'Expressão oral' },
  { id: 'leitura', label: 'Leitura' },
  { id: 'escrita', label: 'Escrita' },
  { id: 'gramatica', label: 'Gramática' },
  { id: 'vocabulario', label: 'Vocabulário' },
];

export const MODELOS_AVALIACAO: ModeloAvaliacao[] = [
  {
    id: 'padrao',
    nome: 'Padrão (nota + comentário)',
    descricao: 'O formulário antigo: uma nota de 1 a 10 e um comentário livre.',
    form: {
      questions: [
        {
          id: 'nota',
          type: 'rating',
          title: 'Nota geral',
          required: true,
          countsInScore: true,
          askReason: false,
          reasonOnMax: null,
          scale: { style: 'numbers', min: 1, max: 10, minLabel: 'Muito ruim', maxLabel: 'Excelente' },
        },
        { id: 'comentario', type: 'open', title: 'Comentários', required: false, length: 'long', maxChars: 1000 },
      ],
    },
  },
  {
    id: 'nivel',
    nome: 'Avaliação de nível do aluno',
    descricao: 'O professor avalia cada competência do aluno e recomenda o próximo nível.',
    form: {
      questions: [
        {
          id: 'competencias',
          type: 'grid',
          title: 'Desempenho por competência',
          required: true,
          countsInScore: true,
          options: copia('excelente'),
          rows: COMPETENCIAS.map((c) => ({ ...c })),
        },
        {
          id: 'recomendacao',
          type: 'single',
          title: 'Recomendação para o próximo ano',
          required: true,
          countsInScore: false,
          askReason: true,
          reasonOn: ['repetir'],
          options: [
            { id: 'avancar', label: 'Avançar para o próximo nível', points: null },
            { id: 'repetir', label: 'Repetir o nível atual', points: null },
            { id: 'pular', label: 'Avançar dois níveis', points: null },
          ],
        },
        { id: 'observacoes', type: 'open', title: 'Observações do professor', required: false, length: 'long', maxChars: 2000 },
      ],
    },
  },
  {
    id: 'feedback',
    nome: 'Feedback do aluno sobre a turma',
    descricao: 'O aluno avalia as aulas, o ritmo, o professor e o material.',
    form: {
      questions: [
        {
          id: 'aulas',
          type: 'rating',
          title: 'Como você avalia as aulas?',
          required: true,
          countsInScore: true,
          askReason: true,
          reasonOnMax: 2,
          scale: { style: 'stars', min: 1, max: 5, minLabel: 'Ruins', maxLabel: 'Ótimas' },
        },
        {
          id: 'ritmo',
          type: 'single',
          title: 'O ritmo das aulas está…',
          required: true,
          countsInScore: false,
          askReason: false,
          reasonOn: [],
          options: [
            { id: 'lento', label: 'Lento', points: null },
            { id: 'adequado', label: 'Adequado', points: null },
            { id: 'rapido', label: 'Rápido', points: null },
          ],
        },
        {
          id: 'afirmacoes',
          type: 'grid',
          title: 'Quanto você concorda com as afirmações?',
          required: true,
          countsInScore: true,
          options: copia('concordo'),
          rows: [
            { id: 'clareza', label: 'O professor explica com clareza' },
            { id: 'material', label: 'O material didático ajuda no aprendizado' },
            { id: 'pratica', label: 'Tenho oportunidade de praticar a conversação' },
            { id: 'horario', label: 'O horário da turma é conveniente' },
          ],
        },
        {
          id: 'praticar',
          type: 'multiple',
          title: 'O que você gostaria de praticar mais?',
          required: false,
          maxChoices: 3,
          allowOther: true,
          options: [
            { id: 'conversacao', label: 'Conversação', points: null },
            { id: 'gramatica', label: 'Gramática', points: null },
            { id: 'leitura', label: 'Leitura', points: null },
            { id: 'escrita', label: 'Escrita', points: null },
            { id: 'vocabulario', label: 'Vocabulário', points: null },
            { id: 'pronuncia', label: 'Pronúncia', points: null },
          ],
        },
        { id: 'sugestoes', type: 'open', title: 'Sugestões', required: false, length: 'long', maxChars: 1000 },
      ],
    },
  },
  {
    id: 'autoavaliacao',
    nome: 'Autoavaliação',
    descricao: 'O aluno reflete sobre a própria dedicação e evolução.',
    form: {
      questions: [
        {
          id: 'habitos',
          type: 'grid',
          title: 'Com que frequência você…',
          required: true,
          countsInScore: true,
          options: copia('frequencia'),
          rows: [
            { id: 'tarefas', label: 'Faz as tarefas de casa' },
            { id: 'fora', label: 'Pratica o idioma fora da aula' },
            { id: 'participa', label: 'Participa das atividades em sala' },
          ],
        },
        {
          id: 'evolucao',
          type: 'rating',
          title: 'Quanto você acha que evoluiu neste período?',
          required: true,
          countsInScore: true,
          askReason: false,
          reasonOnMax: null,
          scale: { style: 'numbers', min: 0, max: 10, minLabel: 'Nada', maxLabel: 'Muito' },
        },
        {
          id: 'continuar',
          type: 'single',
          title: 'Pretende continuar no próximo ano?',
          required: true,
          countsInScore: false,
          askReason: true,
          reasonOn: ['nao'],
          options: copia('simnao'),
        },
        {
          id: 'objetivo',
          type: 'open',
          title: 'Qual é o seu principal objetivo com o idioma?',
          required: false,
          length: 'short',
          maxChars: 300,
        },
      ],
    },
  },
];
