// F06 — check-in (R10) e painel (R12). Vagas vêm de seats() da F03; nada aqui reimplementa compra/status.
import { query } from '../db.js';
import { seats } from '../tickets/service.js';

export const CHECKIN_MESSAGES = {
  invalid: 'Ingresso inválido para este evento',
  event_cancelled: 'Evento cancelado',
  not_confirmed: 'Ingresso não confirmado',
  already_used: 'Ingresso já utilizado',
  ok: 'Entrada liberada',
};

const normalizeCode = (code) => String(code ?? '').trim().toUpperCase();

async function lookup(eventId, code) {
  const { rows } = await query(
    `SELECT t.id, t.status, t.checked_in_at, e.status AS event_status
       FROM tickets t JOIN events e ON e.id = t.event_id
      WHERE t.code = $1 AND t.event_id = $2`,
    [code, eventId],
  );
  return rows[0] || null;
}

/** Ordem de prioridade do brief (R10): inválido > evento cancelado > não confirmado > já utilizado > liberada. */
function classify(row) {
  if (!row) return 'invalid';
  if (row.event_status === 'cancelled') return 'event_cancelled';
  if (row.status !== 'confirmed') return 'not_confirmed';
  if (row.checked_in_at !== null) return 'already_used';
  return 'ok';
}

/** @returns {Promise<'invalid'|'event_cancelled'|'not_confirmed'|'already_used'|'ok'>} */
export async function checkIn(eventId, code) {
  const normalized = normalizeCode(code);
  if (!normalized) return 'invalid';
  const row = await lookup(eventId, normalized);
  const verdict = classify(row);
  if (verdict !== 'ok') return verdict;

  // UPDATE condicional: só um check-in concorrente do mesmo código consegue marcar a entrada (F06-AC02).
  const { rowCount } = await query(
    `UPDATE tickets t SET checked_in_at = now(), updated_at = now()
       FROM events e
      WHERE t.id = $1 AND e.id = t.event_id AND e.status <> 'cancelled'
        AND t.status = 'confirmed' AND t.checked_in_at IS NULL`,
    [row.id],
  );
  if (rowCount === 1) return 'ok';
  // Outro check-in (ou um cancelamento) ganhou a corrida: reavalia com o estado atual.
  const again = classify(await lookup(eventId, normalized));
  return again === 'ok' ? 'already_used' : again;
}

/** R12: números do painel de um evento. */
export async function panelMetrics(eventId) {
  const { rows } = await query(
    `SELECT count(*) FILTER (WHERE status = 'confirmed')                              AS confirmed,
            count(*) FILTER (WHERE status = 'pending')                                AS pending,
            count(*) FILTER (WHERE status = 'confirmed' AND checked_in_at IS NOT NULL) AS checkins,
            coalesce(sum(price_cents) FILTER (WHERE status = 'confirmed'), 0)          AS revenue_cents,
            count(*) FILTER (WHERE status = 'refunded')                               AS refunded
       FROM tickets WHERE event_id = $1`,
    [eventId],
  );
  const r = rows[0];
  const s = await seats(eventId);
  return {
    confirmed: Number(r.confirmed),
    pending: Number(r.pending),
    checkins: Number(r.checkins),
    available: s ? s.available : 0,
    revenueCents: Number(r.revenue_cents),
    refunded: Number(r.refunded),
  };
}

/** 123456 -> "R$ 1.234,56" (espaço comum, não o não separável do Intl). */
export function formatBRL(cents) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
    .format(cents / 100)
    .replace(/[  ]/g, ' ');
}
