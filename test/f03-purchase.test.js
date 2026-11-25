import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { resetDb, pool, query, loginAs, ORG_A, localDate, sleep } from './helpers.js';
import { purchaseTicket, seats, getTicket, applyDueGatewayResponses } from '../src/tickets/service.js';
import { simulateCharge } from '../src/tickets/gateway.js';
import { gatewayWorker } from '../src/tickets/worker.js';
import { config } from '../src/config.js';

let A; let stopWorker;
before(async () => {
  await resetDb();
  A = await loginAs(ORG_A);
  stopWorker = gatewayWorker.start(20);
});
after(async () => { stopWorker(); await pool.end(); });

// tempo máximo de uma resposta "rápida"/"lenta" com a escala do ambiente de teste (+ folga)
const FAST_MS = 5000 * config.gatewayDelayScale + 500;
const SLOW_MS = 40000 * config.gatewayDelayScale + 500;

async function newEvent({ capacity = 5, price = '100,00', publish = true } = {}) {
  const res = await A.post('/organizer/events').type('form')
    .send({ name: `Ev ${Math.random()}`, startsAt: localDate(30), venue: 'Bar', capacity: String(capacity), price });
  const id = res.headers.location.split('/').pop();
  if (publish) await A.post(`/organizer/events/${id}/publish`);
  return id;
}
const buy = (eventId, card = '4000000000000001', email = 'p@example.com') =>
  purchaseTicket({ eventId, channel: 'partner', buyerEmail: email, cardNumber: card });

async function waitStatus(id, status, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if ((await getTicket(id)).status === status) return true;
    await sleep(10);
  }
  return (await getTicket(id)).status === status;
}

test('gateway simulado segue a tabela do brief (escala 1)', () => {
  for (let i = 0; i < 50; i++) {
    const f1 = simulateCharge('4000000000000001', 1);
    assert.equal(f1.result, 'approved'); assert.ok(f1.delayMs >= 2000 && f1.delayMs <= 5000);
    const f2 = simulateCharge('4000000000000002', 1);
    assert.equal(f2.result, 'declined'); assert.ok(f2.delayMs >= 2000 && f2.delayMs <= 5000);
    const f3 = simulateCharge('4000000000000003', 1);
    assert.equal(f3.result, 'approved'); assert.ok(f3.delayMs >= 30000 && f3.delayMs <= 40000);
    const f4 = simulateCharge('4000000000000004', 1);
    assert.equal(f4.result, 'declined'); assert.ok(f4.delayMs >= 30000 && f4.delayMs <= 40000);
    const fx = simulateCharge('4000000000009999', 1);
    assert.equal(fx.result, 'declined'); assert.ok(fx.delayMs >= 2000 && fx.delayMs <= 5000);
  }
});

test('R06: compra nasce pendente, ocupa vaga e responde sem esperar o gateway', async () => {
  const ev = await newEvent({ capacity: 2 });
  const t0 = Date.now();
  const r = await buy(ev);
  assert.ok(Date.now() - t0 < 1000);
  assert.equal(r.ok, true);
  assert.equal(r.ticket.status, 'pending');
  assert.match(r.ticket.code, /^[A-HJ-NP-Z2-9]{8}$/);
  assert.deepEqual(await seats(ev), { capacity: 2, occupied: 1, available: 1 });
});

test('R08: 0001 confirma; 0002 e final desconhecido recusam e liberam a vaga; 0003 confirma; 0004 recusa', async () => {
  const ev = await newEvent({ capacity: 10 });
  const t1 = (await buy(ev, '4000000000000001')).ticket;
  const t2 = (await buy(ev, '4000000000000002')).ticket;
  const t9 = (await buy(ev, '4000000000009999')).ticket;
  const t3 = (await buy(ev, '4000000000000003')).ticket;
  const t4 = (await buy(ev, '4000000000000004')).ticket;
  assert.equal((await seats(ev)).occupied, 5);
  assert.ok(await waitStatus(t1.id, 'confirmed', FAST_MS));
  assert.ok(await waitStatus(t2.id, 'declined', FAST_MS));
  assert.ok(await waitStatus(t9.id, 'declined', FAST_MS));
  assert.equal((await getTicket(t3.id)).status, 'pending', 'cartão lento ainda pendente');
  assert.ok(await waitStatus(t3.id, 'confirmed', SLOW_MS));
  assert.ok(await waitStatus(t4.id, 'declined', SLOW_MS));
  assert.equal((await seats(ev)).occupied, 2);
});

