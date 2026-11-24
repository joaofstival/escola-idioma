import type { UploadArquivo } from '../../shared/contracts/pedagogico';
import { api } from './api';
export async function lerArquivo(file: File): Promise<UploadArquivo> {
  if (file.size < 1 || file.size > 5 * 1024 * 1024) throw new Error('O arquivo deve ter até 5 MB.');
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(new Error('Não foi possível ler o arquivo'));
    reader.readAsDataURL(file);
  });
  return { nome: file.name, mime: file.type, base64 };
}
export async function baixarArquivo(caminho: string) {
  const f = await api.get<{ nome: string; base64: string }>(caminho);
  return window.escola.saveBinary(f.nome, f.base64);
}
