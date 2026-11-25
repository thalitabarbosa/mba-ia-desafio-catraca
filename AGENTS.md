# AGENTS.md — porta de entrada dos agentes

Projeto **Catraca**: venda de ingressos para eventos pequenos. Este arquivo vale para qualquer agente
(Claude Code, Codex, Gemini CLI, Cursor). Leia-o inteiro antes de qualquer tarefa.

## Comandos

| O quê | Comando |
|---|---|
| Subir tudo (build, migração, seed) | `npm run up` → http://localhost:3000 |
| Derrubar tudo | `npm run down` (mantém dados) · `npm run reset` (apaga o volume) |
| Gates (artefatos + testes) | `npm run gates` |
| Fluxo do avaliador completo | `npm run flow` (produto no ar; ~3 min) · `npm run flow -- --harness` |
| Gate final de entrega | `node scripts/check-artifacts.mjs --final` |

Gateway simulado é o padrão. Para testes locais rápidos: `GATEWAY_DELAY_SCALE=0.1 npm run up`
(**nunca** mude o padrão `1` do `docker-compose.yml`).

## Mapa dos artefatos

| Artefato | Caminho |
|---|---|
| PRD (features, grafo, waves, critérios, fora de escopo) | `docs/prd.md` |
| Arquitetura compartilhada (stack, schema, rotas, ganchos de HTML) | `docs/architecture.md` |
| Spec / plano / contrato / relatórios por feature | `docs/features/<Fxx>-<slug>/{spec.md,plan.md,contract.md,reports/}` |
| Estado do projeto | `docs/state.json` |
| Modelo de relatório | `docs/templates/evaluation-report.md` |
| Avaliador (subagente) | `.claude/agents/evaluator.md` |
| Roteiro de execução | `docs/runbook.md` |
| Helpers de verificação (curl) | `scripts/lib/flow.sh` |

## Regras do projeto

1. **Uma feature por sessão/branch.** Antes de começar, leia `docs/state.json`: só comece a feature se
   todas as que ela consome (coluna "Consome" do PRD) estão `done`.
2. **Não reimplemente o que outra feature provê.** Vagas, compra e status do ingresso só via `src/tickets/service.js`;
   "à venda" só via `isOnSale`/`listOnSaleEvents`; dono do evento só via `getOwnedEvent`. Se precisar mudar uma
   interface provida, ajuste a spec dona e os consumidores no mesmo PR.
3. **`docs/architecture.md` é contrato.** Rotas, campos de formulário e ganchos de HTML de lá são lidos por scripts.
4. **Contrato fixo da API de parceiros** (brief) não muda: campos, status HTTP, códigos de erro.
5. Cada feature entrega testes em `test/<fxx>-*.test.js`; `npm run gates` tem que passar antes de pedir avaliação.
6. **Quem implementa não avalia.** Ao terminar: atualize `docs/state.json` (`in_review`), commit, e peça ao
   subagente `evaluator` (contexto novo). Nunca escreva nem edite relatórios em `reports/`.
7. **Relatórios são imutáveis.** Reprovou? Corrija o código e peça uma avaliação **nova** (arquivo novo).
8. Depois de cada relatório: atualize `docs/state.json` (`status`, `latestReport`, `log`) e commite junto com o relatório.
9. Mensagens de commit: `feat(F04): ...`, `fix(F04): ...`, `test(F04): ...`, `docs(F04): ...`, `eval(F04): ...`.
10. Nada de chaves reais, deploy, e-mail ou features fora do PRD (ver "Fora de escopo").

## Regras de negócio

O brief (R01–R13) está resumido nos critérios de `docs/prd.md`. Em caso de dúvida, o critério do PRD e o
contrato da feature mandam; se eles contradisserem o brief, pare e registre a dúvida no PR.
