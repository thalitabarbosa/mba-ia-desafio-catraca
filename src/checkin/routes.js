// F06 — rota de check-in e registro dos slots (painel e check-in) na página de gestão da F02.
import { Router } from 'express';
import { requireOrganizer } from '../auth/guards.js';
import { loadOwned } from '../events/routes.js';
import { registerManageSlot, renderManagePage } from '../events/manage-page.js';
import { checkIn, panelMetrics, formatBRL, CHECKIN_MESSAGES } from './service.js';

registerManageSlot({
  name: 'panel',
  order: 10,
  view: 'checkin/panel',
  load: async (event) => {
    const m = await panelMetrics(event.id);
    return { metrics: m, revenueText: formatBRL(m.revenueCents) };
  },
});

registerManageSlot({
  name: 'checkin',
  order: 20,
  view: 'checkin/slot',
  load: async (event, req, extra) => ({ checkinResult: extra.checkinResult ?? null }),
});

export const checkinRouter = Router();

checkinRouter.post('/organizer/events/:id/checkin', requireOrganizer, async (req, res) => {
  const event = await loadOwned(req, res); // 404 sem dados se não for o dono (R13)
  if (!event) return;
  const result = await checkIn(event.id, req.body?.code);
  await renderManagePage(req, res, event, { checkinResult: CHECKIN_MESSAGES[result] }, 200);
});
