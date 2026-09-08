#!/usr/bin/env bash
set -euo pipefail
#
# run-local.sh — run the Playwright suite against a brain, with the owner UI
# from THIS checkout in front of it.
#
# WHAT CHANGED, AND WHY IT HAD TO. This script used to boot a whole hermetic
# stack: throwaway Postgres and MinIO in Docker, `@mantle/db` migrations,
# pg-boss, and the server app on :3900. None of that lives here any more. The
# repo split moved the server, the database package and infra/ to the mantle
# repo, so the old script referenced four paths that do not exist and could not
# run at all — which is why 117 tests sat unrunnable rather than merely
# failing.
#
# jackdaw is the CLIENT. It cannot boot a brain, so it POINTS AT one: you bring
# the brain, this brings the owner UI and the browser.
#
# Usage:
#   E2E_SERVER_URL=https://brain.example e2e/scripts/run-local.sh
#   E2E_SERVER_URL=… e2e/scripts/run-local.sh up     # client only, for iterating
#   E2E_SERVER_URL=… e2e/scripts/run-local.sh test   # suite against an `up`'d client
#                    e2e/scripts/run-local.sh down   # stop the client
#
# Credentials default to the e2e owner (see e2e/lib/env.ts); override with
# E2E_EMAIL / E2E_PASSWORD. On a brain with no owner yet, the suite's
# global-setup creates one through the real signup + onboarding path.
#
# ⚠ The suite CREATES AND DELETES CONTENT on whatever brain you point it at.
# Point it at a throwaway one, never at a brain anyone relies on.

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$root"

artifacts="$root/e2e/.artifacts"
client_port="${E2E_CLIENT_PORT:-3901}"
client_pid_file="$artifacts/client.pid"
client_log="$artifacts/client.log"
client_url="http://localhost:$client_port"

require_brain() {
  if [ -z "${E2E_SERVER_URL:-}" ]; then
    cat >&2 <<'EOF'
✗ E2E_SERVER_URL is not set.

  This repo is the client: it has no server workspace and no database, so it
  cannot start a brain for you. Point it at one that is already running:

      E2E_SERVER_URL=https://brain.example e2e/scripts/run-local.sh

  The suite creates and deletes content, so use a throwaway brain.
EOF
    return 1
  fi
  # Strip any trailing slash so the URL matches what lib/env.ts normalises to.
  E2E_SERVER_URL="${E2E_SERVER_URL%/}"
}

up() {
  require_brain
  mkdir -p "$artifacts"

  # Reach the brain BEFORE starting anything. Without this the only symptom of
  # a wrong or unreachable URL is global-setup failing several minutes later,
  # with the client already up and its log to wade through.
  echo "→ checking the brain at $E2E_SERVER_URL"
  if ! curl -sf --max-time 15 "$E2E_SERVER_URL/api/version" >/dev/null; then
    echo "✗ no answer from $E2E_SERVER_URL/api/version — is the brain up, and the URL right?" >&2
    return 1
  fi

  echo "→ owner UI on :$client_port against that brain (log: $client_log)"
  # Next 16 permits only ONE dev server per project DIRECTORY — not per port.
  # A `pnpm dev` stack holding client/web therefore makes this one exit at once,
  # and the only symptom is the useless 120s "did not become ready" below, with
  # the real reason ("Another next dev server is already running") buried in the
  # client log. Fail fast and name the process instead.
  #
  # Matched by CWD, not by process name, so a `next dev` for an unrelated
  # project doesn't trip it. Needs /proc; where that's absent we skip the check
  # rather than guess (fail open — worst case is the old 120s timeout).
  if [ -d /proc ]; then
    for pid in $(pgrep -f 'next dev' 2>/dev/null); do
      cwd="$(readlink -f "/proc/$pid/cwd" 2>/dev/null || true)"
      if [ "$cwd" = "$root/client/web" ]; then
        echo "✗ a 'next dev' server (PID $pid) is already running in client/web." >&2
        echo "  Next allows only one per project dir, so the e2e client cannot start." >&2
        echo "  Stop your dev stack first (e.g. kill -TERM -\$(ps -o pgid= -p $pid | tr -d ' '))." >&2
        return 1
      fi
    done
  fi

  # A stale client from an interrupted run holds the port and answers with the
  # WRONG brain — sweep it before starting.
  fuser -k "$client_port/tcp" 2>/dev/null && sleep 1 || true

  # Explicit env so a stray client/web/.env.local (which `next dev` always
  # loads, and which may point at a different brain) cannot decide which brain
  # the run tests. Explicit process env beats .env.local in Next.
  #
  # setsid gives the pnpm→next chain its own process GROUP so teardown can kill
  # the whole tree; killing just the pnpm wrapper leaves next alive, which is
  # the stale-port failure mode above.
  ( setsid env \
      PORT="$client_port" \
      MANTLE_SERVER_ORIGIN="$E2E_SERVER_URL" \
      NODE_ENV=development \
      pnpm -C client/web dev >"$client_log" 2>&1 & echo $! >"$client_pid_file" )

  for i in $(seq 1 120); do
    # /env.js, not /: it is the route that proves the runtime config the split
    # topology depends on is actually being served, and it needs no session.
    if curl -sf "$client_url/env.js" >/dev/null 2>&1; then
      echo "→ owner UI ready at $client_url"
      return 0
    fi
    sleep 1
  done
  echo "✗ the owner UI did not become ready in 120s — tail of $client_log:" >&2
  tail -30 "$client_log" >&2
  return 1
}

run_tests() {
  require_brain
  # SPLIT ONLY, and that is not a limitation being papered over: the owner UI
  # here runs on its own origin in front of a brain on another, which IS the
  # split topology. The `same-origin` project means one origin serving both,
  # which this repo cannot produce locally — run `pnpm -C e2e e2e:same`
  # against a box deployed that way if you need it.
  E2E_SERVER_URL="$E2E_SERVER_URL" \
  E2E_CLIENT_URL="${E2E_CLIENT_URL:-$client_url}" \
    pnpm -C e2e e2e:split
}

down() {
  if [ -f "$client_pid_file" ]; then
    # Negative pid = the whole process group (see setsid in up()).
    kill -- "-$(cat "$client_pid_file")" 2>/dev/null || kill "$(cat "$client_pid_file")" 2>/dev/null || true
    rm -f "$client_pid_file"
  fi
  fuser -k "$client_port/tcp" 2>/dev/null || true
}

case "${1:-run}" in
  up) up ;;
  test) run_tests ;;
  down) down ;;
  run)
    trap down EXIT
    up
    run_tests
    ;;
  *)
    echo "usage: $0 [run|up|test|down]" >&2
    exit 1
    ;;
esac
