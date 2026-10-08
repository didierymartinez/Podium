#!/usr/bin/env bash
# Arranca el build standalone (mismo artefacto que Docker) para las pruebas E2E.
# Requiere `pnpm build` previo con NEXT_PUBLIC_AUTH_PROVIDER=dev.
set -euo pipefail
cd "$(dirname "$0")/.."
if [ -f .env ]; then set -a; source .env; set +a; fi

rm -rf .next/standalone/.next/static .next/standalone/public
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public

cd .next/standalone
AUTH_RATE_LIMIT="${AUTH_RATE_LIMIT:-10000/60}" PLATFORM_ADMIN_EMAILS="${PLATFORM_ADMIN_EMAILS:-e2e-admin@example.com}" ALLOW_DEV_AUTH=true PORT="${E2E_PORT:-3100}" HOSTNAME=127.0.0.1 exec node server.js
