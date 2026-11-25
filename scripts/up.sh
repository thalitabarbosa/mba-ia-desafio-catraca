#!/bin/sh
# Sobe banco + app (migra e roda a seed no start do app) e espera ficar saudável.
set -eu
cd "$(dirname "$0")/.."
docker compose up -d --build --wait
echo "Catraca no ar em http://localhost:3000  (API de parceiros: http://localhost:3000/api/partner)"
