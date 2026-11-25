// Página de gestão do evento (R04) com slots: F06 (painel, check-in) e F07 (cancelamento)
// registram partials aqui em vez de editar a view da F02.
import { formatDateTime, formatMoney, toLocalInput, centsToInput } from '../format.js';

const slots = [];

/**
 * registerManageSlot({ name, order, view, load })
 *  - view: caminho do partial relativo a src/views (ex.: 'checkin/slot')
 *  - load: async (event, req, extra) => objeto de locals do partial
 */
export function registerManageSlot(slot) {
  if (slots.some((s) => s.name === slot.name)) return;
  slots.push(slot);
  slots.sort((a, b) => a.order - b.order);
}

const STATUS_TEXT = { draft: 'Rascunho', published: 'Publicado', cancelled: 'Cancelado' };

export async function renderManagePage(req, res, event, extra = {}, status = 200) {
  const rendered = [];
  for (const slot of slots) {
    rendered.push({ view: slot.view, locals: { event, ...(await slot.load(event, req, extra)), ...extra } });
  }
  const form = extra.formValues || {
    name: event.name,
    venue: event.venue,
    startsAt: toLocalInput(event.startsAt),
    capacity: String(event.capacity),
    price: centsToInput(event.priceCents),
  };
  res.status(status).render('events/manage', {
    title: event.name,
    event,
    statusText: STATUS_TEXT[event.status],
    form,
    errors: extra.errors || [],
    notice: extra.notice || null,
    slots: rendered,
    formatDateTime,
    formatMoney,
  });
}
