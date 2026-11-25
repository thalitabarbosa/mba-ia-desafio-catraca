// F02 — interface estável de eventos. Outras features importam daqui; ninguém reescreve estes filtros.
import { query, tx } from '../db.js';
import { newId } from '../ids.js';
import { validateEventInput } from './validate.js';
import { ValidationError, NotFoundError, ConflictError } from './errors.js';
import { occupiedSeats } from '../tickets/seats.js';

export { ValidationError, NotFoundError, ConflictError };

const COLS = `id, organizer_id, name, venue, starts_at, capacity, price_cents, status, cancelled_at, created_at, updated_at`;

export function toEvent(r) {
  if (!r) return null;
  return {
    id: r.id,
    organizerId: r.organizer_id,
    name: r.name,
    venue: r.venue,
    startsAt: r.starts_at,
    capacity: r.capacity,
    priceCents: r.price_cents,
    status: r.status,
    cancelledAt: r.cancelled_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** R02: só publicado (e, portanto, não cancelado) está à venda. */
export const isOnSale = (event) => event?.status === 'published';

export async function createEvent(orgId, body) {
  const { errors, values } = validateEventInput(body);
  if (errors.length) throw new ValidationError(errors);
  const { rows } = await query(
    `INSERT INTO events (id, organizer_id, name, venue, starts_at, capacity, price_cents)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING ${COLS}`,
    [newId('evt'), orgId, values.name, values.venue, values.startsAt, values.capacity, values.priceCents],
  );
  return toEvent(rows[0]);
}

export async function updateEvent(orgId, eventId, body) {
  return tx(async (client) => {
    const cur = toEvent((await client.query(
      `SELECT ${COLS} FROM events WHERE id = $1 AND organizer_id = $2 FOR UPDATE`, [eventId, orgId],
    )).rows[0]);
    if (!cur) throw new NotFoundError();
    if (cur.status === 'cancelled') throw new ConflictError('Evento cancelado não pode ser alterado.');

    const { errors, values } = validateEventInput(body);
    if (errors.length) throw new ValidationError(errors);
    const occupied = await occupiedSeats(client, eventId);
    if (values.capacity < occupied) {
      throw new ValidationError([`A lotação não pode ser menor que as vagas ocupadas (${occupied}).`]);
    }
    const { rows } = await client.query(
      `UPDATE events SET name = $2, venue = $3, starts_at = $4, capacity = $5, price_cents = $6, updated_at = now()
        WHERE id = $1 RETURNING ${COLS}`,
      [eventId, values.name, values.venue, values.startsAt, values.capacity, values.priceCents],
    );
    return toEvent(rows[0]);
  });
}

export async function publishEvent(orgId, eventId) {
  return tx(async (client) => {
    const cur = toEvent((await client.query(
      `SELECT ${COLS} FROM events WHERE id = $1 AND organizer_id = $2 FOR UPDATE`, [eventId, orgId],
    )).rows[0]);
    if (!cur) throw new NotFoundError();
    if (cur.status === 'cancelled') throw new ConflictError('Evento cancelado não pode ser publicado novamente.');
    if (cur.status === 'published') return cur;
    const { rows } = await client.query(
      `UPDATE events SET status = 'published', updated_at = now() WHERE id = $1 RETURNING ${COLS}`, [eventId],
    );
    return toEvent(rows[0]);
  });
}

/** R13: só devolve o evento se ele pertence ao organizador. */
export async function getOwnedEvent(orgId, eventId) {
  const { rows } = await query(`SELECT ${COLS} FROM events WHERE id = $1 AND organizer_id = $2`, [eventId, orgId]);
  return toEvent(rows[0]);
}

/** Sem filtro de dono — uso interno (vitrine, API, compra). */
export async function getEvent(eventId) {
  const { rows } = await query(`SELECT ${COLS} FROM events WHERE id = $1`, [eventId]);
  return toEvent(rows[0]);
}

export async function listOwnedEvents(orgId) {
  const { rows } = await query(`SELECT ${COLS} FROM events WHERE organizer_id = $1 ORDER BY starts_at, created_at`, [orgId]);
  return rows.map(toEvent);
}

export async function listOnSaleEvents() {
  const { rows } = await query(`SELECT ${COLS} FROM events WHERE status = 'published' ORDER BY starts_at, created_at`);
  return rows.map(toEvent);
}
