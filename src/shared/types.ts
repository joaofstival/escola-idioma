// Contrato compartilhado entre o processo principal (dados/serviços) e o renderer (telas).
// Só tipos: nada aqui gera código em tempo de execução.

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

/** Pedido enviado do renderer ao main via IPC (canal 'api:request'). Mesma semântica de uma API REST. */
export interface ApiRequest {
  method: HttpMethod;
  path: string; // ex.: '/alunos/5/historico?x=1' (sem prefixo /api)
  body?: unknown;
}

/** Resposta do main. status segue HTTP: 200/201 ok, 404 não encontrado, 422 validação, 500 erro, 502 serviço externo. */
export type ApiResponse<T = unknown> =
  { ok: true; status: number; data: T } | { ok: false; status: number; erro: string; detalhes?: string[] };

/** API exposta pelo preload em window.escola */
export interface EscolaBridge {
  request<T = unknown>(req: ApiRequest): Promise<ApiResponse<T>>;
  /** Abre diálogo "Salvar como" e grava o conteúdo. Retorna o caminho ou null se cancelado. */
  saveFile(defaultName: string, content: string): Promise<string | null>;
  /** Backup: "Salvar como" nativo e cópia consistente do banco. */
  exportarBackup(): Promise<ResultadoBackupIpc>;
  /** Backup: escolhe um arquivo .db, valida, pede confirmação nativa e reabre o app com os dados restaurados. */
  restaurarBackup(): Promise<ResultadoBackupIpc>;
}

/** Backup guardado em userData/backups (GET/POST /backups). `tipo`: automático diário ou manual. */
export interface BackupInfo {
  nome: string;
  tamanho: number;
  criadoEm: string;
  tipo: 'auto' | 'manual';
}

/** Resultado de exportarBackup/restaurarBackup. `cancelado` = o usuário fechou o diálogo (não é erro). */
export type ResultadoBackupIpc = { ok: true; arquivo: string } | { ok: false; cancelado: boolean; erro?: string };

// ---------- Entidades ----------
export interface Idioma {
  id: number;
  nome: string;
  codigo: string;
  mensalidade: number;
}

export interface Aluno {
  id: number;
  nome: string;
  data_nascimento: string | null;
  documento: string | null;
  email: string | null;
  telefone: string | null;
  endereco: string | null;
  pais_origem: string | null;
  moeda_origem: string;
  ativo: boolean;
  criado_em: string;
}

export interface Professor {
  id: number;
  nome: string;
  email: string | null;
  telefone: string | null;
  ativo: boolean;
  idiomas: Pick<Idioma, 'id' | 'nome'>[];
}

export interface Turma {
  id: number;
  nome: string;
  idioma_id: number;
  idioma_nome?: string;
  nivel: number;
  ano_letivo: number;
  professor_id: number | null;
  professor_nome?: string | null;
  horario: string | null;
  capacidade: number;
  ocupacao?: number;
  alunos?: Pick<Aluno, 'id' | 'nome'>[];
}

export type MatriculaTipo = 'matricula' | 'rematricula';
export type MatriculaStatus = 'ativa' | 'cancelada' | 'concluida';
export interface Matricula {
  id: number;
  aluno_id: number;
  aluno_nome?: string;
  turma_id: number;
  turma_nome?: string;
  idioma_nome?: string;
  nivel?: number;
  ano_letivo: number;
  tipo: MatriculaTipo;
  status: MatriculaStatus;
  data: string;
  /** Adições da parte 3 (opcionais): idioma da turma; contagens devolvidas ao criar/cancelar. */
  idioma_id?: number;
  mensalidades_geradas?: number;
  mensalidades_canceladas?: number;
}

export interface SugestaoRematricula {
  aluno_id: number;
  aluno_nome: string;
  matricula_anterior_id: number;
  idioma_id: number;
  idioma_nome: string;
  nivel_atual: number;
  nivel_sugerido: number;
  turmas_sugeridas: Pick<Turma, 'id' | 'nome' | 'capacidade' | 'ocupacao'>[];
  /** Parte 3: true se o aluno tem mensalidade em atraso (a rematrícula será recusada com 422). */
  inadimplente?: boolean;
}

export type MaterialTipo = 'livro' | 'apostila' | 'audio' | 'video' | 'link' | 'outro';
export interface Material {
  id: number;
  titulo: string;
  tipo: MaterialTipo;
  idioma_id: number;
  idioma_nome?: string;
  nivel: number;
  autor: string | null;
  referencia: string | null;
  descricao: string | null;
}

export type MensalidadeStatus = 'pendente' | 'paga' | 'cancelada';
export interface Mensalidade {
  id: number;
  matricula_id: number;
  aluno_id: number;
  aluno_nome?: string;
  idioma_nome?: string;
  turma_nome?: string;
  competencia: string;
  valor: number;
  vencimento: string;
  status: MensalidadeStatus;
  atrasada: boolean;
  dias_atraso: number;
  multa: number;
  juros: number;
  valor_atualizado: number;
  data_pagamento: string | null;
  valor_pago: number | null;
  forma_pagamento: string | null;
}

