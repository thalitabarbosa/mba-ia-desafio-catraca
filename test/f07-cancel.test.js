import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app, resetDb, pool, query, loginAs, anon, ORG_A, ORG_B, localDate, sleep } from './helpers.js';
import { purchaseTicket, getTicket } from '../src/tickets/service.js';
import { gatewayWorker } from '../src/tickets/worker.js';
import { cancelEvent } from '../src/cancel/service.js';
import { config } from '../src/config.js';

const KEY = config.partnerApiKey;
const FAST_MS = 5000 * config.gatewayDelayScale + 500;
const SLOW_MS = 40000 * config.gatewayDelayScale + 500;

let A; let B; let stopWorker; let orgAId;
before(async () => {
  await resetDb();
  A = await loginAs(ORG_A);
  B = await loginAs(ORG_B);
  orgAId = (await query('SELECT id FROM users WHERE email = $1', [ORG_A])).rows[0].id;
  stopWorker = gatewayWorker.start(20);
});
after(async () => { stopWorker(); await pool.end(); });

const form = (over = {}) => ({ name: 'Show', startsAt: localDate(30), venue: 'Clube', capacity: '5', price: '50,00', ...over });
async function newEvent({ publish = true, ...over } = {}) {
  const res = await A.post('/organizer/events').type('form').send(form(over));
  const id = res.headers.location.split('/').pop();
  if (publish) await A.post(`/organizer/events/${id}/publish`);
  return id;
}
const buy = (eventId, card) => purchaseTicket({ eventId, channel: 'partner', buyerEmail: 'x@example.com', cardNumber: card });
async function waitStatus(id, status, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if ((await getTicket(id)).status === status) return true; await sleep(10); }
  return (await getTicket(id)).status === status;
}

test('R11: rascunho não pode ser cancelado; outro organizador recebe 404', async () => {
  const draft = await newEvent({ publish: false });
  assert.equal((await A.post(`/organizer/events/${draft}/cancel`)).status, 409);
  const ev = await newEvent();
  const res = await B.post(`/organizer/events/${ev}/cancel`);
  assert.equal(res.status, 404);
  assert.equal((await query('SELECT status FROM events WHERE id = $1', [ev])).rows[0].status, 'published');
});

test('R11: confirmados viram estornados, pendentes viram cancelados, e resposta tardia não muda nada', async () => {
  const ev = await newEvent();
  const slow = (await buy(ev, '4000000000000003')).ticket;
  const fast = (await buy(ev, '4000000000000001')).ticket;
  assert.ok(await waitStatus(fast.id, 'confirmed', FAST_MS));
  const res = await A.post(`/organizer/events/${ev}/cancel`);
  assert.equal(res.status, 303);
  assert.equal((await getTicket(fast.id)).status, 'refunded');
  assert.equal((await getTicket(slow.id)).status, 'cancelled');
  await sleep(SLOW_MS);
  assert.equal((await getTicket(slow.id)).status, 'cancelled', 'resposta do gateway não pode reviver o ingresso');
});

test('R11: cancelado é irreversível — editar, publicar e cancelar de novo respondem 409; página sem edição', async () => {
  const ev = await newEvent();
  await A.post(`/organizer/events/${ev}/cancel`);
  assert.equal((await A.post(`/organizer/events/${ev}`).type('form').send(form({ capacity: '9' }))).status, 409);
  assert.equal((await A.post(`/organizer/events/${ev}/publish`)).status, 409);
  assert.equal((await A.post(`/organizer/events/${ev}/cancel`)).status, 409);
  const page = await A.get(`/organizer/events/${ev}`);
  assert.doesNotMatch(page.text, /id="edit-form"/);
  assert.match(page.text, /data-event-cancelled/);
  assert.equal((await query('SELECT capacity FROM events WHERE id = $1', [ev])).rows[0].capacity, 5);
});

test('X15/X16: cancelado sai da vitrine e da API, e a compra pela API responde 404', async () => {
  const ev = await newEvent();
  const t = (await buy(ev, '4000000000000001')).ticket;
  await A.post(`/organizer/events/${ev}/cancel`);
  const home = await anon().get('/');
  assert.doesNotMatch(home.text, new RegExp(`data-event-id="${ev}"`));
  assert.equal((await anon().get(`/events/${ev}`)).status, 404);
  const list = await request(app).get('/api/partner/events').set('X-Api-Key', KEY);
  assert.ok(!list.body.some((e) => e.id === ev));
  const p = await request(app).post(`/api/partner/events/${ev}/purchases`).set('X-Api-Key', KEY)
    .send({ buyerEmail: 'a@example.com', cardNumber: '4000000000000001' });
  assert.equal(p.status, 404);
  assert.deepEqual(p.body, { error: 'event_not_available' });
  const tk = await request(app).get(`/api/partner/tickets/${t.id}`).set('X-Api-Key', KEY);
  assert.equal(tk.body.status, 'cancelled');
});

test('X17: check-in mostra "Evento cancelado" e o painel zera tudo menos estornados', async () => {
  const ev = await newEvent();
  const t1 = (await buy(ev, '4000000000000001')).ticket;
  const t2 = (await buy(ev, '4000000000000001')).ticket;
  assert.ok(await waitStatus(t1.id, 'confirmed', FAST_MS));
  assert.ok(await waitStatus(t2.id, 'confirmed', FAST_MS));
  await A.post(`/organizer/events/${ev}/checkin`).type('form').send({ code: t1.code });
  await A.post(`/organizer/events/${ev}/cancel`);
  const ci = await A.post(`/organizer/events/${ev}/checkin`).type('form').send({ code: t2.code });
  assert.match(ci.text, /<p id="checkin-result"[^>]*>\s*Evento cancelado\s*</);
  const page = await A.get(`/organizer/events/${ev}`);
  const metric = (m) => page.text.match(new RegExp(`data-metric="${m}"[^>]*>\\s*([^<]*?)\\s*<`))[1];
  assert.equal(metric('confirmed'), '0');
  assert.equal(metric('pending'), '0');
  assert.equal(metric('checkins'), '0');
  assert.equal(metric('available'), '0');
  assert.equal(metric('revenue'), 'R$ 0,00');
  assert.equal(metric('refunded'), '2');
});

test('corrida: cancelamento simultâneo a 10 compras não deixa ingresso pendente nem confirmado', async () => {
  for (let round = 0; round < 10; round++) {
    const ev = await newEvent({ capacity: '20' });
    await Promise.all([
      cancelEvent(orgAId, ev),
      ...Array.from({ length: 10 }, () => buy(ev, '4000000000000001')),
    ]);
    await sleep(FAST_MS);
    const { rows } = await query(
      `SELECT count(*) FILTER (WHERE status IN ('pending', 'confirmed')) AS live FROM tickets WHERE event_id = $1`, [ev],
    );
    assert.equal(rows[0].live, 0, `rodada ${round}`);
  }
});
