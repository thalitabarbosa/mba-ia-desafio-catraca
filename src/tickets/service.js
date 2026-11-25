// F03 — único caminho de venda. Vitrine (F04) e API (F05) chamam purchaseTicket; ninguém insere em tickets.
import { query, tx, pool } from '../db.js';
import { newId } from '../ids.js';
import { config } from '../config.js';
import { simulateCharge, isValidCardNumber } from './gateway.js';
import { newTicketCode } from './codes.js';
import { occupiedSeats } from './seats.js';

export { occupiedSeats };

export const STATUS_LABEL = {
  pending: 'pendente',
  confirmed: 'confirmado',
  declined: 'recusado',
  cancelled: 'cancelado',
  refunded: 'estornado',
};

function toTicket(r) {
  if (!r) return null;
  return {
    id: r.id,
    code: r.code,
    eventId: r.event_id,
    status: r.status,
    checkedIn: r.checked_in_at !== null,
    checkedInAt: r.checked_in_at,
    channel: r.channel,
    buyerUserId: r.buyer_user_id,
    buyerEmail: r.buyer_email,
    priceCents: r.price_cents,
    createdAt: r.created_at,
  };
}

/**
 * Compra de UM ingresso (R05–R07). Responde sem esperar o gateway (R06).
 * @returns {Promise<{ok:true,ticket}|{ok:false,error:'invalid_card'|'event_not_available'|'sold_out'}>}
 */
export async function purchaseTicket({ eventId, channel, buyerUserId = null, buyerEmail, cardNumber }) {
  if (!isValidCardNumber(cardNumber)) return { ok: false, error: 'invalid_card' };
  return tx(async (client) => {
    // Lock da linha do evento: compras concorrentes do mesmo evento ficam em fila aqui (R07).
    const ev = (await client.query(
      'SELECT id, status, capacity, price_cents FROM events WHERE id = $1 FOR UPDATE', [eventId],
    )).rows[0];
    if (!ev || ev.status !== 'published') return { ok: false, error: 'event_not_available' };
    if ((await occupiedSeats(client, eventId)) >= ev.capacity) return { ok: false, error: 'sold_out' };

    const charge = simulateCharge(cardNumber, config.gatewayDelayScale);
    const id = newId('tkt');
    for (let attempt = 0; ; attempt++) {
      await client.query('SAVEPOINT code_attempt');
      try {
        const { rows } = await client.query(
          `INSERT INTO tickets (id, event_id, code, channel, buyer_user_id, buyer_email, card_last4, price_cents,
                                status, gateway_result, gateway_due_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', $9, clock_timestamp() + $10 * interval '1 millisecond')
           RETURNING *`,
          [id, eventId, newTicketCode(), channel, buyerUserId, buyerEmail, cardNumber.slice(-4), ev.price_cents,
            charge.result, charge.delayMs],
        );
        await client.query('RELEASE SAVEPOINT code_attempt');
        return { ok: true, ticket: toTicket(rows[0]) };
      } catch (err) {
        await client.query('ROLLBACK TO SAVEPOINT code_attempt');
        if (err.code === '23505' && err.constraint === 'tickets_code_key' && attempt < 5) continue;
        throw err;
      }
    }
  });
}

/** R05: { capacity, occupied, available } — evento não publicado (rascunho/cancelado) tem 0 disponíveis para venda. */
export async function seats(eventId) {
  const client = await pool.connect();
  try {
    const ev = (await client.query('SELECT capacity, status FROM events WHERE id = $1', [eventId])).rows[0];
    if (!ev) return null;
    const occupied = await occupiedSeats(client, eventId);
    const available = ev.status === 'cancelled' ? 0 : Math.max(0, ev.capacity - occupied);
    return { capacity: ev.capacity, occupied, available };
  } finally {
    client.release();
  }
}

export async function getTicket(ticketId) {
  const { rows } = await query('SELECT * FROM tickets WHERE id = $1', [ticketId]);
  return toTicket(rows[0]);
}

export async function findTicketByCode(code) {
  const { rows } = await query('SELECT * FROM tickets WHERE code = $1', [String(code ?? '').trim().toUpperCase()]);
  return toTicket(rows[0]);
}

/** Para "Meus ingressos": ingressos do participante, com dados do evento, mais recentes primeiro. */
export async function listTicketsByUser(userId) {
  const { rows } = await query(
    `SELECT t.*, e.name AS event_name, e.starts_at AS event_starts_at, e.venue AS event_venue
       FROM tickets t JOIN events e ON e.id = t.event_id
      WHERE t.buyer_user_id = $1
      ORDER BY t.created_at DESC`,
    [userId],
  );
  return rows.map((r) => ({ ...toTicket(r), eventName: r.event_name, eventStartsAt: r.event_starts_at, eventVenue: r.event_venue }));
}

/**
 * Aplica as respostas vencidas do gateway (R08). A guarda status='pending' garante que uma resposta
 * que chegue depois do cancelamento não altera o ingresso (R11).
 */
export async function applyDueGatewayResponses() {
  const { rowCount } = await query(
    `UPDATE tickets
        SET status = CASE gateway_result WHEN 'approved' THEN 'confirmed' ELSE 'declined' END,
            updated_at = now()
      WHERE status = 'pending' AND gateway_due_at <= clock_timestamp()`,
  );
  return rowCount;
}
