import { Router } from 'express';
import { requireOrganizer } from '../auth/guards.js';
import { formatDateTime, formatMoney } from '../format.js';
import {
  createEvent, updateEvent, publishEvent, getOwnedEvent, listOwnedEvents,
  ValidationError, NotFoundError, ConflictError,
} from './repo.js';
import { renderManagePage } from './manage-page.js';

export const eventsRouter = Router();
eventsRouter.use('/organizer', requireOrganizer);

const STATUS_TEXT = { draft: 'Rascunho', published: 'Publicado', cancelled: 'Cancelado' };
const formOf = (b) => ({ name: b.name ?? '', venue: b.venue ?? '', startsAt: b.startsAt ?? '', capacity: b.capacity ?? '', price: b.price ?? '' });

export const notFound = (res) =>
  res.status(404).render('error', { title: 'Evento não encontrado', message: 'Evento não encontrado.' });

/** Carrega o evento do organizador logado ou responde 404 sem nenhum dado (R13). */
export async function loadOwned(req, res) {
  const event = await getOwnedEvent(req.user.id, req.params.id);
  if (!event) notFound(res);
  return event;
}

eventsRouter.get('/organizer', async (req, res) => {
  const events = await listOwnedEvents(req.user.id);
  res.render('events/list', { title: 'Meus eventos', events, STATUS_TEXT, formatDateTime, formatMoney });
});

eventsRouter.get('/organizer/events/new', (req, res) => {
  res.render('events/new', { title: 'Novo evento', errors: [], form: formOf({}) });
});

eventsRouter.post('/organizer/events', async (req, res) => {
  try {
    const event = await createEvent(req.user.id, req.body);
    res.redirect(303, `/organizer/events/${event.id}`);
  } catch (err) {
    if (!(err instanceof ValidationError)) throw err;
    res.status(422).render('events/new', { title: 'Novo evento', errors: err.messages, form: formOf(req.body) });
  }
});

eventsRouter.get('/organizer/events/:id', async (req, res) => {
  const event = await loadOwned(req, res);
  if (event) await renderManagePage(req, res, event);
});

eventsRouter.post('/organizer/events/:id', async (req, res) => {
  const event = await loadOwned(req, res);
  if (!event) return;
  try {
    await updateEvent(req.user.id, event.id, req.body);
    res.redirect(303, `/organizer/events/${event.id}`);
  } catch (err) {
    if (err instanceof NotFoundError) return notFound(res);
    if (err instanceof ConflictError) return renderManagePage(req, res, event, { errors: [err.message] }, 409);
    if (err instanceof ValidationError) {
      return renderManagePage(req, res, event, { errors: err.messages, formValues: formOf(req.body) }, 422);
    }
    throw err;
  }
});

eventsRouter.post('/organizer/events/:id/publish', async (req, res) => {
  const event = await loadOwned(req, res);
  if (!event) return;
  try {
    await publishEvent(req.user.id, event.id);
    res.redirect(303, `/organizer/events/${event.id}`);
  } catch (err) {
    if (err instanceof NotFoundError) return notFound(res);
    if (err instanceof ConflictError) return renderManagePage(req, res, event, { errors: [err.message] }, 409);
    throw err;
  }
});
