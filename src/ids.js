import { randomInt } from 'node:crypto';

const ALNUM = 'abcdefghijklmnopqrstuvwxyz0123456789';

export function randomString(len, alphabet = ALNUM) {
  let s = '';
  for (let i = 0; i < len; i++) s += alphabet[randomInt(alphabet.length)];
  return s;
}

/** newId('evt') -> 'evt_k3j9x0a2' */
export const newId = (prefix) => `${prefix}_${randomString(8)}`;
