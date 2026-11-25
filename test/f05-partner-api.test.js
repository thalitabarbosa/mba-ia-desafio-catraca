import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { resetDb, pool, query, loginAs, anon, ORG_A, localDate, sleep } from './helpers.js';
import { purchaseTicket, getTicket } from '../src/tickets/service.js';
import { gatewayWorker } from '../src/tickets/worker.js';
import { config } from '../src/config.js';
import { toPartnerDate } from '../src/partner/format.js';

const KEY = config.partnerApiKey;
const FAST_MS = 5000 * config.gatewayDelayScale + 1000;
const SLOW_MS = 40000 * config.gatewayDelayScale + 1000;

let A; let stopWorker;
before(async () => {
  await resetDb();
  A = await loginAs(ORG_A);
  stopWorker = gatewayWorker.start(20);
});
after(async () => { stopWorker(); await pool.end(); });

async function newEvent({ capacity = 5, price = '100,00', publish = true, name = `Ev ${Math.random()}` } = {}) {
  const res = await A.post('/organizer/events').type('form')
    .send({ name, startsAt: localDate(30), venue: 'Bar', capacity: String(capacity), price });
  const id = res.headers.location.split('/').pop();
  if (publish) await A.post(`/organizer/events/${id}/publish`);
  return id;
}

const get = (path, key = KEY) => {
  const r = anon().get(`/api/partner${path}`);
  return key === null ? r : r.set('X-Api-Key', key);
};
const buy = (eventId, body, key = KEY) => {
  const r = anon().post(`/api/partner/events/${eventId}/purchases`);
  return (key === null ? r : r.set('X-Api-Key', key)).send(body);
};
const okBody = (email = 'p@example.com', card = '4000000000000001') => ({ buyerEmail: email, cardNumber: card });
const list = async () => (await get('/events')).body;

function assertJsonError(res, status, error) {
  assert.equal(res.status, status);
  assert.match(res.headers['content-type'], /application\/json/);
  assert.deepEqual(res.body, { error });
}

async function waitStatus(id, status, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if ((await getTicket(id)).status === status) return true;
    await sleep(10);
  }
  return (await getTicket(id)).status === status;
}

test('F05-AC02/X07: sem chave ou com chave errada → 401 nas três rotas', async () => {
  const ev = await newEvent();
  for (const key of [null, 'errada', '', `${KEY}x`, KEY.slice(0, -1)]) {
    assertJsonError(await get('/events', key), 401, 'unauthorized');
    assertJsonError(await buy(ev, okBody(), key), 401, 'unauthorized');
    assertJsonError(await get('/tickets/tkt_qualquer', key), 401, 'unauthorized');
  }
  // chave errada vem antes do corpo inválido e da rota desconhecida
  assertJsonError(await buy('evt_naoexiste', 'nao-json', 'errada'), 401, 'unauthorized');
  assertJsonError(await get('/nada', 'errada'), 401, 'unauthorized');
  assert.equal((await query('SELECT count(*)::int AS n FROM tickets WHERE event_id = $1', [ev])).rows[0].n, 0);
});

test('F05-AC04/X08: listagem só com publicados, formato exato', async () => {
  const draft = await newEvent({ publish: false });
  assert.equal((await list()).find((e) => e.id === draft), undefined);

  const ev = await newEvent({ capacity: 2, price: '100,00', name: 'Show da API' });
  const res = await get('/events');
  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'], /application\/json/);
  assert.ok(Array.isArray(res.body));
  const item = res.body.find((e) => e.id === ev);
  assert.deepEqual(Object.keys(item).sort(), ['availableSeats', 'id', 'name', 'priceCents', 'startsAt']);
  assert.equal(item.name, 'Show da API');
  assert.equal(item.priceCents, 10000);
  assert.equal(item.availableSeats, 2);
  assert.match(item.startsAt, /^\d{4}-\d{2}-\d{2}T21:00:00-03:00$/);
  assert.equal(item.startsAt, `${localDate(30)}:00-03:00`);
  for (const e of res.body) assert.equal((await query('SELECT status FROM events WHERE id = $1', [e.id])).rows[0].status, 'published');
});

test('formatador de data: ISO com segundos e -03:00', () => {
  assert.equal(toPartnerDate(new Date('2026-12-06T00:00:00Z')), '2026-12-05T21:00:00-03:00');
  assert.equal(toPartnerDate(new Date('2026-01-01T02:59:07Z')), '2025-12-31T23:59:07-03:00');
});

test('F05-AC01/X09: compra 202 pending, ocupa vaga e confirma pelo gateway', async () => {
  const ev = await newEvent({ capacity: 2 });
  const t0 = Date.now();
  const res = await buy(ev, okBody('t1@ex.com', '4000000000000001'));
  assert.ok(Date.now() - t0 < 1000, 'responde sem esperar o gateway');
  assert.equal(res.status, 202);
  assert.match(res.headers['content-type'], /application\/json/);
  assert.deepEqual(Object.keys(res.body).sort(), ['code', 'status', 'ticketId']);
  assert.equal(res.body.status, 'pending');
  assert.equal(typeof res.body.ticketId, 'string');
  assert.equal(typeof res.body.code, 'string');
  assert.equal((await list()).find((e) => e.id === ev).availableSeats, 1);

  const row = (await query('SELECT channel, buyer_email, buyer_user_id FROM tickets WHERE id = $1', [res.body.ticketId])).rows[0];
  assert.deepEqual(row, { channel: 'partner', buyer_email: 't1@ex.com', buyer_user_id: null });

  const pend = await get(`/tickets/${res.body.ticketId}`);
  assert.equal(pend.status, 200);
  assert.deepEqual(pend.body, { ticketId: res.body.ticketId, code: res.body.code, eventId: ev, status: 'pending', checkedIn: false });

  assert.ok(await waitStatus(res.body.ticketId, 'confirmed', FAST_MS));
  const conf = await get(`/tickets/${res.body.ticketId}`);
  assert.deepEqual(conf.body, { ticketId: res.body.ticketId, code: res.body.code, eventId: ev, status: 'confirmed', checkedIn: false });
});

