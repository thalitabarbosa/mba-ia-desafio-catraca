# F04 — Vitrine e Meus ingressos · Spec

Wave: **W4 (paralela com F05 e F06)** · Branch: `feat/F04-storefront`
Consome: F01 (sessão, `requireParticipant`), F02 (`listOnSaleEvents`, `getEvent`, `isOnSale`), F03 (`purchaseTicket`, `seats`, `listTicketsByUser`, `STATUS_LABEL`)
Provê para: F07 · Critérios: F04-AC01..AC04, X04, X05, X06 · Regras: R02, R05, R06, R07, R08, R09

## Decisões técnicas

- Pasta `src/storefront/`, views em `src/views/storefront/`. Registra o roteador em `src/routes.js`
  (uma linha) e **substitui** o placeholder `GET /` da F01.
- `GET /` — `listOnSaleEvents()`; para cada evento `<li data-event-id>` com nome, data/hora (dd/mm/aaaa HH:mm),
  local, preço (R$ x,yy), vagas disponíveis e link `/events/:id`. Lista vazia: "Nenhum evento à venda".
- `GET /events/:id` — se `!isOnSale(getEvent(id))` → 404 "Evento indisponível". Mostra os dados.
  Se `seats(id).available === 0` → mostra `Ingressos esgotados` **no lugar** do formulário.
  Senão: se participante logado, formulário com `cardNumber`; se visitante, link "Entre para comprar" → `/login?next=/events/:id`.
- `POST /events/:id/purchase` (`requireParticipant`) → `purchaseTicket({ channel:'storefront', buyerUserId, buyerEmail: user.email, ... })`:
  - ok → 303 `/my-tickets`
  - `sold_out` → 409 renderizando a página do evento com `Ingressos esgotados`
  - `invalid_card` → 422 "Número do cartão inválido (16 dígitos)"
  - `event_not_available` → 404 "Evento indisponível"
- `GET /my-tickets` (`requireParticipant`) — tabela, mais recentes primeiro: `<tr data-ticket-code data-status>`
  com nome do evento, data, rótulo (`STATUS_LABEL`), código. Vazio: "Você ainda não tem ingressos".
  Organizador em `/my-tickets` → 403 (o middleware da F01 já faz).
- Nada de JS no cliente. "Recarregar a página" atualiza o status.

## Testes (`test/f04-*.test.js`)

Vitrine sem rascunho; compra → 303 e aparece pending em `/my-tickets`; outro participante não vê o
ingresso; evento lotado mostra "Ingressos esgotados" no GET e no POST; visitante → redireciona ao login.
