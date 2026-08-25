#!/usr/bin/env bash
set -euo pipefail
#
# new-worktree.sh — spin up a fully set-up, ISOLATED git worktree for a parallel
# session (a second Claude session, or a session running alongside your editor).
# Ported from the mantle repo's script of the same name; same contract.
#
# Why: two sessions sharing the original checkout step on each other — one
# switches the branch out from under the other, uncommitted edits intermingle,
# and a shared node_modules/lockfile breaks imports. A worktree gives each
# session its own working dir + branch + index + node_modules.
#
# Usage:
#   scripts/new-worktree.sh <name> [base-branch]
#     name         short slug. "share-toggle" → branch feat/share-toggle,
#                  dir .claude/worktrees/share-toggle. Pass a "kind/slug" (e.g.
#                  "fix/login") to set the branch prefix yourself.
#     base-branch  what to fork from (default: main).
#
# Then:  cd .claude/worktrees/<slug>  and work there.
#
name="${1:-}"
base="${2:-main}"
if [ -z "$name" ]; then
  echo "usage: scripts/new-worktree.sh <name> [base-branch]" >&2
  exit 1
fi

# The original clone (NOT the current worktree) — worktrees live under its
# .claude/worktrees/. Derive it from the shared git dir so this works whether
# run from the main checkout or from inside another worktree.
common="$(git rev-parse --git-common-dir)"
case "$common" in /*) ;; *) common="$(pwd)/$common" ;; esac
repo="$(cd "$(dirname "$common")" && pwd)"
cd "$repo"

# Branch: take a given "kind/slug" as-is, else default to feat/<name>.
case "$name" in
  */*) branch="$name" ;;
  *)   branch="feat/$name" ;;
esac
slug="${name##*/}"
dir=".claude/worktrees/$slug"

if [ -e "$dir" ]; then
  echo "✗ $dir already exists — pick another name or remove it first" >&2
  exit 1
fi
if git show-ref --verify --quiet "refs/heads/$branch"; then
  echo "✗ branch $branch already exists" >&2
  exit 1
fi

echo "→ git worktree add $dir -b $branch $base"
git worktree add "$dir" -b "$branch" "$base"

# Copy gitignored local env so detached frontend dev works in the worktree.
copied=0
for env in client/web/.env.detached.local client/web/.env.local .env.local; do
  [ -f "$env" ] || continue
  mkdir -p "$dir/$(dirname "$env")"
  cp "$env" "$dir/$env"
  echo "→ copied $env"
  copied=1
done
[ "$copied" = 1 ] || echo "  (no local env to copy — see docs/db-less-dev.md to set one up)"

echo "→ pnpm install (hardlinks from the shared store — usually seconds)"
( cd "$dir" && pnpm install >/dev/null )

cat <<EOF

✓ worktree ready
    cd $dir            # branch $branch, forked from $base
    pnpm dev:fe                      # detached frontend against MANTLE_REMOTE
    scripts/rm-worktree.sh $slug     # tear it down when done
EOF
