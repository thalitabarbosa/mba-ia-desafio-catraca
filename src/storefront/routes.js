// F04 — vitrine, detalhe/compra e "Meus ingressos". Só consome interfaces providas:
// eventos (F02: listOnSaleEvents/getEvent/isOnSale) e ingressos (F03: purchaseTicket/seats/listTicketsByUser).
import { Router } from 'express';
import { requireParticipant } from '../auth/guards.js';
import { formatDateTime, formatMoney } from '../format.js';
import { listOnSaleEvents, getEvent, isOnSale } from '../events/repo.js';
import { purchaseTicket, seats, listTicketsByUser, STATUS_LABEL } from '../tickets/service.js';

export const storefrontRouter = Router();

const helpers = { formatDateTime, formatMoney };

const unavailable = (res) =>
  res.status(404).render('error', { title: 'Evento indisponível', message: 'Evento indisponível.' });

/** Evento à venda (R02) com vagas (R05), ou null se não está à venda. */
async function loadOnSale(eventId) {
  const event = await getEvent(eventId);
  if (!isOnSale(event)) return null;
  return { event, seats: await seats(event.id) };
}

function renderEvent(res, { event, seats: s }, { status = 200, errors = [] } = {}) {
  res.status(status).render('storefront/event', {
    title: event.name, event, available: s.available, soldOut: s.available === 0, errors, ...helpers,
  });
}

storefrontRouter.get('/', async (req, res) => {
  const events = await listOnSaleEvents();
  const items = await Promise.all(events.map(async (event) => ({ event, available: (await seats(event.id)).available })));
  res.render('storefront/index', { title: 'Vitrine', items, ...helpers });
});

storefrontRouter.get('/events/:id', async (req, res) => {
  const data = await loadOnSale(req.params.id);
  if (!data) return unavailable(res);
  renderEvent(res, data);
});

storefrontRouter.post('/events/:id/purchase', requireParticipant, async (req, res) => {
  const result = await purchaseTicket({
    eventId: req.params.id,
    channel: 'storefront',
    buyerUserId: req.user.id,
    buyerEmail: req.user.email,
    cardNumber: String(req.body.cardNumber ?? '').trim(),
  });
  if (result.ok) return res.redirect(303, '/my-tickets');
  if (result.error === 'event_not_available') return unavailable(res);

  const data = await loadOnSale(req.params.id);
  if (!data) return unavailable(res);
  if (result.error === 'sold_out') {
    // Mesmo que uma vaga tenha sido liberada entre a compra e a renderização, a resposta é "esgotado".
    return renderEvent(res, { ...data, seats: { ...data.seats, available: 0 } }, { status: 409 });
  }
  if (result.error === 'invalid_card') {
    return renderEvent(res, data, { status: 422, errors: ['Número do cartão inválido (16 dígitos)'] });
  }
  throw new Error(`erro de compra inesperado: ${result.error}`);
});

storefrontRouter.get('/my-tickets', requireParticipant, async (req, res) => {
  const tickets = await listTicketsByUser(req.user.id);
  res.render('storefront/my-tickets', { title: 'Meus ingressos', tickets, STATUS_LABEL, ...helpers });
});
