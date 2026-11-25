import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { resetDb, pool, query, loginAs, anon, ORG_A, ORG_B, PART, localDate, sleep } from './helpers.js';
import { purchaseTicket, getTicket } from '../src/tickets/service.js';
import { gatewayWorker } from '../src/tickets/worker.js';
import { config } from '../src/config.js';
import { checkIn, panelMetrics, formatBRL, CHECKIN_MESSAGES } from '../src/checkin/service.js';

let A; let B; let S; let stopWorker;
before(async () => {
  await resetDb();
  [A, B, S] = await Promise.all([loginAs(ORG_A), loginAs(ORG_B), loginAs(PART)]);
  stopWorker = gatewayWorker.start(20);
});
after(async () => { stopWorker(); await pool.end(); });

const FAST_MS = 5000 * config.gatewayDelayScale + 1000;

async function newEvent(agent, { capacity = 5, price = '100,00' } = {}) {
  const res = await agent.post('/organizer/events').type('form')
    .send({ name: `Ev ${Math.random()}`, startsAt: localDate(30), venue: 'Bar', capacity: String(capacity), price });
  const id = res.headers.location.split('/').pop();
  await agent.post(`/organizer/events/${id}/publish`);
  return id;
}
async function setPrice(agent, id, capacity, price) {
  const res = await agent.post(`/organizer/events/${id}`).type('form')
    .send({ name: 'Ev', startsAt: localDate(30), venue: 'Bar', capacity: String(capacity), price });
  assert.equal(res.status, 303);
}
async function buy(eventId, { card = '4000000000000001', channel = 'partner', buyerUserId = null } = {}) {
  const r = await purchaseTicket({ eventId, channel, buyerUserId, buyerEmail: 'p@example.com', cardNumber: card });
  assert.equal(r.ok, true);
  return r.ticket;
}
async function waitStatus(id, status, ms = FAST_MS) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if ((await getTicket(id)).status === status) return;
    await sleep(10);
  }
  assert.equal((await getTicket(id)).status, status);
}
const metric = (html, name) => html.match(new RegExp(`data-metric="${name}"[^>]*>([^<]*)<`))?.[1].trim();
const result = (html) => html.match(/<p id="checkin-result">([^<]*)</)?.[1].trim();

test('as cinco mensagens do check-in, na ordem do brief (R10)', async () => {
  const ev = await newEvent(A, { capacity: 10 });
  const ok = await buy(ev);
  const pend = await buy(ev, { card: '4000000000000003' }); // lento: segue pendente
  const decl = await buy(ev, { card: '4000000000000002' });
  await waitStatus(ok.id, 'confirmed');
  await waitStatus(decl.id, 'declined');

  assert.equal(await checkIn(ev, 'ZZZZZZZZ'), 'invalid');
  assert.equal(await checkIn(ev, ''), 'invalid');
  assert.equal(await checkIn(ev, pend.code), 'not_confirmed');
  assert.equal(await checkIn(ev, decl.code), 'not_confirmed');
  assert.equal(await checkIn(ev, ` ${ok.code.toLowerCase()} `), 'ok', 'código normalizado (trim/upper)');
  assert.equal(await checkIn(ev, ok.code), 'already_used');

  // Código válido de outro evento (do organizador B) é inválido aqui.
  const evB = await newEvent(B);
  const tB = await buy(evB);
  await waitStatus(tB.id, 'confirmed');
  assert.equal(await checkIn(ev, tB.code), 'invalid');

  // Evento cancelado vence "não confirmado" e "já utilizado", mas não "inválido".
  await query(`UPDATE events SET status = 'cancelled' WHERE id = $1`, [ev]);
  assert.equal(await checkIn(ev, ok.code), 'event_cancelled');
  assert.equal(await checkIn(ev, pend.code), 'event_cancelled');
  assert.equal(await checkIn(ev, 'ZZZZZZZZ'), 'invalid');

  assert.deepEqual(Object.values(CHECKIN_MESSAGES).sort(), [
    'Entrada liberada', 'Evento cancelado', 'Ingresso inválido para este evento',
    'Ingresso já utilizado', 'Ingresso não confirmado',
  ].sort());
});

test('check-in concorrente do mesmo código: 1 liberada + 1 já utilizado (F06-AC02), 20 rodadas', async () => {
  const ev = await newEvent(A, { capacity: 30 });
  const tickets = [];
  for (let i = 0; i < 20; i++) tickets.push(await buy(ev));
  for (const t of tickets) await waitStatus(t.id, 'confirmed');
  for (const t of tickets) {
    const rs = await Promise.all([checkIn(ev, t.code), checkIn(ev, t.code)]);
    assert.deepEqual(rs.sort(), ['already_used', 'ok']);
  }
  // E pela rota HTTP
  const t = await buy(ev);
  await waitStatus(t.id, 'confirmed');
  const pages = await Promise.all([1, 2].map(() =>
    A.post(`/organizer/events/${ev}/checkin`).type('form').send({ code: t.code })));
  assert.deepEqual(pages.map((p) => result(p.text)).sort(), ['Entrada liberada', 'Ingresso já utilizado']);
});

