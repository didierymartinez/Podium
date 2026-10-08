#!/usr/bin/env bash
# Prepara PostgreSQL local para desarrollo: base de datos, migraciones y rol de la app con login.
# Uso: ./scripts/db-setup-local.sh   (requiere MIGRATIONS_DATABASE_URL y DATABASE_URL en .env)
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; source .env; set +a

APP_PASSWORD=$(node -e "console.log(new URL(process.env.DATABASE_URL).password)")
DB_NAME=$(node -e "console.log(new URL(process.env.MIGRATIONS_DATABASE_URL).pathname.slice(1))")
ADMIN_URL=$(node -e "const u=new URL(process.env.MIGRATIONS_DATABASE_URL);u.pathname='/postgres';console.log(u.toString())")

psql "$ADMIN_URL" -tc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1 \
  || psql "$ADMIN_URL" -c "CREATE DATABASE \"$DB_NAME\""

pnpm db:migrate
psql "$MIGRATIONS_DATABASE_URL" -c "ALTER ROLE podium_app LOGIN PASSWORD '$APP_PASSWORD'"
echo "Base de datos local lista"
