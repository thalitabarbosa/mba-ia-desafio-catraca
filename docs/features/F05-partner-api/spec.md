# F05 — API de parceiros · Spec

Wave: **W4 (paralela com F04 e F06)** · Branch: `feat/F05-partner-api`
Consome: F01 (`config.PARTNER_API_KEY`), F02 (`listOnSaleEvents`), F03 (`purchaseTicket`, `seats`, `getTicket`)
Provê para: F07 · Critérios: F05-AC01..AC05, X07, X08, X09 · Regras: R02, R05, R06, R07, R08

## Contrato fixo (do brief — não negociável)

| Rota | Sucesso | Erros |
|---|---|---|
| `GET /api/partner/events` | 200 `[{id,name,startsAt,priceCents,availableSeats}]` | 401 |
| `POST /api/partner/events/:eventId/purchases` body `{buyerEmail, cardNumber}` | 202 `{ticketId, code, status:"pending"}` | 401 → 422 `invalid_request` → 404 `event_not_available` → 409 `sold_out` |
| `GET /api/partner/tickets/:ticketId` | 200 `{ticketId, code, eventId, status, checkedIn}` | 401, 404 `ticket_not_found` |

Todos os erros: `{"error":"<código>"}` com `Content-Type: application/json`.

## Decisões técnicas

- `src/partner/routes.js` montado em `/api/partner` com `express.json()` próprio (corpo JSON inválido → 422 `invalid_request`, **depois** da chave).
- Middleware de chave primeiro: header `X-Api-Key` comparado com `crypto.timingSafeEqual` a `config.PARTNER_API_KEY`; ausente/diferente → 401 `unauthorized`.
- Validação do corpo: `buyerEmail` string casando `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`; `cardNumber` string `/^\d{16}$/`. Falhou → 422 antes de consultar o evento.
- Compra: `purchaseTicket({ channel:'partner', buyerEmail, cardNumber, eventId })` e mapeia: `event_not_available` → 404, `sold_out` → 409, `invalid_card` → 422 (não deve acontecer após a validação).
- `startsAt`: ISO 8601 com offset `-03:00` e segundos (`2026-12-05T21:00:00-03:00`); formatador em `src/partner/format.js`.
- `availableSeats` = `seats(id).available`. `priceCents` = `events.price_cents` atual.
- `checkedIn` = `checked_in_at IS NOT NULL`. `GET /tickets/:id` vale para ingressos de **qualquer** canal.
- Rotas `/api/partner/*` desconhecidas → 404 `{"error":"not_found"}` (após a chave).

## Testes (`test/f05-*.test.js`)

Cada rota sem chave e com chave errada; ordem dos erros (corpo inválido em evento inexistente → 422;
evento rascunho → 404; lotado → 409); formato exato das respostas (chaves e tipos); listagem sem
rascunho; consulta de ingresso comprado pela vitrine (insert via `purchaseTicket` com `channel:'storefront'`).
