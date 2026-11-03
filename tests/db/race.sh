#!/usr/bin/env bash
# Concurrency test for drilldown_reserve(), run by scripts/test-db-local.sh against the throwaway cluster only.
# Usage: race.sh <psql args...>
set -euo pipefail
PSQL=("$@")
"${PSQL[@]}" -c "truncate public.drilldown_usage_user, public.drilldown_usage_global;
  insert into auth.users select ('00000000-0000-0000-0000-1' || lpad(g::text, 11, '0'))::uuid, now() from generate_series(1, 40) g;"
TMPD="$(mktemp -d)"; trap 'rm -rf "$TMPD"' EXIT
reserve() { "${PSQL[@]}" -c "set role drilldown_server; select public.drilldown_reserve('$1', $2, true);" >/dev/null 2>"$TMPD/err.$3" && echo ok >"$TMPD/ok.$3" || true; }
# 40 users at once, 4 calls + 1 lesson each: exactly 25 may succeed (100 calls / 25 lessons).
for g in $(seq 1 40); do reserve "00000000-0000-0000-0000-1$(printf %011d "$g")" 4 "g$g" & done; wait
n=$(ls "$TMPD" | grep -c '^ok\.g' || true)
got=$("${PSQL[@]}" -c "select lessons || '/' || calls from public.drilldown_usage_global")
[ "$n" = 25 ] && [ "$got" = "25/100" ] || { echo "race (global): $n ok, counters $got" >&2; exit 1; }
for f in "$TMPD"/err.g*; do if [ -s "$f" ] && ! grep -q 'drilldown cap:' "$f"; then cat "$f" >&2; exit 1; fi; done
# one user, 6 at once: exactly 2 lessons.
"${PSQL[@]}" -c "truncate public.drilldown_usage_user, public.drilldown_usage_global;"
for i in $(seq 1 6); do reserve 00000000-0000-0000-0000-100000000001 1 "u$i" & done; wait
n=$(ls "$TMPD" | grep -c '^ok\.u' || true)
got=$("${PSQL[@]}" -c "select lessons || '/' || calls from public.drilldown_usage_user")
[ "$n" = 2 ] && [ "$got" = "2/2" ] || { echo "race (user): $n ok, counters $got" >&2; exit 1; }
echo "race.sh: concurrent reservations respect 25/100 global and 2/user"
