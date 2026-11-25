# F05 — Contrato de avaliação

## Pré-requisitos

- Clone limpo no commit avaliado; `npm run up`; `source scripts/lib/flow.sh` (`KEY=catraca-parceiro-dev`).
- `web_login A organizador.a@catraca.dev catraca123`; `R=$(date +%s)`.
- `E=$(org_create A "API $R" "$(future_local 30)" "Bar" 2 "100,00")` (rascunho).

## Itens

| Item | Como verificar | Esperado |
|---|---|---|
| C01 | `api_list \| listing_field $E id` | `ABSENT` |
| C02 | `org_publish A $E`; `api_list` | item com exatamente `id,name,startsAt,priceCents,availableSeats`; `priceCents` 10000 (número); `availableSeats` 2; `startsAt` com `-03:00` |
| C03 | `api_buy $E t1@ex.com 4000000000000001; echo "$CODE $BODY"` | `202` e JSON só com `ticketId`, `code`, `status:"pending"` |
| C04 | `seats $E` logo após C03 | `1` |
| C05 | Após 5 s: `api_ticket <ticketId>` | `200` com `ticketId, code, eventId, status:"confirmed", checkedIn:false` |
| C06 | `api_buy $E t2@ex.com 4000000000000004`; `api_buy $E t3@ex.com 4000000000000001` | `202`; depois `409 {"error":"sold_out"}` |
| C07 | Após 41 s do T2: `api_ticket T2`; `seats $E` | `declined`; `1` |
| C08 | Sem header / `X-Api-Key: errada` nas três rotas (`curl -i`) | `401 {"error":"unauthorized"}` nas seis chamadas |
| C09 | `api_buy evt_naoexiste x@ex.com 123` | `422 invalid_request` (corpo é verificado antes do evento) |
| C10 | `api_buy $E email-invalido 4000000000000001`; `curl ... -d '{"cardNumber":"4000000000000001"}'`; `-d 'nao-json'` | `422 invalid_request` nos três |
| C11 | Evento D rascunho: `api_buy $D x@ex.com 4000000000000001`; `api_buy evt_naoexiste x@ex.com 4000000000000001` | `404 event_not_available` nos dois |
| C12 | `curl -s -H "X-Api-Key: $KEY" $API/api/partner/tickets/tkt_naoexiste -w ' %{http_code}'` | `{"error":"ticket_not_found"} 404` |
| C13 | Compra do canal vitrine: `docker compose exec -T app node src/tickets/cli.js buy-as $E participante@catraca.dev 4000000000000001` (num evento com vaga) e `api_ticket` dela | `200` com o mesmo formato |
| C14 | Evento novo lotação 5 publicado: `burst <id>`; repetir em **5 eventos novos** | sempre `5 25` |
| C15 | `KEY=outra-chave api_list` | `401` (a chave aceita é só a da config/README) |
| C16 | `npm run gates` | sai com 0; inclui `test/f05-*` |

## Mapeamento critério → itens

| Critério | Itens |
|---|---|
| F05-AC01 | C02, C03, C05, C12 |
| F05-AC02 | C08 |
| F05-AC03 | C06, C09, C10, C11 |
| F05-AC04 | C01, C02 |
| F05-AC05 | C12 |
| X07 | C08, C15 |
| X08 | C01, C02, C04 |
| X09 | C03, C05, C07, C13, C14 |
| (gates) | C16 |
