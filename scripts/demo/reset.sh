#!/usr/bin/env bash
# Recrea la base podium_demo (local) con la escuela de demostración (#76).
set -euo pipefail
cd "$(dirname "$0")/../.."
ADMIN=${DEMO_ADMIN_URL:-postgres://postgres:postgres@localhost:5432}
psql "$ADMIN/postgres" -qc "DROP DATABASE IF EXISTS podium_demo WITH (FORCE)" -qc "CREATE DATABASE podium_demo"
MIGRATIONS_DATABASE_URL="$ADMIN/podium_demo" pnpm -s db:migrate
DEMO_DATABASE_URL=${DEMO_DATABASE_URL:-postgres://podium_app:podium_app_dev@localhost:5432/podium_demo} \
DEMO_OWNER_DATABASE_URL="$ADMIN/podium_demo" \
DATA_ENCRYPTION_KEY=${DATA_ENCRYPTION_KEY:-ZGV2LWtleS1kZXYta2V5LWRldi1rZXktZGV2LWtleTE=} \
  pnpm -s tsx scripts/demo/seed.mts
