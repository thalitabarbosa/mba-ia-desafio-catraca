#!/bin/sh
# Derruba tudo que o up.sh iniciou. Mantém o volume do banco (para provar a seed idempotente).
# Use --volumes (npm run reset) para apagar os dados também.
set -eu
cd "$(dirname "$0")/.."
if [ "${1:-}" = "--volumes" ]; then
  docker compose down --remove-orphans --volumes
else
  docker compose down --remove-orphans
fi
# Garante que nenhum resto dos gates ficou rodando.
docker compose -f docker-compose.test.yml down --remove-orphans --volumes >/dev/null 2>&1 || true
echo "Catraca derrubada."
