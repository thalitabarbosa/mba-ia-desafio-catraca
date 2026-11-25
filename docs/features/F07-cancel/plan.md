# F07 — Plano

1. `src/cancel/service.js` com a transação da spec.
2. Rota POST cancel + slot `cancel` na página de gestão; registrar em `src/routes.js`.
3. Revisar consumidores (F02 edição/publicação, F04, F05, F06, `seats`) contra evento cancelado; corrigir com teste onde faltar.
4. Testes `test/f07-*.test.js` incluindo a corrida cancelamento × compras.
5. `npm run gates`; rodar `npm run flow` inteiro (é a primeira vez que todas as features se encontram).
6. `docs/state.json` → `in_review`; chamar o `evaluator`.
