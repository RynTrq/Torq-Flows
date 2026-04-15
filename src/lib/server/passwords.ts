import 'server-only';

import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'crypto';
import { promisify } from 'util';

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;
  return `scrypt:${salt}:${derivedKey.toString('hex')}`;
}

export async function verifyPassword(password: string, storedHash: string) {
  const [algorithm, salt, expectedHex] = storedHash.split(':');

  if (algorithm !== 'scrypt' || !salt || !expectedHex) {
    return false;
  }

  const derivedKey = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;
  const expectedKey = Buffer.from(expectedHex, 'hex');

  if (derivedKey.length !== expectedKey.length) {
    return false;
  }

  return timingSafeEqual(derivedKey, expectedKey);
}
