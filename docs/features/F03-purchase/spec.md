# F03 — Compra e gateway simulado · Spec

Wave: W3 · Consome: F01 (`db`, `tx`, `newId`, `workers.js`, config), F02 (`getEvent`, `isOnSale`, `events.price_cents`)
Provê para: F04, F05, F06, F07 · Critérios: F03-AC01..AC07, X02, X03 · Regras: R03, R05, R06, R07, R08, R09

Esta é a feature mais crítica: **todo canal de venda passa por aqui**. Vitrine (F04) e API (F05)
nunca inserem em `tickets` diretamente.

## Interface provida (`src/tickets/service.js`)

```js
purchaseTicket({ eventId, channel, buyerUserId = null, buyerEmail, cardNumber })
  // -> { ok: true, ticket: { id, code, status: 'pending', eventId } }
  // -> { ok: false, error: 'invalid_card' | 'event_not_available' | 'sold_out' }
seats(eventId)            // -> { capacity, occupied, available }   (R05; cancelado => available 0)
occupiedSeats(client, eventId)   // conta pending+confirmed (usar dentro de tx já com lock)
getTicket(ticketId)       // -> { id, code, eventId, status, checkedIn } | null
findTicketByCode(code)
listTicketsByUser(userId) // com nome do evento, para "Meus ingressos"
STATUS_LABEL              // { pending:'pendente', confirmed:'confirmado', declined:'recusado', cancelled:'cancelado', refunded:'estornado' }
```

Validação de **formato do e-mail** fica no canal (F05 valida o corpo). `purchaseTicket` valida só o cartão.

## Decisões técnicas

### Compra atômica (R05, R06, R07)

```text
1. cardNumber precisa casar /^\d{16}$/ senão -> invalid_card (nada é criado)
2. BEGIN
3. SELECT * FROM events WHERE id=$1 FOR UPDATE
4. evento inexistente ou status <> 'published' -> ROLLBACK, event_not_available
5. occupied = count(*) FROM tickets WHERE event_id=$1 AND status IN ('pending','confirmed')
6. occupied >= capacity -> ROLLBACK, sold_out
7. { result, delayMs } = simulateCharge(cardNumber)
8. INSERT ticket (status 'pending', price_cents = event.price_cents, gateway_result, gateway_due_at = now() + delay*scale, code único)
9. COMMIT  -> responde imediatamente
```

O lock da linha do evento serializa compras concorrentes do mesmo evento, então o passo 5–8 nunca
vê uma contagem desatualizada. Mesmo lock é usado na edição de lotação (F02) e no cancelamento (F07).
Pool do `pg` com `max: 20` para a rajada de 30 não ficar presa em fila desnecessária.

### Código único (R09)

8 caracteres de `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` com `crypto.randomInt`; `UNIQUE` no banco; em
colisão (erro 23505 em `code`) gera outro e tenta de novo (até 5 vezes) **dentro da mesma transação**
usando SAVEPOINT.

### Gateway simulado (R08) — `src/tickets/gateway.js`

| Final | Resultado | Atraso |
|---|---|---|
| 0001 | approved | 2000–5000 ms |
| 0002 | declined | 2000–5000 ms |
| 0003 | approved | 30000–40000 ms |
| 0004 | declined | 30000–40000 ms |
| outro | declined | 2000–5000 ms |

Atraso real aplicado = `delay × GATEWAY_DELAY_SCALE` (padrão 1; testes usam 0.02). Para não estourar
o limite de 5 s do fluxo, sorteie 2000–4500 ms (dentro da faixa do brief e com folga para o worker).

### Worker (`src/tickets/worker.js`, registrado em `src/workers.js`)

`setInterval` a cada 250 ms executando o UPDATE com guarda `WHERE status='pending' AND gateway_due_at <= now()`
(ver `docs/architecture.md`). Guarda contra reentrância (não roda de novo se a execução anterior não acabou).
Recusa vira `declined` e, como a contagem de vagas é por status, a vaga é liberada automaticamente.

### CLI de diagnóstico (para o contrato e para depurar)

`node src/tickets/cli.js buy <eventId> <email> <card>` (canal `partner`, sem usuário) ·
`buy-as <eventId> <emailDoParticipante> <card>` (canal `storefront`, vinculado ao usuário) ·
`status <ticketId>` · `seats <eventId>` ·
`burst <eventId> <n>` (dispara n `purchaseTicket` com `Promise.all` e imprime a contagem por resultado).
Rodar com `docker compose exec -T app node src/tickets/cli.js ...`.

## Testes (`test/f03-*.test.js`)

- Concorrência: evento lotação 5, 30 compras em `Promise.all`, **20 rodadas** em eventos novos → sempre 5 ok e 25 `sold_out`.
- Gateway com escala 0.02: 0001 → confirmed; 0002/0004/outro → declined e vaga liberada; 0003 → confirmed.
- Guarda: ticket com status alterado para `cancelled` antes do vencimento continua `cancelled` após o worker.
- Preço vigente: compra, muda preço do evento, compra de novo → `price_cents` diferentes.
- Cartão `123` → `invalid_card` e nenhum ticket criado.
