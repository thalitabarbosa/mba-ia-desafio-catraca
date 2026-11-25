import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app, resetDb, pool, query, loginAs, anon, ORG_A, PART, localDate, sleep } from './helpers.js';
import { purchaseTicket } from '../src/tickets/service.js';
import { gatewayWorker } from '../src/tickets/worker.js';
import { config } from '../src/config.js';

let A; let P; let stopWorker;
before(async () => {
  await resetDb();
  A = await loginAs(ORG_A);
  P = await loginAs(PART);
  stopWorker = gatewayWorker.start(20);
});
after(async () => { stopWorker(); await pool.end(); });

const FAST_MS = 5000 * config.gatewayDelayScale + 1000;
const SLOW_MS = 40000 * config.gatewayDelayScale + 1000;

async function newEvent({ capacity = 5, price = '100,00', publish = true, name = `Show ${Math.random().toString(36).slice(2, 8)}` } = {}) {
  const res = await A.post('/organizer/events').type('form')
    .send({ name, startsAt: localDate(30, '21:00'), venue: 'Bar do Zé', capacity: String(capacity), price });
  assert.equal(res.status, 303);
  const id = res.headers.location.split('/').pop();
  if (publish) await A.post(`/organizer/events/${id}/publish`);
  return { id, name };
}

async function signup(name) {
  const agent = request.agent(app);
  const res = await agent.post('/signup').type('form')
    .send({ name, email: `${name.toLowerCase()}.${Date.now()}.${Math.random()}@example.com`, password: 'senha12345' });
  assert.equal(res.status, 303);
  return agent;
}

const myTickets = async (agent) => {
  const res = await agent.get('/my-tickets');
  assert.equal(res.status, 200);
  return [...res.text.matchAll(/data-ticket-code="([^"]+)" data-status="([^"]+)"/g)].map((m) => ({ code: m[1], status: m[2] }));
};

async function waitTicketStatus(agent, code, status, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if ((await myTickets(agent)).find((t) => t.code === code)?.status === status) return true;
    await sleep(20);
  }
  return (await myTickets(agent)).find((t) => t.code === code)?.status === status;
}

test('vitrine: rascunho não aparece; publicado aparece com data, local, preço e vagas (visitante)', async () => {
  const ev = await newEvent({ publish: false, price: '1.234,50', capacity: 3 });
  let res = await anon().get('/');
  assert.equal(res.status, 200);
  assert.doesNotMatch(res.text, new RegExp(`data-event-id="${ev.id}"`));
  assert.equal((await anon().get(`/events/${ev.id}`)).status, 404);

  await A.post(`/organizer/events/${ev.id}/publish`);
  res = await anon().get('/');
  assert.match(res.text, new RegExp(`<li data-event-id="${ev.id}">`));
  assert.match(res.text, new RegExp(ev.name));
  assert.match(res.text, new RegExp(`href="/events/${ev.id}"`));
  assert.match(res.text, /R\$ 1\.234,50/);
  assert.match(res.text, /\d{2}\/\d{2}\/\d{4} 21:00/);
  assert.match(res.text, /Bar do Zé/);
  assert.match(res.text, /3 vagas disponíveis/);
});

test('vitrine e detalhe: evento cancelado some e não vende', async () => {
  const ev = await newEvent();
  await query(`UPDATE events SET status = 'cancelled' WHERE id = $1`, [ev.id]);
  assert.doesNotMatch((await anon().get('/')).text, new RegExp(`data-event-id="${ev.id}"`));
  const res = await anon().get(`/events/${ev.id}`);
  assert.equal(res.status, 404);
  assert.match(res.text, /Evento indisponível/);
  assert.equal((await P.post(`/events/${ev.id}/purchase`).type('form').send({ cardNumber: '4000000000000001' })).status, 404);
  assert.equal((await anon().get('/events/evt_naoexiste')).status, 404);
});

test('visitante vê link de login e, ao tentar comprar, é levado ao login', async () => {
  const ev = await newEvent();
  const page = await anon().get(`/events/${ev.id}`);
  assert.equal(page.status, 200);
  assert.match(page.text, new RegExp(`href="/login\\?next=%2Fevents%2F${ev.id}"`));
  assert.doesNotMatch(page.text, /name="cardNumber"/);
  const res = await anon().post(`/events/${ev.id}/purchase`).type('form').send({ cardNumber: '4000000000000001' });
  assert.equal(res.status, 302);
  assert.match(res.headers.location, /^\/login/);
  const { rows } = await query('SELECT count(*)::int AS n FROM tickets WHERE event_id = $1', [ev.id]);
  assert.equal(rows[0].n, 0);
});

