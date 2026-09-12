#!/usr/bin/env bash
#
# check-lockfile.sh [dir ...]: fail fast if a package-lock.json would make
# CI's `npm ci` die with EUSAGE.
#
# Why this exists. CI (and the node:22-alpine Docker builds) run npm 10. The
# devbox runs Node 24 / npm 11. npm 11 writes lockfiles that npm 10 rejects:
# it collapses a nested pin (next-intl's @swc/helpers@0.5.23) that npm 10 still
# requires, and a clean `npm ci` under npm 11 happily accepts its own output.
# Result: `EUSAGE: Missing: @swc/helpers@0.5.23 from lock file`, main CI red
# (productport 2026-08-23 and 2026-09-11; ~10 times fleet-wide).
# See memory feedback_npm_version_lockfile_drift_ci.
#
# Two layers:
#   1. Prevention: package.json `engines.npm: ^10` plus `engine-strict=true` in
#      .npmrc make npm 11 REFUSE `npm install` / `npm ci` in this repo, so it
#      can't write a bad lockfile in the first place. `npm run`, `npx`,
#      `npm version` and `npm ls` are unaffected.
#   2. Detection (this script): runs `npm ci --dry-run` under npm 10. That
#      runs the same lockfile-vs-manifest validation as `npm ci` without
#      installing anything. It catches drift that bypasses layer 1, such as a
#      hand-patched lockfile, `--engine-strict=false`, or a lockfile generated
#      elsewhere.
#
# NOTE: `npm install --package-lock-only --dry-run` does NOT catch this drift:
# it re-resolves and exits 0 on the exact broken lockfile (verified against
# productport b5b55c6). Don't swap it back in.
#
# Usage (from anywhere; dirs are relative to the repo root, default: . web):
#   scripts/check-lockfile.sh            # locally, before pushing a lockfile change
#   scripts/check-lockfile.sh web        # CI web job
# Needs NODE_AUTH_TOKEN for the private @matthewdbaldwin registry.

set -uo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
[ "$#" -gt 0 ] || set -- . web

if [ "$(npm -v 2>/dev/null | cut -d. -f1)" = "10" ]; then
  npm_cmd=(npm)
else
  npm_cmd=(npx --yes npm@10)
fi

annotate() { # GitHub annotation in Actions, plain text elsewhere
  if [ -n "${GITHUB_ACTIONS:-}" ]; then echo "::error file=$1::$2"; else echo "ERROR ($1): $2" >&2; fi
}

status=0
for dir in "$@"; do
  lock="$dir/package-lock.json"
  if [ ! -f "$repo_root/$lock" ]; then
    annotate "$lock" "no lockfile at $lock"
    status=1
    continue
  fi
  echo "check-lockfile: $lock under npm $("${npm_cmd[@]}" -v)"
  if out="$(cd "$repo_root/$dir" && "${npm_cmd[@]}" ci --dry-run --ignore-scripts --no-audit --no-fund 2>&1)"; then
    echo "  ok"
  else
    echo "$out" | grep -E 'npm error (code|Missing|Invalid|notsup|E[A-Z]+)' | head -20
    annotate "$lock" "package-lock.json is out of sync for npm 10 (CI's npm), so npm ci will fail. Usually it was regenerated under npm 11. Fix: cd $dir && npx -y npm@10 install --package-lock-only, then re-run scripts/check-lockfile.sh $dir."
    status=1
  fi
done
exit "$status"
