import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { resetDb, pool, query, loginAs, anon, ORG_A, ORG_B, PART, localDate } from './helpers.js';
import { parsePriceCents, parseLocalDateTime } from '../src/events/validate.js';
import { isOnSale, listOnSaleEvents } from '../src/events/repo.js';

let A; let B;
before(async () => {
  await resetDb();
  A = await loginAs(ORG_A);
  B = await loginAs(ORG_B);
});
after(() => pool.end());

const eventForm = (over = {}) => ({ name: 'Jazz no Porão', startsAt: localDate(30), venue: 'Porão', capacity: '2', price: '100,00', ...over });

async function create(agent, over) {
  const res = await agent.post('/organizer/events').type('form').send(eventForm(over));
  return { res, id: res.headers.location?.split('/').pop() };
}

test('parser de preço aceita formatos brasileiros e rejeita lixo', () => {
  assert.equal(parsePriceCents('100'), 10000);
  assert.equal(parsePriceCents('100,00'), 10000);
  assert.equal(parsePriceCents('100.5'), 10050);
  assert.equal(parsePriceCents('1.234,56'), 123456);
  assert.equal(parsePriceCents('R$ 20'), 2000);
  assert.equal(parsePriceCents('abc'), null);
  assert.equal(parsePriceCents(''), null);
});

test('data local é interpretada em -03:00', () => {
  assert.equal(parseLocalDateTime('2026-12-05T21:00').toISOString(), '2026-12-06T00:00:00.000Z');
  assert.equal(parseLocalDateTime('05/12/2026'), null);
});

test('R01: cria evento válido como rascunho e redireciona para a página de gestão', async () => {
  const { res, id } = await create(A);
  assert.equal(res.status, 303);
  assert.match(id, /^evt_[a-z0-9]{8}$/);
  const page = await A.get(`/organizer/events/${id}`);
  assert.equal(page.status, 200);
  assert.match(page.text, /data-event-name>Jazz no Porão</);
  assert.match(page.text, /Rascunho/);
  assert.match(page.text, /id="edit-form"/);
});

test('R01: campos inválidos são rejeitados com 422', async () => {
  for (const over of [{ name: '' }, { venue: '' }, { capacity: '0' }, { capacity: '1.5' }, { price: '0' }, { price: '' }, { startsAt: '' }]) {
    const { res } = await create(A, over);
    assert.equal(res.status, 422, JSON.stringify(over));
    assert.match(res.text, /class="error"/);
  }
});

test('R01: data no passado é rejeitada ao criar e ao editar', async () => {
  const { res } = await create(A, { startsAt: localDate(-1) });
  assert.equal(res.status, 422);
  assert.match(res.text, /A data de início precisa estar no futuro/);
  const { id } = await create(A);
  const edit = await A.post(`/organizer/events/${id}`).type('form').send(eventForm({ startsAt: localDate(-1) }));
  assert.equal(edit.status, 422);
});

test('R02: rascunho fora da lista à venda; publicado entra', async () => {
  const { id } = await create(A);
  assert.ok(!(await listOnSaleEvents()).some((e) => e.id === id));
  const pub = await A.post(`/organizer/events/${id}/publish`);
  assert.equal(pub.status, 303);
  const onSale = await listOnSaleEvents();
  const ev = onSale.find((e) => e.id === id);
  assert.ok(ev && isOnSale(ev));
  const page = await A.get(`/organizer/events/${id}`);
  assert.match(page.text, /Publicado/);
  assert.doesNotMatch(page.text, /\/publish"/);
});

test('R03: aumentar lotação é aceito; reduzir abaixo das ocupadas é rejeitado', async () => {
  const { id } = await create(A, { capacity: '3' });
  const up = await A.post(`/organizer/events/${id}`).type('form').send(eventForm({ capacity: '5', price: '150,00' }));
  assert.equal(up.status, 303);
  const { rows } = await query('SELECT capacity, price_cents FROM events WHERE id = $1', [id]);
  assert.deepEqual(rows[0], { capacity: 5, price_cents: 15000 });

  const hasTickets = (await query(`SELECT to_regclass('public.tickets') AS t`)).rows[0].t;
  if (hasTickets) {
    await query(`INSERT INTO tickets (id, event_id, code, channel, buyer_email, card_last4, price_cents, status, gateway_result, gateway_due_at)
                 VALUES ('tkt_t1', $1, 'TESTE001', 'partner', 'a@x.com', '0001', 100, 'pending', 'approved', now() + interval '1 hour'),
                        ('tkt_t2', $1, 'TESTE002', 'partner', 'b@x.com', '0001', 100, 'confirmed', 'approved', now())`, [id]);
    const down = await A.post(`/organizer/events/${id}`).type('form').send(eventForm({ capacity: '1' }));
    assert.equal(down.status, 422);
    assert.match(down.text, /vagas ocupadas \(2\)/);
    const same = await A.post(`/organizer/events/${id}`).type('form').send(eventForm({ capacity: '2' }));
    assert.equal(same.status, 303);
  }
});

test('R13: organizador B não vê nem opera evento de A', async () => {
  const { id } = await create(A, { name: 'Segredo do A' });
  const list = await B.get('/organizer');
  assert.equal(list.status, 200);
  assert.doesNotMatch(list.text, new RegExp(id));
  const page = await B.get(`/organizer/events/${id}`);
  assert.equal(page.status, 404);
  assert.doesNotMatch(page.text, /Segredo do A/);
  assert.equal((await B.post(`/organizer/events/${id}/publish`)).status, 404);
  assert.equal((await B.post(`/organizer/events/${id}`).type('form').send(eventForm())).status, 404);
  const listA = await A.get('/organizer');
  assert.match(listA.text, new RegExp(`data-event-id="${id}"`));
});

test('R13: participante e visitante não acessam a página de gestão', async () => {
  const { id } = await create(A, { name: 'Privado' });
  const part = await loginAs(PART);
  const p = await part.get(`/organizer/events/${id}`);
  assert.equal(p.status, 403);
  assert.doesNotMatch(p.text, /Privado/);
  const v = await anon().get(`/organizer/events/${id}`);
  assert.equal(v.status, 302);
});

test('evento cancelado não pode ser editado nem publicado e não mostra edição', async () => {
  const { id } = await create(A, { name: 'Vai cancelar' });
  await query(`UPDATE events SET status = 'cancelled', cancelled_at = now() WHERE id = $1`, [id]);
  assert.equal((await A.post(`/organizer/events/${id}`).type('form').send(eventForm())).status, 409);
  assert.equal((await A.post(`/organizer/events/${id}/publish`)).status, 409);
  const page = await A.get(`/organizer/events/${id}`);
  assert.doesNotMatch(page.text, /id="edit-form"/);
  assert.match(page.text, /Cancelado/);
});
