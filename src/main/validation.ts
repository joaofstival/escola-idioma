// Helpers de validação: acumulam os problemas encontrados e lançam um único 422 com todos os detalhes.
import { HttpError, NotFoundError, ValidationError } from './router.ts';

type Dados = Record<string, unknown>;

interface Base { obrigatorio?: boolean; rotulo?: string }
export interface OpTexto extends Base { max?: number; min?: number }
export interface OpNumero extends Base { min?: number; max?: number; inteiro?: boolean }
export interface OpData extends Base { naoFutura?: boolean }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const DATA_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** true se o valor é "vazio" (ausente, null ou texto em branco). */
export function vazio(v: unknown): boolean {
  return v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
}

/** Valida uma data ISO (YYYY-MM-DD) verificando se o dia existe. */
export function dataIsoValida(v: string): boolean {
  const m = DATA_RE.exec(v);
  if (!m) return false;
  const [a, mes, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(a, mes - 1, d));
  return dt.getUTCFullYear() === a && dt.getUTCMonth() === mes - 1 && dt.getUTCDate() === d;
}

/** Data de hoje no fuso local, em ISO (YYYY-MM-DD). */
export function hojeIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export class Validador {
  readonly dados: Dados;
  readonly detalhes: string[] = [];

  constructor(dados: Dados) {
    this.dados = dados;
  }

  private nome(campo: string, op?: Base): string {
    return op?.rotulo ?? campo;
  }

  private faltando(campo: string, op?: Base): boolean {
    if (!vazio(this.dados[campo])) return false;
    if (op?.obrigatorio) this.erro(`${this.nome(campo, op)} é obrigatório`);
    return true;
  }

  /** Adiciona um problema manualmente. */
  erro(msg: string): this {
    this.detalhes.push(msg);
    return this;
  }

  get valido(): boolean {
    return this.detalhes.length === 0;
  }

  /** Lança ValidationError (422) se houver problemas. */
  verificar(erro = 'Dados inválidos'): void {
    if (this.detalhes.length) throw new ValidationError(this.detalhes, erro);
  }

  texto(campo: string, op: OpTexto = {}): string | null {
    if (this.faltando(campo, op)) return null;
    const v = this.dados[campo];
    if (typeof v !== 'string' && typeof v !== 'number') {
      this.erro(`${this.nome(campo, op)} deve ser um texto`);
      return null;
    }
    const s = String(v).trim();
    if (op.max !== undefined && s.length > op.max) this.erro(`${this.nome(campo, op)} deve ter no máximo ${op.max} caracteres`);
    if (op.min !== undefined && s.length < op.min) this.erro(`${this.nome(campo, op)} deve ter no mínimo ${op.min} caracteres`);
    return s;
  }

  email(campo: string, op: Base = {}): string | null {
    const s = this.texto(campo, { ...op, max: 254 });
    if (s !== null && !EMAIL_RE.test(s)) this.erro(`${this.nome(campo, op)} inválido: "${s}"`);
    return s === null ? null : s.toLowerCase();
  }

  numero(campo: string, op: OpNumero = {}): number | null {
    if (this.faltando(campo, op)) return null;
    const v = this.dados[campo];
    const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.trim().replace(',', '.')) : NaN;
    const r = this.nome(campo, op);
    if (!Number.isFinite(n)) {
      this.erro(`${r} deve ser um número`);
      return null;
    }
    if (op.inteiro && !Number.isInteger(n)) {
      this.erro(`${r} deve ser um número inteiro`);
      return null;
    }
    if (op.min !== undefined && op.max !== undefined && (n < op.min || n > op.max)) {
      this.erro(`${r} deve estar entre ${op.min} e ${op.max}`);
    } else if (op.min !== undefined && n < op.min) {
      this.erro(`${r} deve ser maior ou igual a ${op.min}`);
    } else if (op.max !== undefined && n > op.max) {
      this.erro(`${r} deve ser menor ou igual a ${op.max}`);
    }
    return n;
  }

  inteiro(campo: string, op: Omit<OpNumero, 'inteiro'> = {}): number | null {
    return this.numero(campo, { ...op, inteiro: true });
  }

  data(campo: string, op: OpData = {}): string | null {
    const s = this.texto(campo, op);
    if (s === null) return null;
    if (!dataIsoValida(s)) {
      this.erro(`${this.nome(campo, op)} deve ser uma data válida no formato AAAA-MM-DD`);
      return null;
    }
    if (op.naoFutura && s > hojeIso()) this.erro(`${this.nome(campo, op)} não pode ser uma data futura`);
    return s;
  }

  enumeracao<T extends string>(campo: string, valores: readonly T[], op: Base & { padrao?: T } = {}): T | null {
    if (vazio(this.dados[campo])) {
      if (op.padrao !== undefined) return op.padrao;
      if (op.obrigatorio) this.erro(`${this.nome(campo, op)} é obrigatório`);
      return null;
    }
    const v = String(this.dados[campo]).trim();
    if (!(valores as readonly string[]).includes(v)) {
      this.erro(`${this.nome(campo, op)} deve ser um destes valores: ${valores.join(', ')}`);
      return null;
    }
    return v as T;
  }

  booleano(campo: string, op: Base & { padrao?: boolean } = {}): boolean | null {
    const v = this.dados[campo];
    if (vazio(v)) {
      if (op.padrao !== undefined) return op.padrao;
      if (op.obrigatorio) this.erro(`${this.nome(campo, op)} é obrigatório`);
      return null;
    }
    const b = paraBooleano(v);
    if (b === null) this.erro(`${this.nome(campo, op)} deve ser verdadeiro ou falso`);
    return b;
  }

  /** Lista de ids inteiros positivos, sem repetição. */
  listaIds(campo: string, op: Base = {}): number[] {
    const v = this.dados[campo];
    if (vazio(v)) {
      if (op.obrigatorio) this.erro(`${this.nome(campo, op)} é obrigatório`);
      return [];
    }
    if (!Array.isArray(v)) {
      this.erro(`${this.nome(campo, op)} deve ser uma lista de ids`);
      return [];
    }
    const ids = v.map((x) => Number(typeof x === 'object' && x !== null && 'id' in x ? (x as { id: unknown }).id : x));
    if (ids.some((n) => !Number.isInteger(n) || n <= 0)) {
      this.erro(`${this.nome(campo, op)} deve conter apenas ids válidos`);
      return [];
    }
    return [...new Set(ids)];
  }
}

