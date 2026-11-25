# F01 — Plano

1. Adicionar dependências: `express`, `ejs`, `pg`, `bcryptjs`, `cookie-parser`; dev: `supertest`. Gerar `package-lock.json`.
2. `src/config.js`, `src/db.js` (pool + `tx(fn)` com BEGIN/COMMIT/ROLLBACK), `src/ids.js`.
3. Migrador + `001_users_sessions.sql`; advisory lock.
4. `src/seed.js` idempotente com as três contas.
5. Sessão (`src/auth/session.js`), middlewares (`src/auth/guards.js`), rotas signup/login/logout, views.
6. `src/app.js`, `src/routes.js`, `src/workers.js` (lista vazia), `src/main.js`, `GET /health`.
7. Rotas placeholder: `GET /` (vitrine vazia "Nenhum evento à venda") e `GET /organizer` (lista vazia) — F02 e F04 substituem.
8. Testes em `test/f01-*.test.js`; ajustar `docker-compose.test.yml` se necessário.
9. Rodar `npm run up`, `npm run down`, `npm run up` de novo, `npm run gates`. Commit por etapa.
10. Atualizar `docs/state.json` (F01 → `in_review`) e pedir avaliação ao subagente `evaluator`.