/** Item de GET /financeiro/inadimplentes (parte 3). Valores em BRL; total = soma dos valores originais. */
export interface Inadimplente {
  aluno_id: number;
  aluno_nome: string;
  email: string | null;
  telefone: string | null;
  qtd: number;
  total: number;
  total_atualizado: number;
  vencimento_mais_antigo: string;
  dias_max_atraso: number;
  acima_90_dias: boolean;
}

export interface HistoricoAluno {
  aluno: Aluno;
  matriculas: Matricula[];
  mensalidades: Mensalidade[];
  resumo: { pago: number; pendente: number; atrasado: number };
}

export interface ResumoFinanceiro {
  ano: number;
  recebido: number;
  a_receber: number;
  em_atraso: number;
  alunos_inadimplentes: { aluno_id: number; aluno_nome: string; qtd: number; total: number }[];
  por_mes: { competencia: string; previsto: number; recebido: number }[];
}

export interface Dashboard {
  alunos_ativos: number;
  professores_ativos: number;
  turmas_ano: number;
  matriculas_ano: number;
  receita_mes: number;
  a_receber_mes: number;
  inadimplentes: number;
  ano: number;
}

export interface Cotacao {
  moeda: string;
  nome?: string;
  valor_em_brl: number;
  brl_em_moeda: number;
  atualizado_em: string;
  /** Adições da parte 4 (opcionais): variação do dia em % (só AwesomeAPI), fonte da cotação e se veio de cache vencido. */
  variacao_pct?: number | null;
  fonte?: string;
  desatualizada?: boolean;
}
export interface CotacaoResposta {
  base: 'BRL';
  fonte: string;
  data: string;
  cotacoes: Record<string, Cotacao>;
  /** Parte 4: true se alguma cotação veio do cache vencido (até 72 h); moedas inexistentes; moedas sem cotação no momento. */
  desatualizada?: boolean;
  invalidas?: string[];
  indisponiveis?: string[];
}
export interface Conversao {
  valor: number;
  de: string;
  para: string;
  resultado: number;
  taxa: number;
  fonte: string;
  data: string;
  desatualizada?: boolean;
}
export interface Traducao {
  texto: string;
  traducao: string;
  de: string;
  para: string;
  fonte: string;
  alternativas?: string[];
}

// ---------- Avaliação configurável (ver PLANO.md, seção 1) ----------
export type QuestionType = 'open' | 'single' | 'multiple' | 'rating' | 'grid';
export interface QuestionOption {
  id: string;
  label: string;
  points?: number | null;
}
export interface QuestionRow {
  id: string;
  label: string;
}
export interface RatingScale {
  style: 'stars' | 'numbers';
  min: 0 | 1;
  max: 5 | 10;
  minLabel?: string;
  maxLabel?: string;
}

export interface Question {
  id: string;
  type: QuestionType;
  title: string;
  description?: string;
  required: boolean;
  countsInScore?: boolean; // single | rating | grid
  askReason?: boolean; // single | rating
  reasonOn?: string[]; // single: ids das opções que pedem o porquê (vazio = sempre)
  reasonOnMax?: number | null; // rating: pede o porquê quando nota <= este valor (null = sempre)
  length?: 'short' | 'long'; // open
  maxChars?: number | null; // open
  options?: QuestionOption[]; // single | multiple | grid (escala da grade)
  allowOther?: boolean; // multiple
  maxChoices?: number | null; // multiple
  scale?: RatingScale; // rating
  rows?: QuestionRow[]; // grid
}
export interface EvaluationForm {
  questions: Question[];
}

export interface Avaliacao {
  id: number;
  turma_id: number;
  turma_nome?: string;
  titulo: string;
  descricao: string | null;
  form: EvaluationForm;
  criado_em: string;
  total_respostas: number;
  travada: boolean;
}
export interface ModeloAvaliacao {
  id: string;
  nome: string;
  descricao: string;
  form: EvaluationForm;
}

export interface Answer {
  question_id: string;
  row_id?: string | null;
  option_id?: string | null;
  option_ids?: string[];
  value_text?: string | null;
  value_number?: number | null;
  reason?: string | null;
}
export interface RespostaAvaliacao {
  id: number;
  avaliacao_id: number;
  aluno_id: number;
  aluno_nome?: string;
  score: number | null;
  criado_em: string;
  answers: Answer[];
}

export interface ResultadoPergunta {
  question_id: string;
  type: QuestionType;
  title: string;
  respostas: number;
  com_porque: number;
  opcoes?: { option_id: string; label: string; count: number; percent: number }[];
  media?: number | null;
  distribuicao?: { valor: number; count: number }[];
  linhas?: {
    row_id: string;
    label: string;
    opcoes: { option_id: string; label: string; count: number; percent: number }[];
    media?: number | null;
  }[];
  textos?: { aluno_nome: string; texto: string }[];
}
export interface ResultadosAvaliacao {
  avaliacao_id: number;
  total_respostas: number;
  nota_media: number | null;
  perguntas: ResultadoPergunta[];
}

/** Parte 4: GET /avaliacoes/:id/exportar (o renderer grava com window.escola.saveFile). */
export interface ExportacaoCsv {
  nome_arquivo: string;
  csv: string;
}
