export function validarArquivo(nome: string, mime: string, bytes: Uint8Array) {
  if (
    !nome ||
    nome.length > 150 ||
    /[\\/]/.test(nome) ||
    [...nome].some((c) => c.charCodeAt(0) < 32) ||
    bytes.length < 1 ||
    bytes.length > 5 * 1024 * 1024
  )
    throw new Error('ARQUIVO_INVALIDO');
  const prefixo = (n: number) => String.fromCharCode(...bytes.slice(0, n));
  const permitido =
    (mime === 'application/pdf' && /\.pdf$/i.test(nome) && prefixo(5) === '%PDF-') ||
    (mime === 'image/png' && /\.png$/i.test(nome) && [137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b)) ||
    (mime === 'image/jpeg' && /\.jpe?g$/i.test(nome) && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) ||
    (mime === 'audio/mpeg' && /\.mp3$/i.test(nome) && (prefixo(3) === 'ID3' || (bytes[0] === 255 && (bytes[1] & 224) === 224))) ||
    (mime === 'audio/ogg' && /\.ogg$/i.test(nome) && prefixo(4) === 'OggS') ||
    (mime === 'audio/wav' && /\.wav$/i.test(nome) && prefixo(4) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WAVE');
  if (!permitido) throw new Error('ARQUIVO_INVALIDO');
}
