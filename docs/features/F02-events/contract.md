# F02 — Contrato de avaliação

## Pré-requisitos

- Clone limpo no commit avaliado; `npm run up`; `source scripts/lib/flow.sh`.
- `web_login A organizador.a@catraca.dev catraca123` e `web_login B organizador.b@catraca.dev catraca123` → `303`.
- `D=$(future_local 30)`.

## Itens

| Item | Como verificar | Esperado |
|---|---|---|
| C01 | `E=$(org_create A "Show X" "$D" "Bar" 2 "100,00"); echo $E` | um id `evt_...` |
| C02 | `org_create A "" "$D" "Bar" 2 10`; `org_create A "X" "$D" "Bar" 0 10`; `org_create A "X" "$D" "Bar" 2 0` | `ERR:422` nos três |
| C03 | `org_create A "X" "$(future_local -1)" "Bar" 2 10` | `ERR:422`; página com "A data de início precisa estar no futuro" |
| C04 | `org_edit A $E "Show X" "$(future_local -1)" "Bar" 2 "100,00"` | `422` |
| C05 | `web_get A /organizer/events/$E` | `200`; `data-event-name` = Show X; texto "Rascunho"; `id="edit-form"` |
| C06 | `web_get - /`; `api_list` (se F05 ainda não existir, consultar `SELECT status FROM events WHERE id=...` via `docker compose exec db psql -U catraca -c`) | E ausente / status `draft` |
| C07 | `org_publish A $E`; `web_get A /organizer/events/$E` | `303`; texto "Publicado" |
| C08 | `org_edit A $E "Show X" "$D" "Bar" 5 "100,00"` | `303`; página mostra lotação 5 |
| C09 | Com 2 vagas ocupadas (inserir 2 tickets `pending` via psql se F03 não existe, ou comprar após F03): `org_edit A $E ... 1 ...` | `422` com mensagem de vagas ocupadas |
| C10 | `web_get A /organizer` | contém `data-event-id="$E"` |
| C11 | `web_get B /organizer`; `web_get B /organizer/events/$E`; `curl -b $(jar B) -X POST .../organizer/events/$E/publish -w '%{http_code}'` | lista sem `$E`; `404` sem "Show X"; `404` |
| C12 | `npm run gates` | sai com 0; inclui `test/f02-*` |

## Mapeamento critério → itens

| Critério | Itens |
|---|---|
| F02-AC01 | C01, C02 |
| F02-AC02 | C03, C04 |
| F02-AC03 | C05, C06, C07 |
| F02-AC04 | C08, C09 |
| F02-AC05 | C05, C07 |
| F02-AC06 | C11 |
| X01 | C01, C10, C11 |
| (gates) | C12 |
