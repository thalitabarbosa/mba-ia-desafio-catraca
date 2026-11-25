# F01 — Plataforma, contas e harness · Spec

Wave: W1 · Consome: — · Provê para: F02, F03, F04, F05, F06
Critérios no PRD: F01-AC01..AC07 · Base técnica: `docs/architecture.md`

## Objetivo

Deixar o esqueleto rodável: app Node em Docker com Postgres, migrações, seed idempotente, sessão,
cadastro/login/logout de participante, login de organizador, middlewares de papel e o harness
(`npm run up`, `npm run down`, `npm run gates`). Nenhuma regra de evento ou ingresso aqui.

## Decisões técnicas

- **Arquivos de harness já existem** (`docker-compose.yml`, `docker-compose.test.yml`, `Dockerfile`,
  `scripts/*.sh`, `package.json`). A F01 completa: adiciona dependências, `package-lock.json`, `src/`, `test/`.
  Não renomeie scripts nem o projeto compose (`catraca`); o avaliador depende deles.
- `src/main.js`: `await migrate(); await seed(); app.listen(PORT); startGatewayWorker?.()` — o
  worker é registrado pela F03 por um hook `src/workers.js` que exporta uma lista (F01 cria a lista vazia).
- `src/app.js` exporta `createApp()` sem `listen`, para `supertest`.
  Roteadores de cada feature são registrados em `src/routes.js` (F01 cria com auth e health).
  Cada feature adiciona **uma linha** ali — conflito previsto na W4, fácil de resolver.
- **Migrações**: `src/migrations/NNN_nome.sql`, aplicadas em ordem, registradas em `schema_migrations(name)`.
  F01 cria `001_users_sessions.sql`. F02 cria `002_events.sql`, F03 `003_tickets.sql`.
  Use `pg_advisory_lock` durante a migração para que duas instâncias não colidam.
- **Seed** (`src/seed.js`): `INSERT ... ON CONFLICT (email) DO NOTHING`. Contas:
  | Papel | Nome | E-mail | Senha |
  |---|---|---|---|
  | organizer | Organizador A | organizador.a@catraca.dev | catraca123 |
  | organizer | Organizador B | organizador.b@catraca.dev | catraca123 |
  | participant | Participante Seed | participante@catraca.dev | catraca123 |
- **Sessão**: tabela `sessions`, cookie `sid` (httpOnly, sameSite=lax, 7 dias), id aleatório de 32 bytes.
  Middleware `loadUser` popula `req.user` (ou `null`) e `res.locals.user`.
- **Middlewares**: `requireParticipant` (visitante → 302 `/login?next=...`; organizador → 403),
  `requireOrganizer` (visitante → 302 `/login`; participante → 403 com página "Acesso restrito", sem dados).
- **Cadastro**: nome obrigatório, e-mail válido e único (lowercase), senha ≥ 8. Erro → 422 com `<p class="error">`.
  Sucesso → cria sessão e 303 `/`.
- **Login**: erro → 401 "E-mail ou senha inválidos". Organizador → 303 `/organizer`; participante → 303 `next` ou `/`.
- **Config** (`src/config.js`): `PARTNER_API_KEY` (padrão `catraca-parceiro-dev`), `GATEWAY_MODE`
  (só `simulated` é aceito), `GATEWAY_DELAY_SCALE` (padrão `1`). Nenhuma chave de pagamento.
- Layout EJS base com cabeçalho: link para vitrine; se logado, nome e botão Sair; organizador vê "Meus eventos".
- IDs: helper `newId(prefix)` (`evt_`, `tkt_`, `usr_`) com 8 chars `[a-z0-9]` de `crypto.randomBytes`.

## Testes automatizados (em `test/f01-*.test.js`)

- signup → login → logout; e-mail duplicado 422; senha errada 401.
- `requireOrganizer`: visitante 302, participante 403.
- seed rodando duas vezes não falha e não duplica usuários.

## Fora do escopo desta feature

Eventos, ingressos, API de parceiros (só a config da chave).
