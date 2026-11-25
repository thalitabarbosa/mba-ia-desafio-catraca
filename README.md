# Catraca

Venda de ingressos para eventos pequenos (shows em bar, workshops, meetups) — MVP construído em
modo agente, com especificação dirigida (SDD), waves de features e avaliação independente.

## Como rodar

Pré-requisitos: Linux ou macOS (Windows via WSL), Docker, Git e Node.js LTS. Nenhuma chave de pagamento.

| O quê | Comando |
|---|---|
| Subir (build, migração e seed, sem nenhum outro passo) | `npm run up` |
| Derrubar tudo o que a subida iniciou | `npm run down` |
| Gates (artefatos + testes automatizados) | `npm run gates` |
| Fluxo do avaliador automatizado (produto no ar) | `npm run flow` · com harness: `npm run flow -- --harness` |
| Apagar também os dados | `npm run reset` |

Atrás de proxy corporativo com CA próprio, o build aceita o secret opcional `npm_ca` (ver `Dockerfile`) e os
gates aceitam um compose extra em `GATES_EXTRA_COMPOSE`; nada disso é necessário numa máquina comum.

O modo padrão usa o **gateway simulado** (respostas conforme o final do cartão). `GATEWAY_DELAY_SCALE`
só existe para acelerar testes locais; o padrão é `1`, que segue a tabela do brief.

## Endereços

| | URL |
|---|---|
| Produto (`$WEB`) | http://localhost:3000 |
| API de parceiros (`$API`) | http://localhost:3000 (rotas em `/api/partner/...`) |

## Credenciais (seed)

| Conta | E-mail | Senha |
|---|---|---|
| Organizador A | `organizador.a@catraca.dev` | `catraca123` |
| Organizador B | `organizador.b@catraca.dev` | `catraca123` |
| Participante | `participante@catraca.dev` | `catraca123` |
| Chave de parceiro (`$KEY`, header `X-Api-Key`) | `catraca-parceiro-dev` | — |

## Mapa dos artefatos

| Artefato | Onde |
|---|---|
| PRD (features, provê/consome, grafo, waves, critérios, fora de escopo) | [`docs/prd.md`](docs/prd.md) |
| Arquitetura compartilhada | [`docs/architecture.md`](docs/architecture.md) |
| F01 Plataforma, contas e harness | [`docs/features/F01-platform/`](docs/features/F01-platform/) |
| F02 Eventos do organizador | [`docs/features/F02-events/`](docs/features/F02-events/) |
| F03 Compra e gateway simulado | [`docs/features/F03-purchase/`](docs/features/F03-purchase/) |
| F04 Vitrine e Meus ingressos | [`docs/features/F04-storefront/`](docs/features/F04-storefront/) |
| F05 API de parceiros | [`docs/features/F05-partner-api/`](docs/features/F05-partner-api/) |
| F06 Check-in e painel | [`docs/features/F06-checkin-panel/`](docs/features/F06-checkin-panel/) |
| F07 Cancelamento de evento | [`docs/features/F07-cancel/`](docs/features/F07-cancel/) |
| Cada pasta de feature | `spec.md`, `plan.md`, `contract.md`, `reports/` |
| Arquivo de estado | [`docs/state.json`](docs/state.json) |
| Porta de entrada dos agentes | [`AGENTS.md`](AGENTS.md) (o `CLAUDE.md` aponta para ele) |
| Avaliador | [`.claude/agents/evaluator.md`](.claude/agents/evaluator.md) |
| Roteiro de execução | [`docs/runbook.md`](docs/runbook.md) |

**PRs da wave paralela (W4):**

- F04 Vitrine e Meus ingressos — https://github.com/thalitabarbosa/mba-ia-desafio-catraca/pull/4
- F05 API de parceiros — https://github.com/thalitabarbosa/mba-ia-desafio-catraca/pull/5
- F06 Check-in e painel — https://github.com/thalitabarbosa/mba-ia-desafio-catraca/pull/6

As três branches foram criadas da `main` (com F01–F03 prontas) em worktrees separados e implementadas por
três agentes ao mesmo tempo; o primeiro commit de cada PR (`chore(Fxx): start`) é anterior ao último commit
dos outros. Conflitos de merge esperados (e resolvidos) em `src/routes.js` e `docs/state.json`.

Todos os PRs: [#1 F01](https://github.com/thalitabarbosa/mba-ia-desafio-catraca/pull/1) ·
[#2 F02](https://github.com/thalitabarbosa/mba-ia-desafio-catraca/pull/2) ·
[#3 F03](https://github.com/thalitabarbosa/mba-ia-desafio-catraca/pull/3) ·
[#4 F04](https://github.com/thalitabarbosa/mba-ia-desafio-catraca/pull/4) ·
[#5 F05](https://github.com/thalitabarbosa/mba-ia-desafio-catraca/pull/5) ·
[#6 F06](https://github.com/thalitabarbosa/mba-ia-desafio-catraca/pull/6) ·
[#7 F07](https://github.com/thalitabarbosa/mba-ia-desafio-catraca/pull/7)

## Decisões

- **Stack:** Node.js 22 + Express + EJS (HTML renderizado no servidor) + PostgreSQL 16, tudo em Docker
  Compose. Um só runtime (Node, que a máquina do avaliador já tem), sem build de front-end, e HTML
  simples que scripts com `curl` conseguem verificar. Postgres pelo controle explícito de transações e locks.
- **R07 sob concorrência:** toda compra roda numa transação que trava a linha do evento
  (`SELECT ... FOR UPDATE`), conta pendentes + confirmados e só então insere o ingresso. Compras do mesmo
  evento ficam serializadas; o mesmo lock é usado na edição de lotação e no cancelamento. Provado por
  teste automatizado (30 compras simultâneas × 20 rodadas) e pela rajada do fluxo do avaliador repetida.
- **Gateway assíncrono:** a compra decide o resultado simulado e grava `gateway_result` e `gateway_due_at`
  no ingresso, respondendo na hora (202/`pending`). Um worker no processo do app aplica, a cada 250 ms,
  as respostas vencidas com `UPDATE ... WHERE status = 'pending'`. Essa guarda faz respostas tardias
  serem ignoradas depois do cancelamento (R11), e o vencimento no banco sobrevive a reinícios.
- **Integração entre features:** regras com dono único (vagas e compra em `src/tickets/service.js`,
  "à venda" em `isOnSale`, dono do evento em `getOwnedEvent`) e a página de gestão montada por *slots*
  (painel/check-in da F06 e cancelamento da F07 se registram sem editar a view da F02). Cada critério
  cross-feature do PRD tem item verificável em contrato, e `npm run flow` executa o fluxo do avaliador inteiro.
- **Avaliação isolada:** cada feature é avaliada pelo subagente `evaluator` (contexto vazio, só lê o
  contrato), num clone limpo do commit avaliado, e gera um relatório novo em `reports/`. O gate de
  artefatos reprova qualquer relatório alterado depois de commitado e confere o estado contra os relatórios.

## Regras de entrega

Um projeto por repositório; tudo na `main`. Os PRs da wave paralela continuam visíveis no GitHub
(as branches podem ser apagadas depois do merge).
