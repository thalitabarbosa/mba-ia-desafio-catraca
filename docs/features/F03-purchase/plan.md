# F03 — Plano

1. `003_tickets.sql` (tabela, índices, `UNIQUE(code)`).
2. `src/tickets/gateway.js` + teste unitário da tabela de finais.
3. `src/tickets/codes.js` (gerador).
4. `src/tickets/service.js`: `purchaseTicket` com a sequência da spec; `seats`, `getTicket`, `findTicketByCode`, `listTicketsByUser`, `STATUS_LABEL`.
5. Trocar o cálculo de vagas ocupadas da F02 para usar `occupiedSeats` (remove o `to_regclass`).
6. `src/tickets/worker.js` e registro em `src/workers.js`; ajustar pool para `max: 20`.
7. `src/tickets/cli.js`.
8. Testes `test/f03-*.test.js`, com o de concorrência em 20 rodadas.
9. Rodar a CLI `burst` 5 vezes no ambiente subido (escala 1) e colar a saída no PR.
10. `docs/state.json` → `in_review`; chamar o `evaluator`.
