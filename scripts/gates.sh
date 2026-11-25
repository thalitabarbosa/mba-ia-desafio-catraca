#!/bin/sh
# Gates do projeto: (1) artefatos de especificação/avaliação coerentes; (2) testes automatizados
# em containers isolados (projeto compose "catraca-gates", banco descartável).
set -eu
cd "$(dirname "$0")/.."

echo "== Gate 1/2: artefatos (PRD, specs, contratos, estado, relatórios)"
node scripts/check-artifacts.mjs

echo "== Gate 2/2: testes automatizados"
status=0
docker compose -f docker-compose.test.yml up --build --abort-on-container-exit --exit-code-from test test || status=$?
docker compose -f docker-compose.test.yml down --remove-orphans --volumes >/dev/null 2>&1 || true

if [ "$status" -ne 0 ]; then
  echo "Gates: FALHOU (testes, código $status)"
  exit "$status"
fi
echo "Gates: OK"
