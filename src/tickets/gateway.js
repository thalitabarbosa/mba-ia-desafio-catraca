// Gateway de pagamento simulado (modo padrão). Decide o resultado e o atraso pelo final do cartão.
import { randomInt } from 'node:crypto';
import { config } from '../config.js';

const FAST = [2000, 4500];   // dentro de 2–5 s, com folga para o worker (250 ms)
const SLOW = [30000, 40000]; // 30–40 s

const RULES = {
  '0001': { result: 'approved', range: FAST },
  '0002': { result: 'declined', range: FAST },
  '0003': { result: 'approved', range: SLOW },
  '0004': { result: 'declined', range: SLOW },
};

export const isValidCardNumber = (n) => typeof n === 'string' && /^\d{16}$/.test(n);

/** -> { result: 'approved'|'declined', delayMs } (delay já multiplicado por GATEWAY_DELAY_SCALE) */
export function simulateCharge(cardNumber, scale = config.gatewayDelayScale) {
  const rule = RULES[cardNumber.slice(-4)] || { result: 'declined', range: FAST };
  const base = randomInt(rule.range[0], rule.range[1] + 1);
  return { result: rule.result, delayMs: Math.round(base * scale), baseDelayMs: base };
}