test('painel: dois canais, preços diferentes, pendente, check-in e estornado (R12)', async () => {
  const ev = await newEvent(A, { capacity: 6, price: '100,00' });
  const part = (await query(`SELECT id FROM users WHERE email = $1`, [PART])).rows[0].id;
  const ca = await buy(ev, { channel: 'storefront', buyerUserId: part });
  const cb = await buy(ev);
  await waitStatus(ca.id, 'confirmed'); await waitStatus(cb.id, 'confirmed');
  await setPrice(A, ev, 6, '150,00');
  const cc = await buy(ev);
  const cd = await buy(ev, { card: '4000000000000003' });
  await waitStatus(cc.id, 'confirmed');

  assert.deepEqual(await panelMetrics(ev),
    { confirmed: 3, pending: 1, checkins: 0, available: 2, revenueCents: 35000, refunded: 0 });

  let page = (await A.get(`/organizer/events/${ev}`)).text;
  assert.deepEqual(['confirmed', 'pending', 'checkins', 'available', 'revenue', 'refunded'].map((m) => metric(page, m)),
    ['3', '1', '0', '2', 'R$ 350,00', '0']);
  for (const label of ['Confirmados', 'Pendentes', 'Check-ins', 'Vagas disponíveis', 'Receita', 'Estornados']) {
    assert.ok(page.includes(`<dt>${label}</dt>`), label);
  }
  assert.match(page, /id="checkin-form"/);

  const r = await A.post(`/organizer/events/${ev}/checkin`).type('form').send({ code: cb.code });
  assert.equal(r.status, 200);
  assert.equal(result(r.text), 'Entrada liberada', 'ingresso do canal parceiro libera entrada');
  assert.equal(metric(r.text, 'checkins'), '1');
  assert.equal(result((await A.post(`/organizer/events/${ev}/checkin`).type('form').send({ code: cd.code })).text),
    'Ingresso não confirmado');

  await query(`UPDATE tickets SET status = 'refunded' WHERE id = $1`, [ca.id]);
  page = (await A.get(`/organizer/events/${ev}`)).text;
  assert.equal(metric(page, 'refunded'), '1');
  assert.equal(metric(page, 'confirmed'), '2');
  assert.equal(metric(page, 'revenue'), 'R$ 250,00', 'estornado nunca soma');

  await query(`UPDATE events SET status = 'cancelled' WHERE id = $1`, [ev]);
  page = (await A.post(`/organizer/events/${ev}/checkin`).type('form').send({ code: cc.code })).text;
  assert.equal(result(page), 'Evento cancelado');
  assert.equal(metric(page, 'available'), '0');
  assert.match(page, /id="checkin-form"/, 'formulário segue disponível no evento cancelado');
});

test('acesso: só o dono vê painel e faz check-in (R04, R13)', async () => {
  const ev = await newEvent(A);
  const t = await buy(ev);
  await waitStatus(t.id, 'confirmed');

  const getB = await B.get(`/organizer/events/${ev}`);
  assert.equal(getB.status, 404);
  assert.ok(!getB.text.includes('data-metric') && !getB.text.includes('Painel'));
  const postB = await B.post(`/organizer/events/${ev}/checkin`).type('form').send({ code: t.code });
  assert.equal(postB.status, 404);
  assert.ok(!postB.text.includes('checkin-result') && !postB.text.includes('data-metric'));
  assert.equal((await getTicket(t.id)).checkedIn, false, 'B não consegue fazer check-in');

  const getS = await S.get(`/organizer/events/${ev}`);
  assert.equal(getS.status, 403);
  assert.ok(!getS.text.includes('data-metric'));
  assert.equal((await S.post(`/organizer/events/${ev}/checkin`).type('form').send({ code: t.code })).status, 403);

  const getV = await anon().get(`/organizer/events/${ev}`);
  assert.equal(getV.status, 302);
  assert.match(getV.headers.location, /^\/login/);
  const postV = await anon().post(`/organizer/events/${ev}/checkin`).type('form').send({ code: t.code });
  assert.equal(postV.status, 302);
  assert.equal((await getTicket(t.id)).checkedIn, false);
});

test('formatBRL usa espaço comum e separador de milhar', () => {
  assert.equal(formatBRL(35000), 'R$ 350,00');
  assert.equal(formatBRL(123456), 'R$ 1.234,56');
  assert.equal(formatBRL(0), 'R$ 0,00');
});
