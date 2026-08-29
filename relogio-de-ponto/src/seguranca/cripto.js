import crypto from 'node:crypto';
import { config } from '../config.js';

/**
 * Deriva a chave AES-256 a partir de CHAVE_BIOMETRIA. Aceita base64, hex ou
 * texto livre (neste ultimo caso passa por scrypt).
 */
function chaveMestra() {
  const bruta = config.chaveBiometria;
  for (const codificacao of ['base64', 'hex']) {
    try {
      const buf = Buffer.from(bruta, codificacao);
      if (buf.length === 32) return buf;
    } catch { /* tenta a proxima */ }
  }
  return crypto.scryptSync(bruta, 'rep-p-biometria', 32);
}

/**
 * Cifra um template biometrico. Formato de saida: iv(12) || tag(16) || dados.
 * AES-256-GCM da confidencialidade e autenticidade — um template alterado no
 * banco falha na decifragem em vez de virar uma comparacao silenciosamente ruim.
 */
export function cifrar(dados) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', chaveMestra(), iv);
  const corpo = Buffer.concat([cipher.update(dados), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), corpo]);
}

/** Decifra um template previamente cifrado por `cifrar`. */
export function decifrar(pacote) {
  const buf = Buffer.isBuffer(pacote) ? pacote : Buffer.from(pacote);
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const corpo = buf.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', chaveMestra(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(corpo), decipher.final()]);
}

/** Hash de senha/token com scrypt. Retorna { hash, salt } em hex. */
export function hashSenha(senha, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(senha, salt, 64).toString('hex');
  return { hash, salt };
}

/** Comparacao em tempo constante de senha/token. */
export function conferirSenha(senha, hashEsperado, salt) {
  const { hash } = hashSenha(senha, salt);
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(hashEsperado, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Token aleatorio url-safe. */
export function novoToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

/** SHA-256 hex de um texto ou buffer. */
export function sha256(dados) {
  return crypto.createHash('sha256').update(dados).digest('hex');
}
