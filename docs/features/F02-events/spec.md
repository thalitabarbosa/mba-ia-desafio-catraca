# F02 — Eventos do organizador · Spec

Wave: W2 · Consome: F01 (sessão, `requireOrganizer`, `db`, `newId`) · Provê para: F03, F04, F05, F06, F07
Critérios: F02-AC01..AC06, X01 · Regras: R01, R02, R03, R04, R13

## O que esta feature provê (interface estável — outras features importam daqui)

`src/events/repo.js`:

```js
createEvent(orgId, input)            // -> event | throws ValidationError(messages[])
updateEvent(orgId, eventId, input)   // -> event | ValidationError | NotFound | Conflict('cancelled')
publishEvent(orgId, eventId)         // draft -> published (idempotente se já publicado)
getOwnedEvent(orgId, eventId)        // -> event | null   (R13: filtra por organizer_id)
getEvent(eventId)                    // -> event | null   (sem filtro de dono; uso interno)
listOwnedEvents(orgId)
listOnSaleEvents()                   // status = 'published', ordenado por starts_at
isOnSale(event)                      // event?.status === 'published'
```

`src/events/manage-page.js`: registro de **slots** da página de gestão:
`registerManageSlot({ name, order, load: async (event, req) => locals, view: 'checkin/slot' })`.
A rota GET `/organizer/events/:id` chama todos os slots e renderiza cada partial. F06 registra
`checkin` e `panel`; F07 registra `cancel`. Assim cada feature mexe na página sem editar a view da F02.
Rotas POST de outras features em `/organizer/events/:id/*` re-renderizam a página com
`renderManagePage(req, res, event, extraLocals, status)` exportada daqui.

## Decisões técnicas

- Migração `002_events.sql` conforme `docs/architecture.md`.
- **Validação (R01)**, igual em criar e editar:
  - `name`, `venue`: obrigatórios, trim, ≤ 120 chars.
  - `startsAt`: `YYYY-MM-DDTHH:mm` interpretado como `-03:00`; precisa ser > `now()` → "A data de início precisa estar no futuro".
  - `capacity`: inteiro ≥ 1 → "Lotação deve ser um inteiro maior ou igual a 1".
  - `price`: aceita `100`, `100,00`, `100.00`, `1.234,56`; converte para centavos inteiros; > 0 → "Preço deve ser maior que zero".
  - Erro → 422 re-renderizando o formulário com `<p class="error">` por mensagem.
- **Edição (R03)** em transação: `SELECT ... FOR UPDATE` no evento, conta `pending+confirmed` em
  `tickets` (a tabela só existe a partir da F03: até lá, use `to_regclass('tickets')` e conte 0 se nula,
  **ou** a F02 cria a função `occupied_seats(event_id)` em SQL que a F03 redefine — escolha a primeira, mais simples).
  `capacity < ocupadas` → 422 "A lotação não pode ser menor que as vagas ocupadas (N)".
  Mudança de preço só altera `events.price_cents`; o preço do ingresso é gravado na compra (F03).
- Evento `cancelled`: `updateEvent` e `publishEvent` → 409 "Evento cancelado não pode ser alterado";
  a página de gestão não renderiza `id="edit-form"` nem o botão Publicar.
- **R13**: toda rota `/organizer/events/:id*` faz `getOwnedEvent(req.user.id, id)`; `null` → 404 com
  página "Evento não encontrado" que **não** consulta nem exibe nada do evento.
- Página de gestão: `<h1 data-event-name>`, status em texto (Rascunho/Publicado/Cancelado),
  formulário `id="edit-form"` com os 5 campos preenchidos, botão Publicar se rascunho, depois os slots.
- Lista `/organizer`: `<li data-event-id="...">` com nome, data, status, link para a gestão; botão "Novo evento".

## Testes (`test/f02-*.test.js`)

Validações de R01 (passado, lotação 0, preço 0, campos vazios); rascunho → publicado; edição de
lotação com ingressos simulados por INSERT direto (quando a tabela existir) ou só o caminho "aumentar";
organizador B recebe 404 em GET/POST de evento de A; participante 403.
