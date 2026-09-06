#!/usr/bin/env bash
#
# check-build-secrets.sh — fail the build if a credential can reach a shipped image.
#
# Why this exists. On 2026-09-06 all 9 fleet repos were found shipping a live
# GitHub Packages token (and 7 a Sentry token) inside their published ECR
# images. Two mechanisms, both of which this script bans:
#
#   ENV FOO_TOKEN=${FOO_TOKEN}   -- an ENV persists into the FINAL image config,
#                                   so it is in `docker inspect` on the pushed
#                                   image and in the running container's env.
#   ARG FOO_TOKEN                -- an ARG value is recorded in `docker history`
#                                   for the build.
#   --build-arg FOO_TOKEN=$X     -- the workflow side of the same leak.
#
# The supported way to pass a credential to a build is a BuildKit secret mount:
#   Dockerfile:  RUN --mount=type=secret,id=npm_token,required=true \
#                    NODE_AUTH_TOKEN="$(cat /run/secrets/npm_token)" npm ci
#   workflow:    docker build --secret id=npm_token,env=NODE_AUTH_TOKEN ...
# The value is then never in argv, never in `docker history`, and never in the
# image config.
#
# Escape hatch: put `build-secrets-guard: allow <reason>` in a comment on the
# offending line or the line directly above it. Deliberate, greppable, and it
# forces a written reason.

set -uo pipefail
cd "$(git rev-parse --show-toplevel)" || exit 2

# A name-shaped token containing any of these words is treated as a credential.
# NEXT_PUBLIC_* is deliberately NOT exempt: a secret inlined into the client
# bundle is worse, not better. DSN is deliberately absent -- a Sentry DSN is
# public by design and all 9 web images legitimately carry one.
SECRET_RE='[A-Z0-9_]*(TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|PRIVATE_KEY|API_KEY|APIKEY|ACCESS_KEY)[A-Z0-9_]*'

fail=0
allowed=0

# Is this hit exempted by an allow-comment on its own line or the one above?
is_allowed() {
  local file="$1" line="$2"
  sed -n "$((line > 1 ? line - 1 : 1)),${line}p" "$file" \
    | grep -q 'build-secrets-guard: allow'
}

report() {  # file line kind text
  if is_allowed "$1" "$2"; then
    printf '  ALLOWED  %s:%s  %s\n' "$1" "$2" "$4"
    allowed=$((allowed + 1))
  else
    printf '  ✖ %s  %s:%s\n      %s\n' "$3" "$1" "$2" "$4"
    fail=$((fail + 1))
  fi
}

# ── 1. Dockerfiles: ENV/ARG naming a credential ──────────────────────────────
while IFS= read -r f; do
  [ -f "$f" ] || continue
  while IFS=: read -r ln text; do
    [ -n "${ln:-}" ] || continue
    report "$f" "$ln" "ENV/ARG bakes a credential into the image" "$(echo "$text" | sed 's/^[[:space:]]*//')"
  done < <(grep -nE "^[[:space:]]*(ENV|ARG)[[:space:]]+.*\b${SECRET_RE}\b" "$f")
done < <(git ls-files | grep -E '(^|/)Dockerfile[^/]*$')

# ── 2. Workflows: --build-arg passing a credential ───────────────────────────
while IFS= read -r f; do
  [ -f "$f" ] || continue
  while IFS=: read -r ln text; do
    [ -n "${ln:-}" ] || continue
    report "$f" "$ln" "--build-arg passes a credential" "$(echo "$text" | sed 's/^[[:space:]]*//')"
  # A commented-out line (YAML comment or shell comment inside a `run:` block)
  # never executes, so it cannot leak -- and this guard's own job block
  # documents the banned form in a comment. Skip lines whose first
  # non-whitespace character is `#`.
  done < <(grep -nE -- "--build-arg[[:space:]]+${SECRET_RE}=" "$f" | grep -vE '^[0-9]+:[[:space:]]*#')
done < <(git ls-files '.github/workflows' | grep -E '\.ya?ml$')

echo
if [ "$fail" -gt 0 ]; then
  echo "build-secrets guard: FAIL — $fail finding(s), $allowed allowed."
  echo "Use a BuildKit secret mount instead; see the header of $0."
  exit 1
fi
echo "build-secrets guard: PASS ($allowed allowed by comment)."
