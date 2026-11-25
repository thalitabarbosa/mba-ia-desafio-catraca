# Arquitetura compartilhada

Este documento é o **contrato técnico entre features**. Specs de feature podem detalhar, mas não
contradizer o que está aqui. Mudou algo aqui? Isso é uma decisão de projeto: registre no PR.

## Stack

| Camada | Escolha | Por quê |
|---|---|---|
| Runtime | Node.js 22 (ESM, `"type": "module"`) em container | a máquina do avaliador tem Node e Docker; um só runtime |
| HTTP | Express 5 | simples, conhecido pelos agentes |
| Views | EJS renderizado no servidor | sem build de front; o avaliador testa por HTML/curl |
| Banco | PostgreSQL 16 (container) | `SELECT ... FOR UPDATE` resolve R07 de forma provável |
| Driver | `pg` (node-postgres), SQL puro, sem ORM | transações e locks explícitos |
| Senha | `bcryptjs` | puro JS, sem build nativo |
| Testes | `node:test` + `supertest` | nativo, sem framework extra |

Uma única aplicação serve o site e a API na porta **3000**: `$WEB = $API = http://localhost:3000`.
Fuso: `TZ=America/Sao_Paulo`; datas da API saem com offset `-03:00`.

## Estrutura de pastas

```
src/
  main.js              # migra, roda seed, sobe HTTP e o worker do gateway
  app.js               # cria o Express (exportado para os testes)
  config.js            # lê env: DATABASE_URL, PORT, PARTNER_API_KEY, GATEWAY_DELAY_SCALE, SESSION_SECRET
  db.js                # pool + helper tx(fn)
  migrations/*.sql     # numeradas, aplicadas uma vez (tabela schema_migrations)
  seed.js              # idempotente (ON CONFLICT DO NOTHING)
  auth/                # F01: sessão, signup/login/logout, middlewares
  events/              # F02: repositório, rotas do organizador, página de gestão
  tickets/             # F03: purchaseTicket, seats, gateway simulado, worker
  storefront/          # F04: vitrine, detalhe, meus ingressos
  partner/             # F05: API de parceiros
  checkin/             # F06: check-in e painel
  cancel/              # F07: cancelamento
  views/               # EJS; cada feature cria suas views em views/<pasta-da-feature>/
test/                  # *.test.js, um arquivo por feature no mínimo
```

## Modelo de dados

```sql
users(id text pk, name text, email text unique, password_hash text,
      role text check (role in ('organizer','participant')), created_at timestamptz)
sessions(id text pk, user_id text fk users, expires_at timestamptz)
events(id text pk,                 -- 'evt_' + 8 chars
       organizer_id text fk users,
       name text, venue text, starts_at timestamptz,
       capacity int check (capacity >= 1),
       price_cents int check (price_cents > 0),
       status text check (status in ('draft','published','cancelled')) default 'draft',
       cancelled_at timestamptz, created_at timestamptz, updated_at timestamptz)
tickets(id text pk,                -- 'tkt_' + 8 chars
        event_id text fk events,
        code text unique,          -- 8 chars [A-Z2-9] sem 0/O/1/I
        channel text check (channel in ('storefront','partner')),
        buyer_user_id text null fk users,   -- null para compras da API
        buyer_email text,
        card_last4 text,
        price_cents int,           -- preço vigente na compra (R03/R12)
        status text check (status in ('pending','confirmed','declined','cancelled','refunded')),
        gateway_result text check (gateway_result in ('approved','declined')),
        gateway_due_at timestamptz,         -- quando a "resposta" do gateway chega
        checked_in_at timestamptz null,
        created_at timestamptz, updated_at timestamptz)
index tickets(event_id, status); index tickets(status, gateway_due_at)
```

## Decisões que atravessam features

### R07 — lotação sob concorrência (dono: F03)

Toda operação que muda vagas ocupadas ou a lotação faz, **na mesma transação**:

1. `SELECT ... FROM events WHERE id = $1 FOR UPDATE` (lock de linha no evento);
2. conta `pending + confirmed` daquele evento;
3. decide e grava (insere ticket / altera capacidade / cancela).

Compras concorrentes do mesmo evento ficam serializadas pelo lock; eventos diferentes não se
bloqueiam. Quem usa: `purchaseTicket` (F03), edição de lotação (F02), `cancelEvent` (F07).
Prova: teste automatizado com 30 compras simultâneas × 20 rodadas (F03) e a rajada do avaliador.

### Gateway assíncrono (dono: F03)

`src/tickets/gateway.js` expõe `simulateCharge(cardNumber) -> { result, delayMs }` pela tabela do
brief (0001/0002: 2–5 s; 0003/0004: 30–40 s; outros: recusa 2–5 s). A compra grava
`gateway_result` e `gateway_due_at = now() + delayMs × GATEWAY_DELAY_SCALE` e responde na hora.
Um worker no mesmo processo (`setInterval` de 250 ms) aplica as respostas vencidas:

