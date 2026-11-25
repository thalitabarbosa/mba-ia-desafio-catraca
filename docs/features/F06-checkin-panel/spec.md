# F06 — Check-in e painel · Spec

Wave: **W4 (paralela com F04 e F05)** · Branch: `feat/F06-checkin-panel`
Consome: F01 (`requireOrganizer`), F02 (`getOwnedEvent`, `registerManageSlot`, `renderManagePage`, status do evento), F03 (`tickets`, `seats`, `findTicketByCode`)
Provê para: F07 · Critérios: F06-AC01..AC04, X10, X11, X12 · Regras: R03, R04, R05, R10, R12, R13

## Interface provida

`src/checkin/service.js`:

```js
checkIn(eventId, code)   // -> 'invalid' | 'event_cancelled' | 'not_confirmed' | 'already_used' | 'ok'
panelMetrics(eventId)    // -> { confirmed, pending, checkins, available, revenueCents, refunded }
CHECKIN_MESSAGES = {
  invalid: 'Ingresso inválido para este evento',
  event_cancelled: 'Evento cancelado',
  not_confirmed: 'Ingresso não confirmado',
  already_used: 'Ingresso já utilizado',
  ok: 'Entrada liberada',
}
```

## Decisões técnicas

### Check-in (R10) — ordem exata do brief

```text
code = trim(upper(code))
t = SELECT ... FROM tickets WHERE code=$1 AND event_id=$2         -> nada: invalid
event.status = 'cancelled'                                         -> event_cancelled
t.status <> 'confirmed'                                            -> not_confirmed
t.checked_in_at IS NOT NULL                                        -> already_used
UPDATE tickets SET checked_in_at=now()
 WHERE id=$1 AND status='confirmed' AND checked_in_at IS NULL RETURNING id
  -> 1 linha: ok ; 0 linhas: reavaliar (outro check-in ou cancelamento ganhou) -> already_used / event_cancelled
```

O `UPDATE` condicional garante que dois check-ins simultâneos do mesmo código não liberam duas entradas.
Código de outro evento cai em `invalid` pelo filtro `event_id`.

### Painel (R12) — uma consulta

```sql
SELECT count(*) FILTER (WHERE status='confirmed')                         AS confirmed,
       count(*) FILTER (WHERE status='pending')                           AS pending,
       count(*) FILTER (WHERE status='confirmed' AND checked_in_at IS NOT NULL) AS checkins,
       coalesce(sum(price_cents) FILTER (WHERE status='confirmed'),0)     AS revenue_cents,
       count(*) FILTER (WHERE status='refunded')                          AS refunded
  FROM tickets WHERE event_id = $1
```

`available` vem de `seats(eventId).available` (F03 — R05; cancelado = 0). Receita usa `tickets.price_cents`
(preço vigente na compra, R03) e **nunca** soma estornados.
Formato: `R$ 1.234,56` (`Intl.NumberFormat('pt-BR', {style:'currency', currency:'BRL'})` normalizando o espaço não separável para espaço comum).

### Integração na página de gestão (R04)

- `registerManageSlot({ name:'checkin', order: 20, ... })` e `{ name:'panel', order: 10, ... }`.
- Slot de check-in: formulário POST `/organizer/events/:id/checkin` com campo `code` e, se houver,
  `<p id="checkin-result">mensagem</p>`. Em evento cancelado o formulário continua disponível (a lista vale).
- Slot do painel: `<dl id="panel">` com `<dt>Confirmados</dt><dd data-metric="confirmed">N</dd>` etc.
  (rótulos: Confirmados, Pendentes, Check-ins, Vagas disponíveis, Receita, Estornados).
- `POST /organizer/events/:id/checkin`: `requireOrganizer` + `getOwnedEvent` (404 sem dados se não é dono) →
  `checkIn` → `renderManagePage(req, res, event, { checkinResult: CHECKIN_MESSAGES[r] }, 200)`.

## Testes (`test/f06-*.test.js`)

As cinco mensagens (cancelado via `UPDATE events SET status='cancelled'` direto no teste);
check-in concorrente com `Promise.all` → 1 ok + 1 already_used; painel com confirmados de dois canais,
um estornado (UPDATE direto), um check-in e preços diferentes; organizador B → 404 no POST de check-in.