test('participante compra → 303 /my-tickets, pendente e depois confirmado; outro participante não vê', async () => {
  const ev = await newEvent();
  const ana = await signup('Ana');
  const page = await ana.get(`/events/${ev.id}`);
  assert.match(page.text, /name="cardNumber"/);

  const res = await ana.post(`/events/${ev.id}/purchase`).type('form').send({ cardNumber: '4000000000000001' });
  assert.equal(res.status, 303);
  assert.equal(res.headers.location, '/my-tickets');

  const [t] = await myTickets(ana);
  assert.equal(t.status, 'pending');
  const html = (await ana.get('/my-tickets')).text;
  assert.match(html, new RegExp(ev.name));
  assert.match(html, /pendente/);
  assert.match(html, new RegExp(t.code));

  assert.ok(await waitTicketStatus(ana, t.code, 'confirmed', FAST_MS));
  assert.match((await ana.get('/my-tickets')).text, /confirmado/);

  const { rows } = await query('SELECT channel, buyer_email FROM tickets WHERE code = $1', [t.code]);
  assert.equal(rows[0].channel, 'storefront');
  assert.match(rows[0].buyer_email, /^ana\./);

  const bia = await signup('Bia');
  const biaPage = await bia.get('/my-tickets');
  assert.doesNotMatch(biaPage.text, new RegExp(t.code));
  assert.match(biaPage.text, /Você ainda não tem ingressos/);
});

test('meus ingressos: mais recentes primeiro; organizador recebe 403; visitante vai ao login', async () => {
  const e1 = await newEvent();
  const e2 = await newEvent();
  const cris = await signup('Cris');
  await cris.post(`/events/${e1.id}/purchase`).type('form').send({ cardNumber: '4000000000000001' });
  await sleep(5);
  await cris.post(`/events/${e2.id}/purchase`).type('form').send({ cardNumber: '4000000000000002' });
  const html = (await cris.get('/my-tickets')).text;
  assert.ok(html.indexOf(e2.name) < html.indexOf(e1.name), 'mais recente primeiro');

  assert.equal((await A.get('/my-tickets')).status, 403);
  const v = await anon().get('/my-tickets');
  assert.equal(v.status, 302);
  assert.match(v.headers.location, /^\/login/);
});

test('cartão inválido → 422 com mensagem e sem ingresso', async () => {
  const ev = await newEvent();
  const res = await P.post(`/events/${ev.id}/purchase`).type('form').send({ cardNumber: '123' });
  assert.equal(res.status, 422);
  assert.match(res.text, /<p class="error">Número do cartão inválido \(16 dígitos\)<\/p>/);
  const { rows } = await query('SELECT count(*)::int AS n FROM tickets WHERE event_id = $1', [ev.id]);
  assert.equal(rows[0].n, 0);
});

test('lotado: detalhe mostra "Ingressos esgotados" sem formulário e compra responde 409', async () => {
  const ev = await newEvent({ capacity: 1 });
  const ana = await signup('Ana');
  assert.equal((await ana.post(`/events/${ev.id}/purchase`).type('form').send({ cardNumber: '4000000000000001' })).status, 303);

  const bia = await signup('Bia');
  const page = await bia.get(`/events/${ev.id}`);
  assert.equal(page.status, 200);
  assert.match(page.text, /Ingressos esgotados/);
  assert.doesNotMatch(page.text, /name="cardNumber"/);
  assert.match((await anon().get(`/events/${ev.id}`)).text, /Ingressos esgotados/);

  const res = await bia.post(`/events/${ev.id}/purchase`).type('form').send({ cardNumber: '4000000000000001' });
  assert.equal(res.status, 409);
  assert.match(res.text, /Ingressos esgotados/);
  assert.doesNotMatch(res.text, /name="cardNumber"/);
});

test('X06: pendente de outro canal segura a vaga até a recusa liberar', async () => {
  const ev = await newEvent({ capacity: 1 });
  const r = await purchaseTicket({ eventId: ev.id, channel: 'partner', buyerEmail: 'api@example.com', cardNumber: '4000000000000004' });
  assert.equal(r.ok, true);
  const page = await P.get(`/events/${ev.id}`);
  assert.match(page.text, /Ingressos esgotados/);
  assert.doesNotMatch(page.text, /name="cardNumber"/);

  const end = Date.now() + SLOW_MS;
  let freed = false;
  while (Date.now() < end && !freed) {
    freed = /name="cardNumber"/.test((await P.get(`/events/${ev.id}`)).text);
    if (!freed) await sleep(20);
  }
  assert.ok(freed, 'vaga liberada após a recusa');
  assert.doesNotMatch((await P.get(`/events/${ev.id}`)).text, /Ingressos esgotados/);
});
