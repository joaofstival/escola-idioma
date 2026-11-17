// Listas de opções e rótulos compartilhados pelas telas.
import type { OpcaoSelect } from '@/components/campos';
import { NIVEIS, anosLetivos, nivel } from '@/lib/format';
import type { MaterialTipo } from '../../shared/types.ts';

export const TIPO_MATERIAL: Record<MaterialTipo, string> = { livro: 'Livro', apostila: 'Apostila', audio: 'Áudio', video: 'Vídeo', link: 'Link', outro: 'Outro' };

/** Níveis 1–12 com a faixa QECR; `vazio` adiciona a opção "todos" (valor ''). */
export const opcoesNivel = (vazio?: string): OpcaoSelect[] => [
  ...(vazio ? [{ valor: '', rotulo: vazio }] : []),
  ...NIVEIS.map((n) => ({ valor: String(n), rotulo: nivel(n) })),
];

export const opcoesAno = (extra?: number): OpcaoSelect[] => anosLetivos(extra).map((a) => ({ valor: String(a), rotulo: String(a) }));
