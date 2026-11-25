# Avaliação — Fxx <nome da feature>

- **Data:** AAAA-MM-DD HH:mm (America/Sao_Paulo)
- **Commit avaliado:** <sha completo> (branch `<branch>`)
- **Ferramenta:** Claude Code <versão> — subagente `evaluator` (contexto novo, sem acesso à sessão do implementador)
- **Modelo:** <id do modelo>
- **Contrato:** `docs/features/Fxx-.../contract.md` no mesmo commit
- **Ambiente:** clone limpo em `/tmp/eval-Fxx-<sha curto>`; `npm run up`; `GATEWAY_DELAY_SCALE=1`

## Pré-requisitos

| Pré-requisito | OK? | Evidência |
|---|---|---|
| ... | sim/não | saída |

## Itens

| Item | Veredito | Evidência |
|---|---|---|
| C01 | APROVADO / REPROVADO | comando executado + saída relevante (HTTP status, corpo, trecho de HTML) |

### Evidências detalhadas

<blocos de código com os comandos e saídas mais importantes, um por item>

## Mapeamento

| Critério | Itens | Resultado |
|---|---|---|
| Fxx-AC01 | C01, C02 | APROVADO |

## Veredito final: APROVADO | REPROVADO

Itens reprovados (se houver) e o que foi observado — sem sugerir implementação.
