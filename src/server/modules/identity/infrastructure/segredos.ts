import { randomBytes, createHash, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { PortaSegredos } from '../application/ports.ts';
const derivar = promisify(scrypt);
export class SegredosScrypt implements PortaSegredos {
  emitir() {
    return randomBytes(32).toString('base64url');
  }
  hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }
  async hashSenha(texto: string) {
    const salt = randomBytes(16).toString('hex');
    const key = (await derivar(texto, salt, 64)) as Buffer;
    return salt + ':' + key.toString('hex');
  }
  async conferir(texto: string, hash: string) {
    const [salt, valor] = hash.split(':');
    if (!salt || !valor || valor.length !== 128) return false;
    const key = (await derivar(texto, salt, 64)) as Buffer;
    return timingSafeEqual(key, Buffer.from(valor, 'hex'));
  }
}
