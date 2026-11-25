// F05 — formatos de resposta do contrato fixo da API de parceiros.
import { toIsoOffset } from '../format.js';

/** 2026-12-05T21:00:00-03:00 */
export const toPartnerDate = (date) => toIsoOffset(date);

export const partnerEvent = (event, availableSeats) => ({
  id: event.id,
  name: event.name,
  startsAt: toPartnerDate(event.startsAt),
  priceCents: event.priceCents,
  availableSeats,
});

export const partnerPurchase = (ticket) => ({ ticketId: ticket.id, code: ticket.code, status: ticket.status });

export const partnerTicket = (ticket) => ({
  ticketId: ticket.id,
  code: ticket.code,
  eventId: ticket.eventId,
  status: ticket.status,
  checkedIn: ticket.checkedIn,
});
