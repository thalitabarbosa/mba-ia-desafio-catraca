# F02 — Plano

1. `002_events.sql`.
2. `src/events/validate.js` (parser de preço e data em -03:00) + testes unitários.
3. `src/events/repo.js` com a interface da spec; `updateEvent` em transação com `FOR UPDATE`.
4. `src/events/manage-page.js` (slots + `renderManagePage`).
5. Rotas: `/organizer`, `/organizer/events/new`, POST `/organizer/events`, GET/POST `/organizer/events/:id`, POST `/publish`. Registrar em `src/routes.js`.
6. Views em `src/views/events/` com os ganchos de HTML de `docs/architecture.md`.
7. Testes `test/f02-*.test.js`; `npm run gates`.
8. Verificar à mão com `scripts/lib/flow.sh` (`org_create`, `org_edit`, `org_publish`).
9. `docs/state.json` → `in_review`; chamar o `evaluator`.
