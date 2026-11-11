#!/usr/bin/env bash
# Runs the end-to-end flows in order against the local Supabase, with database checks in
# between. Each flow is one person on one phone; the checks prove the tap really reached
# the database. Expects: `supabase start` running, the app installed on a booted emulator,
# and `maestro` on the PATH (see .github/workflows/e2e.yml).
set -euo pipefail
cd "$(dirname "$0")"

DB_URL=${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}
OUT=${OUT:-output}
mkdir -p "$OUT"

sql() { psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f "$1"; }

flow() {
  local name=$1
  shift
  echo "::group::$name"
  # An empty mailbox, so the sign-in reads this flow's code and not an older one.
  curl -fsS -X DELETE http://localhost:54324/api/v1/messages >/dev/null
  if ! maestro test --format junit --output "$OUT/$name.xml" --debug-output "$OUT/$name" "flows/$name.yaml"; then
    # Keep what the phone showed when it failed: a screenshot and the tree of views Maestro saw.
    adb exec-out screencap -p > "$OUT/$name-failed.png" || true
    maestro hierarchy > "$OUT/$name-failed-hierarchy.json" 2>/dev/null || true
    echo "Words on the screen when it failed:"
    python3 scripts/screen-words.py "$OUT/$name-failed-hierarchy.json" || true
    exit 1
  fi
  for check in "$@"; do sql "sql/$check.sql"; done
  echo "::endgroup::"
}

sql seed.sql

flow 01-driver-posts-trip     check-01-trip-posted
flow 02-rider-requests-seat   check-02-seat-requested
flow 03-driver-accepts        check-03-accepted
sql sql/trip-day.sql
flow 04-rider-did-you-ride    check-04-rider-answered
flow 05-driver-overdue-start  check-05-started

echo "All end-to-end flows passed"