```sql
UPDATE tickets SET status = CASE gateway_result WHEN 'approved' THEN 'confirmed' ELSE 'declined' END,
                   updated_at = now()
 WHERE status = 'pending' AND gateway_due_at <= now();
```

A guarda `status = 'pending'` é o que garante R11 ("resposta que chegue depois não muda nada"):
ingresso já `cancelled` não é tocado. Como o vencimento está no banco, reiniciar o app não perde
respostas. `GATEWAY_DELAY_SCALE` vale `1` no modo padrão e só é reduzido nos testes.

### Status de evento e "à venda" (dono: F02)

`isOnSale(event) = event.status === 'published'`. Cancelado é o status `cancelled` (não um flag à
parte), então rascunho, publicado e cancelado são mutuamente exclusivos. Vitrine, API, compra e
check-in usam esse helper/consulta — ninguém reescreve o filtro.

### Acesso (donos: F01 e F02)

- `requireOrganizer`: visitante → 302 `/login`; participante → 403 "Acesso restrito".
- `getOwnedEvent(orgId, eventId)`: `WHERE id = $1 AND organizer_id = $2`; se não achar → 404
  "Evento não encontrado" sem nenhum dado do evento. Toda rota `/organizer/events/:id/*` usa isso.

## Rotas

### Web (HTML, formulários `application/x-www-form-urlencoded`)

| Método e rota | Feature | Comportamento |
|---|---|---|
| GET `/health` | F01 | 200 `{"ok":true}` |
| GET/POST `/signup` | F01 | campos `name`, `email`, `password`; sucesso → loga e 303 `/` |
| GET/POST `/login` | F01 | campos `email`, `password`; organizador → 303 `/organizer`; participante → 303 `/`; erro → 401 com "E-mail ou senha inválidos" |
| POST `/logout` | F01 | 303 `/` |
| GET `/organizer` | F02 | lista os eventos do organizador logado |
| GET `/organizer/events/new`, POST `/organizer/events` | F02 | campos `name`, `startsAt` (`YYYY-MM-DDTHH:mm`, horário de SP), `venue`, `capacity`, `price` (reais: `100`, `100,00` ou `100.00`); sucesso → 303 `/organizer/events/:id`; erro → 422 com mensagem |
| GET `/organizer/events/:id` | F02 | página de gestão: dados, editar, publicar; slots de F06/F07 |
| POST `/organizer/events/:id` | F02 | edição (mesmos campos); sucesso 303; erro 422; cancelado 409 |
| POST `/organizer/events/:id/publish` | F02 | rascunho → publicado; 303 |
| POST `/organizer/events/:id/checkin` | F06 | campo `code`; 200 com a página de gestão e o resultado |
| POST `/organizer/events/:id/cancel` | F07 | publicado → cancelado; 303 |
| GET `/` | F04 | vitrine |
| GET `/events/:id` | F04 | detalhe; 404 se não está à venda |
| POST `/events/:id/purchase` | F04 | campo `cardNumber`; exige participante; sucesso 303 `/my-tickets`; esgotado 409 com "Ingressos esgotados"; cartão inválido 422 |
| GET `/my-tickets` | F04 | ingressos do participante logado |

### API de parceiros (F05) — contrato fixo do brief

`GET /api/partner/events`, `POST /api/partner/events/:eventId/purchases`,
`GET /api/partner/tickets/:ticketId`. Ver `docs/features/F05-partner-api/spec.md`.

## Ganchos de HTML (o que avaliador e scripts leem)

Para que scripts com `curl` consigam verificar o produto, estes marcadores são **obrigatórios**:

| Onde | Marcador |
|---|---|
| Vitrine | cada evento: `<li data-event-id="evt_...">` com nome e link `/events/evt_...` |
| Detalhe esgotado / compra recusada | texto exato `Ingressos esgotados` |
| Meus ingressos | cada ingresso: `<tr data-ticket-code="CODE" data-status="pending|confirmed|...">` contendo nome do evento, rótulo do status (pendente, confirmado, recusado, cancelado, estornado) e o código |
| Lista do organizador | cada evento: `<li data-event-id="evt_...">` |
| Página de gestão | `<h1 data-event-name>Nome</h1>`; formulário de edição com `id="edit-form"` (ausente se cancelado) |
| Resultado do check-in | `<p id="checkin-result">Mensagem</p>` |
| Painel | `<dd data-metric="confirmed|pending|checkins|available|revenue|refunded">valor</dd>`; receita no formato `R$ 350,00` |
| Mensagens de erro de formulário | `<p class="error">...</p>` |

Rótulos de status na interface: pendente, confirmado, recusado, cancelado, estornado.
