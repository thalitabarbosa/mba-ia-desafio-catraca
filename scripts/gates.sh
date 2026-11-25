#!/bin/sh
# Gates do projeto: (1) artefatos de especificação/avaliação coerentes; (2) testes automatizados
# em containers isolados (projeto compose "catraca-gates", banco descartável).
set -eu
cd "$(dirname "$0")/.."

echo "== Gate 1/2: artefatos (PRD, specs, contratos, estado, relatórios)"
node scripts/check-artifacts.mjs

echo "== Gate 2/2: testes automatizados"
# Projeto compose por pasta: worktrees paralelos não disputam containers.
PROJECT="catraca-gates-$(basename "$PWD" | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z0-9-')"
status=0
docker compose -p "$PROJECT" -f docker-compose.test.yml ${GATES_EXTRA_COMPOSE:+-f "$GATES_EXTRA_COMPOSE"} up --build --abort-on-container-exit --exit-code-from test test || status=$?
docker compose -p "$PROJECT" -f docker-compose.test.yml down --remove-orphans --volumes >/dev/null 2>&1 || true

if [ "$status" -ne 0 ]; then
  echo "Gates: FALHOU (testes, código $status)"
  exit "$status"
fi
echo "Gates: OK"
