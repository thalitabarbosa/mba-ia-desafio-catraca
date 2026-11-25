# Runbook — como executar o desafio com Claude Code

Tempo estimado: 6–10 h de agente, com você só disparando prompts, revisando PRs e fazendo merge.
Pré-requisitos na sua máquina: Docker rodando, Node.js LTS, Git, `gh` autenticado, Claude Code.

```bash
git clone https://github.com/thalitabarbosa/mba-ia-desafio-catraca && cd mba-ia-desafio-catraca
```

## O ciclo de cada feature (sequencial: F01, F02, F03, F07)

**1. Implementar** — sessão nova do Claude Code na raiz do repo:

```text
Leia AGENTS.md. Implemente a feature F0X seguindo docs/features/F0X-*/spec.md e plan.md, sem sair do escopo.
Trabalhe na branch feat/F0X-<slug> criada a partir da main. Commite por etapa do plano.
Quando `npm run gates` passar e você tiver verificado à mão os itens do contrato, marque F0X como in_review
no docs/state.json, commite e faça push. NÃO escreva relatório de avaliação.
```

**2. Avaliar** — na **mesma** sessão serve (o subagente nasce com contexto vazio), mas uma sessão nova é ainda mais isolada:

```text
Use o subagente evaluator para avaliar a feature F0X no commit <sha do HEAD da branch>.
Depois: commite o relatório que ele criar (eval(F0X): ...), atualize docs/state.json
(status done se APROVADO, changes_requested se REPROVADO; latestReport; uma linha no log) e faça push.
```

**3. Se reprovou** — volte ao passo 1 com:

```text
O relatório <caminho> reprovou os itens <lista>. Corrija só isso, rode os gates, marque in_review e faça push.
```

E repita o passo 2 (gera **outro** relatório; nunca edite o antigo).

**4. PR e merge**

```bash
gh pr create --base main --head feat/F0X-<slug> --title "F0X: <nome>" --body "Spec: docs/features/F0X-*/spec.md · Relatório: <caminho>"
gh pr merge --merge   # use merge commit (não squash) para preservar a história; squash também vale
git checkout main && git pull
```

## A wave paralela (W4: F04, F05, F06)

Pré-condição: F01, F02, F03 `done` e mergeadas na main.

```bash
git checkout main && git pull
git worktree add ../catraca-F04 -b feat/F04-storefront
git worktree add ../catraca-F05 -b feat/F05-partner-api
git worktree add ../catraca-F06 -b feat/F06-checkin-panel
```

Abra **três terminais** (ou `tmux` com três painéis), um em cada pasta, e rode `claude` nos três.
Cole o prompt abaixo nos três **quase ao mesmo tempo** (trocando o ID):

```text
Leia AGENTS.md. Você é o implementador da F0X, na wave paralela W4, neste worktree (branch já criada).
PRIMEIRO, antes de qualquer código: crie um commit vazio `git commit --allow-empty -m "chore(F0X): start"`,
faça push (`git push -u origin HEAD`) e abra um PR draft para main com `gh pr create --draft --fill`.
Depois implemente conforme docs/features/F0X-*/spec.md e plan.md. Outras duas features estão sendo
implementadas em paralelo e vão mexer em src/routes.js: só acrescente a sua linha.
Ao terminar: gates passando, state.json com F0X in_review, push. Não escreva relatório.
```

> Por que o commit vazio primeiro? A prova do paralelismo é: *o primeiro commit de cada PR é anterior ao
> último commit dos outros*. Com os três "start" feitos no início, isso fica garantido.

**Porta 3000:** só um ambiente pode estar no ar por vez (mesmo projeto compose). Os agentes vão alternar
`npm run up`/`down` — tudo bem; os **gates** rodam em projeto isolado e não brigam com a porta.
Se dois agentes disputarem o `npm run up`, peça a eles que testem com `npm run gates` e deixe a verificação
manual para quando cada um terminar.

Avaliação: quando cada um terminar, em cada worktree, rode o passo 2 do ciclo (avaliador no sha da branch).

Merge (conflito esperado em `src/routes.js` e talvez em views/format helpers):

```bash
gh pr ready <n>  # tira do draft
gh pr merge <PR F05> --merge                         # primeiro o que menos mexe em views
# nos outros: atualize com a main e resolva conflitos
cd ../catraca-F04 && git fetch origin && git merge origin/main   # resolva, rode npm run gates, push
gh pr merge <PR F04> --merge
cd ../catraca-F06 && git fetch origin && git merge origin/main && npm run gates && git push
gh pr merge <PR F06> --merge
git worktree remove ../catraca-F04 ../catraca-F05 ../catraca-F06   # um por vez
```

Anote os três links de PR no README (seção "Mapa dos artefatos").

## W5 (F07) e fechamento

1. Ciclo normal para F07. O contrato dela inclui `npm run flow` — é aqui que as features se encontram.
2. Depois do último merge, a **prova final** a partir de um clone limpo:

   ```bash
   cd /tmp && rm -rf catraca-final && git clone https://github.com/thalitabarbosa/mba-ia-desafio-catraca catraca-final
   cd catraca-final && npm run up && npm run flow -- --harness && node scripts/check-artifacts.mjs --final
   ```

3. Rode a rajada várias vezes: `source scripts/lib/flow.sh; web_login A organizador.a@catraca.dev catraca123`
   e repita a etapa 15 do fluxo (ou o próprio `npm run flow`) 3–5 vezes.
4. Qualquer FAIL: abra `fix(Fxx)` → nova avaliação da feature afetada → merge → repita o passo 2.
5. Preencha no README a seção "Decisões" se algo mudou e os links dos PRs.

## Dicas

- Para iterar rápido nos testes manuais: `GATEWAY_DELAY_SCALE=0.1 npm run up`. Avaliação e fluxo final sempre no padrão (1).
- Se o agente "jurar" que está pronto, a resposta é sempre: `npm run gates` e o avaliador.
- `docs/state.json` é a memória entre sessões: comece toda sessão pedindo ao agente para lê-lo.
