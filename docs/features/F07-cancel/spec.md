# F07 — Cancelamento de evento · Spec

Wave: W5 · Consome: F02 (`getOwnedEvent`, `registerManageSlot`, status `cancelled`), F03 (lock do evento, guarda do worker),
F04 (vitrine filtra por `isOnSale`), F05 (listagem/compra usam `isOnSale`), F06 (check-in e painel)
Critérios: F07-AC01..AC04, X13..X17 · Regra: R11 (e efeitos em R02, R05, R10, R12)

Esta feature é **pequena em código e grande em integração**: quase todo o comportamento "evento
cancelado" já deveria sair do status `cancelled` usado pelas outras. O trabalho é cancelar
corretamente e **provar** que cada consumidor reage.

## Decisões técnicas

- `src/cancel/service.js` — `cancelEvent(orgId, eventId)` em **uma transação**:
  ```sql
  SELECT * FROM events WHERE id=$1 AND organizer_id=$2 FOR UPDATE;   -- null -> not_found
  -- status <> 'published' -> conflict ('Só eventos publicados podem ser cancelados')
  UPDATE events  SET status='cancelled', cancelled_at=now(), updated_at=now() WHERE id=$1;
  UPDATE tickets SET status='refunded',  updated_at=now() WHERE event_id=$1 AND status='confirmed';
  UPDATE tickets SET status='cancelled', updated_at=now() WHERE event_id=$1 AND status='pending';
  COMMIT
  ```
  O efeito é imediato (bem dentro dos 10 s de R11). O lock do evento impede que uma compra
  concorrente insira um `pending` depois do UPDATE (a compra também trava a linha do evento e
  relê o status). O worker da F03 só toca `status='pending'`, então resposta tardia não muda nada.
- Ingressos já com check-in continuam `refunded` (o painel não conta check-in de não confirmados).
- Rota `POST /organizer/events/:id/cancel` (`requireOrganizer`): ok → 303 para a página de gestão;
  não dono → 404; não publicado → 409 com mensagem na página.
- Slot `cancel` na página de gestão (`order: 90`): botão "Cancelar evento" (com aviso de irreversível)
  só quando `published`; quando `cancelled`, a faixa "Evento cancelado em dd/mm/aaaa HH:mm".
- Conferir (e corrigir se preciso, com teste) nos consumidores: F02 recusa editar/publicar cancelado
  e esconde `edit-form`; F04/F05 usam `isOnSale`; F06 retorna `Evento cancelado`; `seats()` dá 0.

## Testes (`test/f07-*.test.js`)

Cancelar com 1 confirmado + 1 pendente (gateway escala 0.02, cartão 0003) → refunded/cancelled e,
após o vencimento do pendente, continua cancelled; editar/publicar/cancelar de novo → 409;
rascunho → 409; B → 404; vitrine, API (listagem e compra 404) e painel após cancelar;
**corrida**: `Promise.all([cancelEvent, ...10 purchaseTicket])` → nenhum ticket `pending` sobra no evento.
