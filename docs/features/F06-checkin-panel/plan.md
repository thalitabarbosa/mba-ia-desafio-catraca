# F06 — Plano

0. No worktree `../catraca-F06` (branch `feat/F06-checkin-panel`): **primeiro commit imediatamente** (`chore(F06): start`) e push.
1. `src/checkin/service.js` (`checkIn`, `panelMetrics`, mensagens).
2. Partials `src/views/checkin/slot.ejs` e `src/views/checkin/panel.ejs`; registrar os slots.
3. Rota POST de check-in; registrar em `src/routes.js` (uma linha).
4. Testes `test/f06-*.test.js`; `npm run gates`.
5. Verificar à mão com `org_checkin` e `panel` de `scripts/lib/flow.sh`, comprando via `src/tickets/cli.js`.
6. Abrir PR para `main`; chamar o `evaluator` no commit da branch.
