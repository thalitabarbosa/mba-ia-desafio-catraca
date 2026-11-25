// CLI de diagnóstico da F03 (usada pelos contratos):
//   node src/tickets/cli.js buy <eventId> <email> <card>          canal parceiro
//   node src/tickets/cli.js buy-as <eventId> <userEmail> <card>   canal vitrine, vinculado ao usuário
//   node src/tickets/cli.js status <ticketId> | seats <eventId> | burst <eventId> <n>
import { pool, query } from '../db.js';
import { purchaseTicket, seats, getTicket } from './service.js';

const [cmd, a, b, c] = process.argv.slice(2);
const out = (o) => console.log(JSON.stringify(o));

try {
  if (cmd === 'buy') {
    const r = await purchaseTicket({ eventId: a, channel: 'partner', buyerEmail: b, cardNumber: c });
    out(r.ok ? { result: 'ok', ticketId: r.ticket.id, code: r.ticket.code, status: r.ticket.status } : { result: r.error });
  } else if (cmd === 'buy-as') {
    const u = (await query('SELECT id, email FROM users WHERE email = $1', [b])).rows[0];
    if (!u) throw new Error(`usuário ${b} não existe`);
    const r = await purchaseTicket({ eventId: a, channel: 'storefront', buyerUserId: u.id, buyerEmail: u.email, cardNumber: c });
    out(r.ok ? { result: 'ok', ticketId: r.ticket.id, code: r.ticket.code, status: r.ticket.status } : { result: r.error });
  } else if (cmd === 'status') {
    const t = await getTicket(a);
    out(t ? { ticketId: t.id, code: t.code, eventId: t.eventId, status: t.status, checkedIn: t.checkedIn } : { result: 'ticket_not_found' });
  } else if (cmd === 'seats') {
    out(await seats(a));
  } else if (cmd === 'burst') {
    const n = Number(b || 30);
    const results = await Promise.all(Array.from({ length: n }, (_, i) =>
      purchaseTicket({ eventId: a, channel: 'partner', buyerEmail: `burst${i}@example.com`, cardNumber: '4000000000000001' })));
    const count = {};
    for (const r of results) { const k = r.ok ? 'ok' : r.error; count[k] = (count[k] || 0) + 1; }
    out(count);
  } else {
    console.error('uso: buy | buy-as | status | seats | burst');
    process.exitCode = 2;
  }
} finally {
  await pool.end();
}
