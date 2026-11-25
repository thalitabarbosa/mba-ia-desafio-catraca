# F07 — Contrato de avaliação

## Pré-requisitos

- Clone limpo no commit avaliado; `npm run up` (modo padrão); `source scripts/lib/flow.sh`.
- `web_login A organizador.a@catraca.dev catraca123`; `web_login B organizador.b@catraca.dev catraca123`.
- `E=$(org_create A "Cancel $(date +%s)" "$(future_local 30)" "Clube" 5 "50,00"); org_publish A $E`

## Itens

| Item | Como verificar | Esperado |
|---|---|---|
| C01 | `D=$(org_create A "Rasc" "$(future_local 30)" "X" 2 10)`; `org_cancel A $D` | `409` |
| C02 | `org_cancel B $E` | `404`; E continua publicado (aparece em `api_list`) |
| C03 | `S=$(now_s)`; `api_buy $E t5@ex.com 4000000000000003` (T5); `api_buy $E t6@ex.com 4000000000000001` (T6, código C6); `wait_until 6 ticket_is $T6 confirmed`; `org_cancel A $E` antes de 30 s de S | `202`, `202`, confirmado, `303` |
| C04 | `wait_until 10 ticket_is $T6 refunded`; `wait_until 10 ticket_is $T5 cancelled` | ambos dentro do prazo |
| C05 | Esperar até 45 s de S; `ticket_status $T5` | `cancelled` |
| C06 | `web_get - /`; `web_get - /events/$E` | sem `data-event-id="$E"`; `404` |
| C07 | `api_list \| listing_field $E id`; `api_buy $E x@ex.com 4000000000000001` | `ABSENT`; `404 {"error":"event_not_available"}` |
| C08 | `api_ticket $T6`; `api_ticket $T5` | `status` `refunded` e `cancelled` |
| C09 | `web_get A /organizer/events/$E`; `org_edit A $E "Novo" "$(future_local 30)" "Clube" 9 "50,00"`; `org_publish A $E`; `org_cancel A $E` | sem `id="edit-form"`; edição `409`; publicação `409`; cancelar de novo `409` |
| C10 | `org_checkin A $E $C6` | `Evento cancelado` |
| C11 | `for m in confirmed pending checkins available revenue refunded; do panel A $E $m; done` | `0 0 0 0 R$ 0,00 1` |
| C12 | `npm run gates` | sai com 0; inclui `test/f07-*` com a corrida cancelamento × compras |
| C13 | `npm run flow` | `0 FAIL` (primeira execução com todas as features juntas) |

## Mapeamento critério → itens

| Critério | Itens |
|---|---|
| F07-AC01 | C01, C02, C03 |
| F07-AC02 | C09 |
| F07-AC03 | C04, C08 |
| F07-AC04 | C05 |
| X13 | C09 |
| X14 | C03, C04, C05 |
| X15 | C06 |
| X16 | C07, C08 |
| X17 | C10, C11 |
| (gates/fluxo) | C12, C13 |
