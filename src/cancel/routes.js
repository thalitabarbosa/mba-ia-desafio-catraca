// F07 — rota de cancelamento e slot na página de gestão.
import { Router } from 'express';
import { requireOrganizer } from '../auth/guards.js';
import { loadOwned, notFound } from '../events/routes.js';
import { getOwnedEvent } from '../events/repo.js';
import { registerManageSlot, renderManagePage } from '../events/manage-page.js';
import { formatDateTime } from '../format.js';
import { cancelEvent, CancelError } from './service.js';

registerManageSlot({
  name: 'cancel',
  order: 90,
  view: 'cancel/slot',
  load: async (event) => ({ cancelledAtText: event.cancelledAt ? formatDateTime(event.cancelledAt) : null }),
});

export const cancelRouter = Router();

cancelRouter.post('/organizer/events/:id/cancel', requireOrganizer, async (req, res) => {
  const event = await loadOwned(req, res); // 404 sem dados se não for o dono (R13)
  if (!event) return;
  try {
    await cancelEvent(req.user.id, event.id);
    res.redirect(303, `/organizer/events/${event.id}`);
  } catch (err) {
    if (!(err instanceof CancelError)) throw err;
    if (err.kind === 'not_found') return notFound(res);
    const fresh = await getOwnedEvent(req.user.id, event.id);
    await renderManagePage(req, res, fresh, { errors: [err.message] }, 409);
  }
});