test('X09: recusa lenta libera a vaga; lotado → 409 sold_out', async () => {
  const ev = await newEvent({ capacity: 2 });
  assert.equal((await buy(ev, okBody('a@ex.com', '4000000000000001'))).status, 202);
  const t2 = await buy(ev, okBody('b@ex.com', '4000000000000004'));
  assert.equal(t2.status, 202);
  assertJsonError(await buy(ev, okBody('c@ex.com', '4000000000000001')), 409, 'sold_out');
  assert.equal((await list()).find((e) => e.id === ev).availableSeats, 0);

  assert.ok(await waitStatus(t2.body.ticketId, 'declined', SLOW_MS));
  assert.equal((await get(`/tickets/${t2.body.ticketId}`)).body.status, 'declined');
  assert.equal((await list()).find((e) => e.id === ev).availableSeats, 1);
});

test('F05-AC03: corpo inválido → 422 invalid_request, antes de olhar o evento', async () => {
  const ev = await newEvent({ capacity: 1 });
  const bad = [
    { buyerEmail: 'email-invalido', cardNumber: '4000000000000001' },
    { cardNumber: '4000000000000001' },
    { buyerEmail: 'x@ex.com' },
    { buyerEmail: 'x@ex.com', cardNumber: '123' },
    { buyerEmail: 'x@ex.com', cardNumber: 4000000000000001 },
    { buyerEmail: 'x@ex.com', cardNumber: '4000 0000 0000 0001' },
    { buyerEmail: 'x@ex.com', cardNumber: '40000000000000012' },
    { buyerEmail: ['x@ex.com'], cardNumber: '4000000000000001' },
    [],
    {},
  ];
  for (const body of bad) assertJsonError(await buy(ev, body), 422, 'invalid_request');
  // JSON malformado / sem corpo
  assertJsonError(await anon().post(`/api/partner/events/${ev}/purchases`).set('X-Api-Key', KEY)
    .set('Content-Type', 'application/json').send('nao-json'), 422, 'invalid_request');
  assertJsonError(await anon().post(`/api/partner/events/${ev}/purchases`).set('X-Api-Key', KEY), 422, 'invalid_request');
  // corpo inválido em evento inexistente → 422 (corpo antes do evento)
  assertJsonError(await buy('evt_naoexiste', okBody('x@ex.com', '123')), 422, 'invalid_request');
  assert.equal((await query('SELECT count(*)::int AS n FROM tickets WHERE event_id = $1', [ev])).rows[0].n, 0);

  // lotado + corpo inválido → 422; lotado + corpo válido → 409
  assert.equal((await buy(ev, okBody())).status, 202);
  assertJsonError(await buy(ev, okBody('x@ex.com', '12')), 422, 'invalid_request');
  assertJsonError(await buy(ev, okBody()), 409, 'sold_out');
});

test('F05-AC03: evento rascunho ou inexistente → 404 event_not_available', async () => {
  const draft = await newEvent({ publish: false, capacity: 1 });
  assertJsonError(await buy(draft, okBody()), 404, 'event_not_available');
  assertJsonError(await buy('evt_naoexiste', okBody()), 404, 'event_not_available');
  assert.equal((await query('SELECT count(*)::int AS n FROM tickets WHERE event_id = $1', [draft])).rows[0].n, 0);
});

test('F05-AC05: ingresso inexistente → 404 ticket_not_found; rota desconhecida → 404 not_found', async () => {
  assertJsonError(await get('/tickets/tkt_naoexiste'), 404, 'ticket_not_found');
  assertJsonError(await get('/nada'), 404, 'not_found');
  assertJsonError(await anon().delete('/api/partner/events').set('X-Api-Key', KEY), 404, 'not_found');
});

test('consulta vale para ingresso comprado pela vitrine', async () => {
  const ev = await newEvent({ capacity: 3 });
  const r = await purchaseTicket({ eventId: ev, channel: 'storefront', buyerEmail: 'participante@catraca.dev', cardNumber: '4000000000000001' });
  assert.equal(r.ok, true);
  const res = await get(`/tickets/${r.ticket.id}`);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { ticketId: r.ticket.id, code: r.ticket.code, eventId: ev, status: 'pending', checkedIn: false });
  await query('UPDATE tickets SET checked_in_at = now() WHERE id = $1', [r.ticket.id]);
  assert.equal((await get(`/tickets/${r.ticket.id}`)).body.checkedIn, true);
});

test('X09: 30 compras simultâneas em lotação 5 → 5×202 e 25×409, duas rodadas', async () => {
  for (let round = 0; round < 2; round++) {
    const ev = await newEvent({ capacity: 5 });
    const results = await Promise.all(Array.from({ length: 30 }, (_, i) =>
      buy(ev, okBody(`b${i}@ex.com`, '4000000000000001'))));
    const by = (s) => results.filter((r) => r.status === s).length;
    assert.equal(by(202), 5, `rodada ${round}`);
    assert.equal(by(409), 25, `rodada ${round}`);
    for (const r of results.filter((x) => x.status === 409)) assert.deepEqual(r.body, { error: 'sold_out' });
    assert.equal((await query('SELECT count(*)::int AS n FROM tickets WHERE event_id = $1', [ev])).rows[0].n, 5);
    assert.equal((await list()).find((e) => e.id === ev).availableSeats, 0);
  }
});
