#!/usr/bin/env bash
#
# Development-only: seed or reset the private twelve-week plan for one user
# against the LOCAL Supabase database, without going through the app's onboarding
# flow. Handy for re-seeding while building the plan-facing screens.
#
# It impersonates the given user (set role authenticated + jwt sub) exactly as
# the app's RPC call would, so row-level security still applies and every row is
# owned by that user. It refuses to run against anything other than a local
# database — never point it at a remote or production project.
#
# Usage:
#   scripts/dev-seed-plan.sh <auth-user-uuid> [--reset]
#
# Examples:
#   scripts/dev-seed-plan.sh 11111111-1111-4111-8111-111111111111
#   scripts/dev-seed-plan.sh 11111111-1111-4111-8111-111111111111 --reset
#
# The start date is resolved to the next Monday on or after today, matching
# resolvePlanStartDate in the app. Pass --reset to delete and rebuild an
# existing plan; without it, a user who already has an active plan is untouched.

set -euo pipefail

USER_ID="${1:-}"
if [[ -z "${USER_ID}" ]]; then
  echo "Usage: scripts/dev-seed-plan.sh <auth-user-uuid> [--reset]" >&2
  exit 2
fi

RESET="false"
if [[ "${2:-}" == "--reset" ]]; then
  RESET="true"
fi

DB_URL="${SUPABASE_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"

# Safety rail: only ever touch a local database.
if [[ "${DB_URL}" != *"127.0.0.1"* && "${DB_URL}" != *"localhost"* ]]; then
  echo "Refusing to run: SUPABASE_DB_URL is not a local database (${DB_URL})." >&2
  echo "This command is for local development only." >&2
  exit 1
fi

# Impersonate the user exactly as the app's RPC call would, so RLS applies.
read -r -d '' SQL <<SQL || true
begin;
  set local role authenticated;
  select set_config('request.jwt.claim.sub', '${USER_ID}', true);
  select set_config('request.jwt.claim.role', 'authenticated', true);
  select public.seed_private_plan(
    (current_date + ((8 - extract(isodow from current_date))::int % 7))::date,
    ${RESET}
  ) as plan_id;
commit;
SQL

# Prefer a local psql; otherwise run inside the local Supabase database container
# so the command works without a separate Postgres client installed.
if command -v psql >/dev/null 2>&1; then
  printf '%s' "${SQL}" | psql "${DB_URL}" -v ON_ERROR_STOP=1
else
  CONTAINER="$(docker ps --filter 'name=supabase_db_' --format '{{.Names}}' | head -n 1)"
  if [[ -z "${CONTAINER}" ]]; then
    echo "No local psql and no running Supabase database container found." >&2
    echo "Start the stack with 'npm run supabase:start' first." >&2
    exit 1
  fi
  printf '%s' "${SQL}" | docker exec -i "${CONTAINER}" psql -U postgres -d postgres -v ON_ERROR_STOP=1
fi

echo "Seeded plan for ${USER_ID} (reset=${RESET})."
