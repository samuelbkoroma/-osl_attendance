#!/usr/bin/env bash
# Local database verification for the Orange SL workforce migrations.
# Boots a throwaway PostgreSQL cluster, applies the Supabase shim + the real
# migrations, then runs scripts/db-test/test.sql assertions.
# Usage:  bash scripts/db-test/run.sh          (run tests, then tear down)
#         KEEP=1 bash scripts/db-test/run.sh   (leave the cluster running)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PGDATA="${PGDATA:-/var/folders/0j/sbfyz0pj0r9ch9v8hntgnn800000gn/T/opencode/pgtest/data}"
PGPORT="${PGPORT:-54329}"
PGHOST="${PGHOST:-/var/folders/0j/sbfyz0pj0r9ch9v8hntgnn800000gn/T/opencode/pgtest}"
PSQL="/usr/local/bin/psql -h $PGHOST -p $PGPORT -U postgres -v ON_ERROR_STOP=1 -q"

export PGDATA PGHOST

if [ "${SKIP_INIT:-0}" != "1" ]; then
  /usr/local/bin/pg_ctl -D "$PGDATA" status >/dev/null 2>&1 && /usr/local/bin/pg_ctl -D "$PGDATA" stop -m immediate >/dev/null 2>&1 || true
  rm -rf "$PGDATA"
  /usr/local/bin/initdb -D "$PGDATA" -U postgres --auth=trust >/dev/null
  /usr/local/bin/pg_ctl -D "$PGDATA" -o "-p $PGPORT -k $PGHOST -c listen_addresses=" -l "$PGDATA/postgres.log" start >/dev/null
  sleep 1
fi

echo "== applying shim"
$PSQL -f "$ROOT/scripts/db-test/shim.sql"

echo "== applying migrations"
for f in 020_workforce_schema 021_workforce_functions 022_workforce_rls 023_cutoff_cron 024_seed_reference 025_realtime_publication 026_workforce_hierarchy 027_workforce_alerts 028_workforce_alerts_rls 030_daily_digest 032_attendance_immediate_alerts 033_workflow_completion 034_offboarding 035_bulk_import_and_avatars 036_kiosk_and_manager_reviews; do
  echo "   -> $f"
  $PSQL -f "$ROOT/supabase/migrations/$f.sql"
done

echo "== running assertions"
$PSQL -f "$ROOT/scripts/db-test/test.sql"

if [ "${KEEP:-0}" != "1" ]; then
  /usr/local/bin/pg_ctl -D "$PGDATA" stop -m fast >/dev/null 2>&1 || true
  echo "== cluster stopped"
fi
