# F06 — Contrato de avaliação

## Pré-requisitos

- Clone limpo no commit avaliado; `npm run up`; `source scripts/lib/flow.sh`.
- `web_login A organizador.a@catraca.dev catraca123`; `web_login B organizador.b@catraca.dev catraca123`; `web_login S participante@catraca.dev catraca123`.
- `cli() { docker compose exec -T app node src/tickets/cli.js "$@"; }` — `buy` = canal parceiro; `buy-as` = canal vitrine.
- `psql() { docker compose exec -T db psql -U catraca -tAc "$1"; }`
- `E=$(org_create A "Painel $(date +%s)" "$(future_local 30)" "Bar" 4 "100,00"); org_publish A $E`

## Itens

| Item | Como verificar | Esperado |
|---|---|---|
| C01 | `web_get A /organizer/events/$E` | página de gestão com formulário de check-in e `data-metric` para os 6 números |
| C02 | `cli buy-as $E participante@catraca.dev 4000000000000001` (código CA); `cli buy $E p@ex.com 4000000000000001` (CB); esperar 5 s | ambos `confirmed` |
| C03 | `org_edit A $E <mesmos campos> 4 "150,00"`; `cli buy $E q@ex.com 4000000000000001` (CC); `cli buy $E r@ex.com 4000000000000003` (CD, pendente); esperar 5 s | CC `confirmed`, CD `pending` |
| C04 | `for m in confirmed pending checkins available revenue refunded; do panel A $E $m; done` | `3 1 0 0 R$ 350,00 0` |
| C05 | `org_checkin A $E CB` (comprado pelo canal parceiro) | `Entrada liberada` |
| C06 | `org_checkin A $E CB` de novo | `Ingresso já utilizado` |
| C07 | `org_checkin A $E CD` | `Ingresso não confirmado` |
| C08 | `org_checkin A $E ZZZZZZZZ` | `Ingresso inválido para este evento` |
| C09 | Evento F de B com um ingresso (código CF); `org_checkin A $E CF` | `Ingresso inválido para este evento` |
| C10 | `panel A $E checkins` | `1` |
| C11 | Check-in concorrente: `org_edit` para lotação 5; `cli buy $E g@ex.com 4000000000000001` (CG) e esperar `confirmed`; `(org_checkin A $E CG & org_checkin A $E CG & wait)` | uma linha `Entrada liberada` e uma `Ingresso já utilizado` |
| C12 | `psql "update events set status='cancelled' where id='$E'"`; `org_checkin A $E CA` | `Evento cancelado` |
| C13 | `psql "update tickets set status='refunded' where code='CA'"`; `panel A $E refunded`; `panel A $E revenue` | `1`; receita sem o valor de CA |
| C14 | `web_get B /organizer/events/$E`; `curl -s -b $(jar B) -X POST $WEB/organizer/events/$E/checkin -d code=CB -w ' %{http_code}'` | `404`, sem `data-metric` nem "Painel"; `404` sem `checkin-result` |
| C15 | `web_get S /organizer/events/$E`; `web_get - /organizer/events/$E` | `403`; `302` para login — nenhum dos dois com `data-metric` |
| C16 | `npm run gates` | sai com 0; inclui `test/f06-*` |

## Mapeamento critério → itens

| Critério | Itens |
|---|---|
| F06-AC01 | C05, C06, C07, C08, C12 |
| F06-AC02 | C11 |
| F06-AC03 | C04, C10, C13 |
| F06-AC04 | C01, C14 |
| X10 | C15 |
| X11 | C01, C09, C14 |
| X12 | C02, C03, C04, C05 |
| (gates) | C16 |
