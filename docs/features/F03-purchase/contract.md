# F03 — Contrato de avaliação

## Pré-requisitos

- Clone limpo no commit avaliado; `npm run up` (modo padrão, `GATEWAY_DELAY_SCALE=1`); `source scripts/lib/flow.sh`.
- `web_login A organizador.a@catraca.dev catraca123`.
- Atalho: `cli() { docker compose exec -T app node src/tickets/cli.js "$@"; }`.
- Eventos de teste: `E=$(org_create A "F03 $(date +%s)" "$(future_local 30)" "Bar" 2 "100,00")`.

## Itens

| Item | Como verificar | Esperado |
|---|---|---|
| C01 | Com E em rascunho: `cli buy $E a@ex.com 4000000000000001` | `event_not_available`; nenhum ticket criado |
| C02 | `org_publish A $E`; `time cli buy $E a@ex.com 4000000000000001` | `ok` com status `pending` e `code` de 8 chars; resposta em < 2 s (inclui o `docker exec`) |
| C03 | `cli seats $E` logo após C02 | `occupied 1, available 1` |
| C04 | Esperar 5 s; `cli status <ticket de C02>` | `confirmed` |
| C05 | `cli buy $E b@ex.com 4000000000000002`; `cli seats $E`; esperar 5 s; `cli status`; `cli seats $E` | `pending`, available 0; depois `declined`, available 1 |
| C06 | Novo evento lotação 1: comprar com `...0004`, logo outra com `...0001` | segunda → `sold_out`; após 40 s, a primeira está `declined` |
| C07 | Novo evento: comprar com `...0003`; `status` após 25 s e após 41 s | `pending`; depois `confirmed` |
| C08 | Novo evento: comprar com `4000000000009999` e esperar 5 s | `declined` |
| C09 | `cli buy $E c@ex.com 123` e depois `cli seats $E` | `invalid_card`; contagem inalterada |
| C10 | Novo evento lotação 5 publicado: `cli burst <id> 30`, repetir em **5 eventos novos** | sempre `ok 5, sold_out 25` |
| C11 | Comprar em E (preço 100); `org_edit` para preço 150 e lotação 10; comprar de novo; `docker compose exec -T db psql -U catraca -tc "select price_cents from tickets where event_id='$E' order by created_at"` | primeiras com `10000`, última com `15000` |
| C12 | `docker compose exec -T db psql -U catraca -tc "select count(*), count(distinct code) from tickets"` | contagens iguais |
| C13 | `npm run gates` | sai com 0; saída mostra o teste de concorrência com 20 rodadas |
| C14 | `npm run down && npm run up`; nova compra com `...0001`; esperar 5 s | `confirmed` (worker ativo sem passo extra) |

## Mapeamento critério → itens

| Critério | Itens |
|---|---|
| F03-AC01 | C02, C03 |
| F03-AC02 | C03, C05 |
| F03-AC03 | C06, C10, C13 |
| F03-AC04 | C04, C05, C06, C07, C08 |
| F03-AC05 | C02, C12 |
| F03-AC06 | C09 |
| F03-AC07 | C11 |
| X02 | C04, C14 |
| X03 | C01, C02, C11 |
