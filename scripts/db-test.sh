#!/usr/bin/env bash
# Recria o banco de teste, aplica as migrações e roda os testes de permissão.
#
# Uso:
#   DATABASE_URL=postgres://postgres@localhost:5432/postgres ./scripts/db-test.sh
#
# Em Postgres puro (CI, máquina sem Docker) aplica antes o shim que imita o Supabase.
# Para usar um Supabase local já com as migrações aplicadas: SKIP_SETUP=1.
set -euo pipefail

cd "$(dirname "$0")/.."
: "${DATABASE_URL:?defina DATABASE_URL}"
DB_TEST="${DB_TEST_NAME:-obra_test}"

psql_admin() { psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q "$@"; }

if [[ "${SKIP_SETUP:-0}" != "1" ]]; then
  psql_admin -c "drop database if exists ${DB_TEST}" -c "create database ${DB_TEST}"
  TEST_URL="$(sed -E "s#/[^/?]+(\?|$)#/${DB_TEST}\1#" <<<"$DATABASE_URL")"
  psql "$TEST_URL" -v ON_ERROR_STOP=1 -q -f supabase/tests/00_supabase_shim.sql
  for f in supabase/migrations/*.sql; do
    echo "→ migração $(basename "$f")"
    psql "$TEST_URL" -v ON_ERROR_STOP=1 -q -f "$f"
  done
else
  TEST_URL="$DATABASE_URL"
fi

psql "$TEST_URL" -v ON_ERROR_STOP=1 -q -f supabase/tests/01_helpers.sql

status=0
for f in supabase/tests/[1-9]*_test.sql; do
  echo "→ teste $(basename "$f")"
  # pipefail faz a falha do psql chegar até aqui mesmo com o sed no pipe
  if ! psql "$TEST_URL" -v ON_ERROR_STOP=1 -q -f "$f" 2>&1 | sed -n 's/^.*NOTICE:  /  /p; /FALHOU\|ERROR/p'; then
    status=1
  fi
done

if [[ $status -eq 0 ]]; then echo "✔ testes do banco passaram"; else echo "✘ testes do banco falharam"; fi
exit $status
