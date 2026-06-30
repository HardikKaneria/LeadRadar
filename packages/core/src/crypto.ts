import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/** Derive a 32-byte key from the configured secret. */
function deriveKey(secret: string): Buffer {
  return createHash('sha256').update(secret).digest();
}

/** AES-256-GCM encrypt → base64(iv:tag:ciphertext). For integration creds at rest. */
export function encryptSecret(plaintext: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(secret), iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

export function decryptSecret(payload: string, secret: string): string {
  const raw = Buffer.from(payload, 'base64');
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const enc = raw.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', deriveKey(secret), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

/** One-way hash for opaque tokens (extension capture tokens, refresh tokens). */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}
