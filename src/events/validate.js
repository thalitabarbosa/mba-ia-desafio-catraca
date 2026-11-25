// Validação de evento (R01), igual em criar e editar.
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/** "100", "100,00", "100.00", "1.234,56", "R$ 10" -> centavos (inteiro) ou null */
export function parsePriceCents(raw) {
  let s = String(raw ?? '').replace(/R\$|\s/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(Number(s) * 100);
}

/** "YYYY-MM-DDTHH:mm" em horário de São Paulo -> Date ou null */
export function parseLocalDateTime(raw) {
  const m = DATE_RE.exec(String(raw ?? '').trim());
  if (!m) return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00-03:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function validateEventInput(body, now = new Date()) {
  const errors = [];
  const name = String(body.name ?? '').trim();
  const venue = String(body.venue ?? '').trim();
  const startsAt = parseLocalDateTime(body.startsAt);
  const capRaw = String(body.capacity ?? '').trim();
  const capacity = /^\d+$/.test(capRaw) ? Number(capRaw) : NaN;
  const priceCents = parsePriceCents(body.price);

  if (!name) errors.push('Informe o nome do evento.');
  if (name.length > 120) errors.push('O nome pode ter no máximo 120 caracteres.');
  if (!venue) errors.push('Informe o local.');
  if (venue.length > 120) errors.push('O local pode ter no máximo 120 caracteres.');
  if (!startsAt) errors.push('Informe a data e hora de início.');
  else if (startsAt <= now) errors.push('A data de início precisa estar no futuro.');
  if (!Number.isInteger(capacity) || capacity < 1) errors.push('Lotação deve ser um inteiro maior ou igual a 1.');
  else if (capacity > 1000000) errors.push('Lotação muito grande.');
  if (priceCents === null || priceCents <= 0) errors.push('Preço deve ser maior que zero.');

  return { errors, values: { name, venue, startsAt, capacity, priceCents } };
}
