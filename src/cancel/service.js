// F07 — cancelamento irreversível (R11). Uma transação, com o mesmo lock de evento da compra (F03):
// nenhuma compra concorrente consegue inserir um ingresso pendente depois do cancelamento.
import { tx } from '../db.js';

export class CancelError extends Error {
  constructor(kind, message) { super(message); this.kind = kind; }
}

/** -> { refunded, cancelled } (quantos ingressos mudaram) */
export async function cancelEvent(orgId, eventId) {
  return tx(async (client) => {
    const ev = (await client.query(
      'SELECT id, status FROM events WHERE id = $1 AND organizer_id = $2 FOR UPDATE', [eventId, orgId],
    )).rows[0];
    if (!ev) throw new CancelError('not_found', 'Evento não encontrado.');
    if (ev.status === 'cancelled') throw new CancelError('conflict', 'O evento já está cancelado.');
    if (ev.status !== 'published') throw new CancelError('conflict', 'Só eventos publicados podem ser cancelados.');

    await client.query(`UPDATE events SET status = 'cancelled', cancelled_at = now(), updated_at = now() WHERE id = $1`, [eventId]);
    const refunded = await client.query(
      `UPDATE tickets SET status = 'refunded', updated_at = now() WHERE event_id = $1 AND status = 'confirmed'`, [eventId],
    );
    const cancelled = await client.query(
      `UPDATE tickets SET status = 'cancelled', updated_at = now() WHERE event_id = $1 AND status = 'pending'`, [eventId],
    );
    return { refunded: refunded.rowCount, cancelled: cancelled.rowCount };
  });
}
