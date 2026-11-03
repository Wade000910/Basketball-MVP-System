#!/usr/bin/env bash
# Runs the migration and RLS tests against a throwaway local PostgreSQL 16 cluster.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
bin="${PG_BIN:-/usr/lib/postgresql/16/bin}"
dir="$(mktemp -d)"; chmod 777 "$dir"
run() { if [ "$(id -u)" = 0 ]; then su postgres -s /bin/bash -c "$*"; else bash -c "$*"; fi; }
run "$bin/initdb -D '$dir/data' -A trust -U postgres >/dev/null"
run "$bin/pg_ctl -D '$dir/data' -o '-k $dir -p 54329 -c listen_addresses=' -l '$dir/log' -w start >/dev/null"
trap 'run "$bin/pg_ctl -D \"$dir/data\" -m immediate stop >/dev/null"; rm -rf "$dir"' EXIT
psql=(psql -h "$dir" -p 54329 -U postgres -d postgres -v ON_ERROR_STOP=1 -q -At)
"${psql[@]}" -f "$here/supabase-shim.sql"
for f in "$here"/../migrations/*.sql; do "${psql[@]}" -f "$f"; done
"${psql[@]}" -f "$here/rls.test.sql" -o /dev/null 2>&1 | sed 's/^psql:[^ ]* NOTICE:  //'
echo "RLS tests passed"
