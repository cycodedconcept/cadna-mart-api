import {
  randomBytes,
  createHash,
  scrypt,
  timingSafeEqual,
  createCipheriv,
  createDecipheriv,
} from 'node:crypto';
import { env } from '@/config/env.js';
export const opaqueToken = () => randomBytes(32).toString('hex');
export const digest = (value: string) =>
  createHash('sha256').update(value).digest('hex');
const derive = (password: string, salt: string) =>
  new Promise<Buffer>((resolve, reject) =>
    scrypt(
      password,
      salt,
      64,
      { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 },
      (error, key) => (error ? reject(error) : resolve(key)),
    ),
  );
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  return `scrypt$32768$8$3$${salt}$${(await derive(password, salt)).toString('hex')}`;
}
export async function verifyPassword(password: string, stored: string) {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts.slice(0, 4).join('$') !== 'scrypt$32768$8$3')
    return false;
  const actual = await derive(password, parts[4]!);
  const expected = Buffer.from(parts[5]!, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
let dummy: Promise<string> | undefined;
export const dummyPassword = () => (dummy ??= hashPassword(opaqueToken()));
export function seal(plaintext: string, context: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(
    'aes-256-gcm',
    Buffer.from(env.AUTH_ENCRYPTION_KEY, 'hex'),
    iv,
  );
  cipher.setAAD(Buffer.from(context));
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  return [iv, cipher.getAuthTag(), encrypted]
    .map((b) => b.toString('base64url'))
    .join('.');
}
export function unseal(value: string, context: string) {
  const [iv, tag, data] = value.split('.');
  if (!iv || !tag || !data) throw new Error('Invalid encrypted data');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    Buffer.from(env.AUTH_ENCRYPTION_KEY, 'hex'),
    Buffer.from(iv, 'base64url'),
  );
  decipher.setAAD(Buffer.from(context));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(data, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}
