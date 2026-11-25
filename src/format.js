// Formatação compartilhada (datas em America/Sao_Paulo, dinheiro em BRL).
const TZ_OFFSET_MS = 3 * 3600e3; // -03:00 fixo (sem horário de verão)
const p = (n) => String(n).padStart(2, '0');

function shifted(date) {
  return new Date(new Date(date).getTime() - TZ_OFFSET_MS);
}

/** 05/12/2026 21:00 */
export function formatDateTime(date) {
  const d = shifted(date);
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

/** valor para <input type="datetime-local">: 2026-12-05T21:00 */
export function toLocalInput(date) {
  const d = shifted(date);
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

/** 2026-12-05T21:00:00-03:00 */
export function toIsoOffset(date) {
  const d = shifted(date);
  return `${toLocalInput(date)}:${p(d.getUTCSeconds())}-03:00`;
}

/** 35000 -> "R$ 350,00" */
export function formatMoney(cents) {
  const neg = cents < 0;
  const abs = Math.abs(cents);
  const reais = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${neg ? '-' : ''}R$ ${reais},${p(abs % 100)}`;
}

/** 15000 -> "150,00" (para campos de formulário) */
export function centsToInput(cents) {
  return `${Math.floor(cents / 100)},${p(cents % 100)}`;
}
