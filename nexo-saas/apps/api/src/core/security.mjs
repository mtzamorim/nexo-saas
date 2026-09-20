import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(scryptCallback);
const COST = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
/** @param {string} value */
export function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
export function randomToken() { return randomBytes(32).toString('base64url'); }
/** @param {string} sessionToken */
export function csrfToken(sessionToken) { return sha256(`nexo-csrf:${sessionToken}`); }
/** @param {string|undefined} actual @param {string} expected */
export function safeEqual(actual, expected) {
  if (!actual) return false;
  const left = Buffer.from(actual); const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}
/** @param {string} password */
export async function hashPassword(password) {
  if (password.length < 12 || password.length > 128) throw new Error('A senha deve ter entre 12 e 128 caracteres.');
  const salt = randomBytes(16).toString('hex');
  const key = /** @type {Buffer} */ (await scrypt(password, salt, 64, COST));
  return `scrypt$32768$8$3$${salt}$${key.toString('hex')}`;
}
/** @param {string} password @param {string} encoded */
export async function verifyPassword(password, encoded) {
  if (password.length > 128) return false;
  const [algorithm, n, r, p, salt, digest] = encoded.split('$');
  if (algorithm !== 'scrypt' || n !== '32768' || r !== '8' || p !== '3' || !salt || !digest || !/^[a-f0-9]{32}$/.test(salt) || !/^[a-f0-9]{128}$/.test(digest)) return false;
  const key = /** @type {Buffer} */ (await scrypt(password, salt, 64, COST));
  return timingSafeEqual(key, Buffer.from(digest, 'hex'));
}
/** @param {string|undefined} origin @param {string} appUrl */
export function isTrustedOrigin(origin, appUrl) {
  try { return origin != null && origin === new URL(appUrl).origin; } catch { return false; }
}