/** Converte true/false/1/0/"sim"/"nao" em boolean; null se não reconhecer. */
export function paraBooleano(v: unknown): boolean | null {
  if (typeof v === 'boolean') return v;
  if (v === 1 || v === 0) return v === 1;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    if (['true', '1', 'sim', 's'].includes(s)) return true;
    if (['false', '0', 'nao', 'não', 'n'].includes(s)) return false;
  }
  return null;
}

/** Exige corpo JSON em forma de objeto. */
export function exigirCorpo(body: unknown): Dados {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ValidationError(['O corpo da requisição deve ser um objeto JSON'], 'Corpo da requisição inválido');
  }
  return body as Dados;
}

/** Converte o parâmetro :id; ids malformados resultam em 404. */
export function parseId(v: string | undefined, recurso = 'Registro'): number {
  const n = Number(v);
  if (!v || !/^\d+$/.test(v) || !Number.isSafeInteger(n) || n <= 0) throw new NotFoundError(`${recurso} não encontrado`);
  return n;
}

/** Lê um filtro inteiro da query string (422 se malformado). */
export function queryInt(query: Record<string, string>, nome: string, op: { min?: number; max?: number } = {}): number | undefined {
  const v = query[nome];
  if (v === undefined || v.trim() === '') return undefined;
  const n = Number(v);
  if (!Number.isInteger(n) || (op.min !== undefined && n < op.min) || (op.max !== undefined && n > op.max)) {
    throw new ValidationError([`Filtro ${nome} inválido: "${v}"`], 'Filtro inválido');
  }
  return n;
}

/** Lê um filtro booleano da query string (422 se malformado). */
export function queryBool(query: Record<string, string>, nome: string): boolean | undefined {
  const v = query[nome];
  if (v === undefined || v.trim() === '') return undefined;
  const b = paraBooleano(v);
  if (b === null) throw new ValidationError([`Filtro ${nome} inválido: "${v}" (use true ou false)`], 'Filtro inválido');
  return b;
}

/** Garante que o registro existe; senão lança 404. */
export function encontrado<T>(registro: T | undefined | null, msg = 'Registro não encontrado'): T {
  if (registro === undefined || registro === null) throw new NotFoundError(msg);
  return registro;
}

export { HttpError, ValidationError };
