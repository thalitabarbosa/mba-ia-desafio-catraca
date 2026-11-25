# F04 — Contrato de avaliação

## Pré-requisitos

- Clone limpo no commit avaliado; `npm run up`; `source scripts/lib/flow.sh`.
- `web_login A organizador.a@catraca.dev catraca123`; `R=$(date +%s)`.
- `E=$(org_create A "Vitrine $R" "$(future_local 30)" "Bar" 1 "100,00")` (rascunho).

## Itens

| Item | Como verificar | Esperado |
|---|---|---|
| C01 | `web_get - /` | `200`; sem `data-event-id="$E"` |
| C02 | `org_publish A $E`; `web_get - /` | contém `data-event-id="$E"`, "Vitrine $R" e "R$ 100,00" |
| C03 | `web_get - /events/$E`; `curl -s -o /dev/null -w '%{http_code} %{redirect_url}' -X POST $WEB/events/$E/purchase -d cardNumber=4000000000000001` | página com link de login; `302` para `/login...` |
| C04 | `web_signup P "Ana" ana.$R@ex.com senha12345`; `web_buy P $E 4000000000000001`; `my_tickets P` | `303`; uma linha `CODE pending` |
| C05 | `web_get P /my-tickets` | contém "Vitrine $R", "pendente" e o código |
| C06 | Recarregar `my_tickets P` até 5 s | `CODE confirmed`; página com "confirmado" |
| C07 | `web_signup Q "Bia" bia.$R@ex.com senha12345`; `web_get Q /my-tickets` | não contém o código de P |
| C08 | `web_get Q /events/$E` (lotação 1 ocupada) | "Ingressos esgotados" e sem campo `cardNumber` |
| C09 | `web_buy Q $E 4000000000000001` | `409`; corpo com "Ingressos esgotados" |
| C10 | Evento F lotação 1 publicado; comprar pela vitrine com `...0004` (P); `web_get Q /events/$F` antes de 30 s; repetir após 41 s | primeiro "Ingressos esgotados"; depois formulário de compra disponível |
| C11 | `web_buy P $E 123` (num evento com vaga) | `422` |
| C12 | `npm run gates` | sai com 0; inclui `test/f04-*` |

## Mapeamento critério → itens

| Critério | Itens |
|---|---|
| F04-AC01 | C01, C02 |
| F04-AC02 | C04, C05, C06 |
| F04-AC03 | C08, C09 |
| F04-AC04 | C03 |
| X04 | C04, C05, C07 |
| X05 | C01, C02 |
| X06 | C08, C10 |
| (gates) | C11, C12 |
