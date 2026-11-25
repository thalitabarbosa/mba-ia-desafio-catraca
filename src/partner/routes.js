// F05 — API de parceiros (contrato fixo do brief). Montada em /api/partner.
import express from 'express';
import { requireApiKey } from './auth.js';
import { validatePurchaseBody } from './validate.js';
import { partnerEvent, partnerPurchase, partnerTicket } from './format.js';
import { listOnSaleEvents } from '../events/repo.js';
import { purchaseTicket, seats, getTicket } from '../tickets/service.js';

const PURCHASE_ERRORS = {
  invalid_card: [422, 'invalid_request'],
  event_not_available: [404, 'event_not_available'],
  sold_out: [409, 'sold_out'],
};

const fail = (res, status, error) => res.status(status).json({ error });

const api = express.Router();
api.use(requireApiKey);
api.use(express.json({ type: () => true }));

api.get('/events', async (req, res) => {
  const events = await listOnSaleEvents();
  const out = [];
  for (const ev of events) {
    const s = await seats(ev.id);
    out.push(partnerEvent(ev, s ? s.available : 0));
  }
  res.json(out);
});

api.post('/events/:eventId/purchases', async (req, res) => {
  const body = validatePurchaseBody(req.body);
  if (!body) return fail(res, 422, 'invalid_request');
  const r = await purchaseTicket({ channel: 'partner', eventId: req.params.eventId, ...body });
  if (!r.ok) {
    const [status, code] = PURCHASE_ERRORS[r.error] || [500, 'internal_error'];
    return fail(res, status, code);
  }
  res.status(202).json(partnerPurchase(r.ticket));
});

api.get('/tickets/:ticketId', async (req, res) => {
  const ticket = await getTicket(req.params.ticketId);
  if (!ticket) return fail(res, 404, 'ticket_not_found');
  res.json(partnerTicket(ticket));
});

api.use((req, res) => fail(res, 404, 'not_found'));
// Corpo rejeitado pelo express.json (JSON inválido, grande demais, charset...) → 422; o resto vai ao handler global (500 JSON).
api.use((err, req, res, next) => {
  if (err?.type && err.status >= 400 && err.status < 500) return fail(res, 422, 'invalid_request');
  next(err);
});

export const partnerRouter = express.Router();
partnerRouter.use('/api/partner', api);
