// F05 — validação do corpo da compra (feita antes de consultar o evento: 422 vem antes de 404/409).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CARD_RE = /^\d{16}$/;

export function validatePurchaseBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const { buyerEmail, cardNumber } = body;
  if (typeof buyerEmail !== 'string' || !EMAIL_RE.test(buyerEmail)) return null;
  if (typeof cardNumber !== 'string' || !CARD_RE.test(cardNumber)) return null;
  return { buyerEmail, cardNumber };
}
