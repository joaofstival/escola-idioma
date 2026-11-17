// Utilitários de validação de formulário (zod) e conversão de campos de texto.
import { z } from 'zod';
import { lerValor } from './financeiro.ts';

/** Texto obrigatório (aparado), com limite. */
export const textoObrigatorio = (rotulo: string, max = 120) =>
  z
    .string()
    .trim()
    .min(1, `Informe ${rotulo}.`)
    .max(max, `${rotulo[0].toUpperCase()}${rotulo.slice(1)} aceita até ${max} caracteres.`);

/** Texto opcional (aparado), com limite. */
export const textoOpcional = (rotulo: string, max = 200) =>
  z
    .string()
    .trim()
    .max(max, `${rotulo[0].toUpperCase()}${rotulo.slice(1)} aceita até ${max} caracteres.`);

/** E-mail opcional: vazio vale; preenchido precisa ter formato válido. */
export const emailOpcional = z
  .string()
  .trim()
  .refine((v) => v === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'Informe um e-mail válido, como nome@exemplo.com.');

/**
 * Número em texto no formato pt-BR (vírgula decimal, ponto de milhar); NaN se vazio ou ambíguo/inválido.
 * "1.500" é 1500, "1,5" é 1,5 e "1,250.50" é recusado. Mesma regra do financeiro (lerValor).
 */
export const paraNumero = (v: string): number => lerValor(v);

/** Vazio → null (campos opcionais enviados à API). */
export const nuloSeVazio = (v: string): string | null => (v.trim() === '' ? null : v.trim());