test('R07: sem vaga a compra é recusada com sold_out; pendente segura a vaga até a recusa', async () => {
  const ev = await newEvent({ capacity: 1 });
  const slow = (await buy(ev, '4000000000000004')).ticket;
  assert.deepEqual(await buy(ev), { ok: false, error: 'sold_out' });
  assert.ok(await waitStatus(slow.id, 'declined', SLOW_MS));
  assert.equal((await buy(ev)).ok, true);
});

test('R07: 30 compras simultâneas em lotação 5 → exatamente 5 aceitas, em 20 rodadas', async () => {
  for (let round = 0; round < 20; round++) {
    const ev = await newEvent({ capacity: 5 });
    const results = await Promise.all(Array.from({ length: 30 }, (_, i) => buy(ev, '4000000000000001', `c${i}@x.com`)));
    const ok = results.filter((r) => r.ok).length;
    const sold = results.filter((r) => !r.ok && r.error === 'sold_out').length;
    assert.equal(ok, 5, `rodada ${round}`);
    assert.equal(sold, 25, `rodada ${round}`);
    const { rows } = await query(`SELECT count(*) AS n FROM tickets WHERE event_id = $1`, [ev]);
    assert.equal(rows[0].n, 5);
  }
});

test('R02: rascunho, inexistente e cancelado não vendem', async () => {
  const draft = await newEvent({ publish: false });
  assert.deepEqual(await buy(draft), { ok: false, error: 'event_not_available' });
  assert.deepEqual(await buy('evt_naoexiste'), { ok: false, error: 'event_not_available' });
  const ev = await newEvent();
  await query(`UPDATE events SET status = 'cancelled' WHERE id = $1`, [ev]);
  assert.deepEqual(await buy(ev), { ok: false, error: 'event_not_available' });
  assert.equal((await seats(ev)).available, 0);
});

test('R06: cartão sem 16 dígitos é rejeitado antes de criar ingresso', async () => {
  const ev = await newEvent();
  for (const card of ['123', '40000000000000011', '400000000000000a', '', null, 4000000000000001]) {
    assert.deepEqual(await buy(ev, card), { ok: false, error: 'invalid_card' });
  }
  assert.equal((await seats(ev)).occupied, 0);
});

test('R03: o ingresso grava o preço vigente no momento da compra', async () => {
  const ev = await newEvent({ capacity: 5, price: '100,00' });
  const t1 = (await buy(ev)).ticket;
  await A.post(`/organizer/events/${ev}`).type('form')
    .send({ name: 'Ev', startsAt: localDate(30), venue: 'Bar', capacity: '5', price: '150,00' });
  const t2 = (await buy(ev)).ticket;
  assert.equal((await getTicket(t1.id)).priceCents, 10000);
  assert.equal((await getTicket(t2.id)).priceCents, 15000);
});

test('R11 (guarda): resposta do gateway não altera ingresso que deixou de estar pendente', async () => {
  const ev = await newEvent();
  const t = (await buy(ev, '4000000000000003')).ticket;
  await query(`UPDATE tickets SET status = 'cancelled' WHERE id = $1`, [t.id]);
  await query(`UPDATE tickets SET gateway_due_at = now() - interval '1 second' WHERE id = $1`, [t.id]);
  await applyDueGatewayResponses();
  assert.equal((await getTicket(t.id)).status, 'cancelled');
});

test('R09: códigos únicos', async () => {
  const { rows } = await query('SELECT count(*) AS n, count(DISTINCT code) AS d FROM tickets');
  assert.equal(rows[0].n, rows[0].d);
});
