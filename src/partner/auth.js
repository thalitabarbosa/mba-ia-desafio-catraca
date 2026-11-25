// F05 — chave de parceiro: header X-Api-Key comparado em tempo constante com config.partnerApiKey.
import crypto from 'node:crypto';
import { config } from '../config.js';

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();

/** Compara os SHA-256 (mesmo tamanho) para não vazar nem o conteúdo nem o tamanho da chave. */
export function isValidApiKey(given) {
  if (typeof given !== 'string' || given === '') return false;
  return crypto.timingSafeEqual(sha(given), sha(config.partnerApiKey));
}

export function requireApiKey(req, res, next) {
  if (!isValidApiKey(req.get('X-Api-Key'))) return res.status(401).json({ error: 'unauthorized' });
  next();
}
