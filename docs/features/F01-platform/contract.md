# F01 — Contrato de avaliação

## Pré-requisitos

- Docker em execução; Node.js LTS; nenhum outro processo na porta 3000.
- Partir de um **clone limpo** do commit avaliado: `git clone <repo> /tmp/eval-f01 && cd /tmp/eval-f01 && git checkout <sha>`.
- Helpers: `source scripts/lib/flow.sh`.

## Itens

| Item | Como verificar | Esperado |
|---|---|---|
| C01 | No clone limpo: `npm run up` | sai com 0; `curl -s localhost:3000/health` → `{"ok":true}` |
| C02 | `web_login A organizador.a@catraca.dev catraca123`; idem B e participante | `303` nas três |
| C03 | `npm run down`; `curl -m 3 localhost:3000/health`; `docker ps --filter label=com.docker.compose.project=catraca -q` | curl falha; lista vazia |
| C04 | `npm run up` de novo; repetir C02 | sobe sem erro; `303` nas três (seed idempotente, sem duplicar) |
| C05 | `npm run gates` | sai com 0; a saída mostra testes de `node --test` executados |
| C06 | `web_signup P "Ana" ana.$(date +%s)@ex.com senha12345`; repetir com o mesmo e-mail | `303`; depois `422` |
| C07 | `web_login P <email> errada` | `401` e corpo com "E-mail ou senha inválidos" |
| C08 | Logado como P: `curl -b $(jar P) -X POST localhost:3000/logout -o /dev/null -w '%{http_code}'`; depois `web_get P /organizer` | `303`; depois 302 para `/login` |
| C09 | `web_get - /organizer` (deslogado) | `302` com `Location: /login...` |
| C10 | Como participante: `web_get S /organizer` | `403`; corpo sem lista de eventos |
| C11 | `grep -rn "GATEWAY_MODE\|PAYMENT" .env.example docker-compose.yml` e README | modo `simulated` padrão; nenhuma chave de pagamento exigida |
| C12 | `cat AGENTS.md CLAUDE.md` | AGENTS.md tem subir/derrubar/gates e mapa; CLAUDE.md aponta para AGENTS.md |

## Mapeamento critério → itens

| Critério | Itens |
|---|---|
| F01-AC01 | C01, C02 |
| F01-AC02 | C03, C04 |
| F01-AC03 | C05 |
| F01-AC04 | C02, C04 |
| F01-AC05 | C06, C07, C08 |
| F01-AC06 | C09, C10 |
| F01-AC07 | C11, C12 |
