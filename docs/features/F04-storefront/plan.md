# F04 — Plano

0. No worktree `../catraca-F04` (branch `feat/F04-storefront`): **primeiro commit imediatamente** (`chore(F04): start`) e push, para provar o paralelismo.
1. Views `index`, `event`, `my-tickets` com os ganchos de HTML.
2. Roteador `src/storefront/routes.js`; registrar em `src/routes.js` e remover o placeholder `GET /`.
3. Formatação de data/preço em `src/storefront/format.js` (se a F06 criar um helper igual, unificar no merge).
4. Testes `test/f04-*.test.js`; `npm run gates`.
5. Verificar à mão com `web_signup`, `web_buy`, `my_tickets` de `scripts/lib/flow.sh`.
6. Abrir PR para `main`; chamar o `evaluator` no commit da branch.
