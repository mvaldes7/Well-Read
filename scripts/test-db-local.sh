#!/usr/bin/env bash
# Runs the migrations + tests/db/*.sql against a THROWAWAY local Postgres cluster (temp dir, Unix socket only,
# no TCP). It never reads DATABASE_URL or any other connection setting, and refuses to run if one is set (including DRILLDOWN_DB_URL).
# Usage: scripts/test-db-local.sh   (needs initdb/pg_ctl/psql; PG_BIN overrides their directory)
set -euo pipefail
bad="$(env | cut -d= -f1 | grep -E '(DATABASE|POSTGRES|SUPABASE|NEON|_DB_URL)|^PG' || true)"
if [ -n "$bad" ]; then echo "refusing: DB env vars are set ($(echo $bad | tr '\n' ' ')); unset them first" >&2; exit 2; fi
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PG_BIN="${PG_BIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
export PATH="$PG_BIN:$PATH"
TMP="$(mktemp -d)"
trap 'pg_ctl -D "$TMP/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$TMP"' EXIT
initdb -D "$TMP/data" -U postgres -A trust >/dev/null
pg_ctl -D "$TMP/data" -o "-c listen_addresses='' -k $TMP" -l "$TMP/log" -w start >/dev/null
PSQL=(psql -X -q -t -A -v ON_ERROR_STOP=1 -h "$TMP" -U postgres -d postgres)
"${PSQL[@]}" -f "$ROOT/tests/db/supabase-stub.sql"
for m in "$ROOT"/supabase/migrations/*.sql; do "${PSQL[@]}" -f "$m"; done
for t in "$ROOT"/tests/db/*.test.sql; do echo "== $(basename "$t")"; "${PSQL[@]}" -f "$t"; done
echo "== race.sh"; "$ROOT/tests/db/race.sh" "${PSQL[@]}"
echo "local DB tests: OK"
