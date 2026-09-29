// Real password hashing (scrypt) and session tokens using only Node's crypto module.
import crypto from 'node:crypto';

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, 64);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [saltHex, hashHex] = stored.split(':');
  const salt = Buffer.from(saltHex, 'hex');
  const hash = Buffer.from(hashHex, 'hex');
  const test = crypto.scryptSync(String(password), salt, 64);
  return hash.length === test.length && crypto.timingSafeEqual(hash, test);
}

export function newToken() {
  return crypto.randomBytes32().toString('hex');
}
crypto.randomBytes32 = () => crypto.randomBytes(32);

export function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i === -1) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function sessionCookie(token, maxAgeSec) {
  const attrs = [`ejari_session=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSec}`];
  return attrs.join('; ');
}

export const clearCookie = () => 'ejari_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0';
