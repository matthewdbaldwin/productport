// scripts/check-build-secrets.sh — regression cover for the guard itself.
//
// Why this file exists. The guard is a hard-blocking CI job protecting against
// the incident class that put a live GitHub Packages token into all 9 fleet
// images on 2026-09-06. It ran in CI from the day it landed — but only ever as
// a scan of an already-clean tree, which proves the tree is clean and says
// nothing about whether the guard still WORKS. That distinction stopped being
// academic within hours: 9f01fcc9 fixed SIX real detection bypasses in it, all
// found by a human re-reading the diff. Nothing would have caught a seventh.
//
// Each case below pins one of those six, plus the true-negative and the escape
// hatch. They run the REAL script against throwaway git repos rather than
// asserting on its source, because every one of the six bypasses was invisible
// in review and obvious on execution.
//
// (`git add -A` below is safe: these are disposable fixture repos under
// os.tmpdir(), never a satellite checkout.)

const { execFileSync, spawnSync } = require('child_process');
const fs   = require('fs');
const os   = require('os');
const path = require('path');

const GUARD = path.resolve(__dirname, '../scripts/check-build-secrets.sh');

/** Build a throwaway git repo from {relPath: contents} and run the real guard in it. */
function runGuard(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'build-secrets-guard-'));
  const git = (...a) => execFileSync('git', a, { cwd: dir, stdio: 'pipe' });
  git('init', '-q');
  git('config', 'user.email', 'fixture@example.invalid');
  git('config', 'user.name', 'fixture');
  for (const [rel, body] of Object.entries(files)) {
    const p = path.join(dir, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, body);
  }
  git('add', '-A');
  // The guard resolves its target with `git rev-parse --show-toplevel` from cwd,
  // so running the real file with cwd=fixture scans the fixture — and the guard
  // is not itself in the fixture's index, so it never scans itself.
  const r = spawnSync('bash', [GUARD], { cwd: dir, encoding: 'utf8' });
  fs.rmSync(dir, { recursive: true, force: true });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

const SECRET_MOUNT = `FROM node:22-alpine
COPY package*.json .npmrc ./
RUN --mount=type=secret,id=npm_token,required=true \\
    NODE_AUTH_TOKEN="$(cat /run/secrets/npm_token)" npm ci
`;

describe('check-build-secrets.sh — true negatives', () => {
  test('the supported BuildKit secret-mount pattern passes', () => {
    const r = runGuard({ Dockerfile: SECRET_MOUNT });
    expect(r.code).toBe(0);
    expect(r.out).toContain('PASS');
  });

  test('a public Sentry DSN is not a credential — all 9 web images carry one', () => {
    const r = runGuard({
      Dockerfile: `${SECRET_MOUNT}ARG NEXT_PUBLIC_SENTRY_DSN\nENV NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN\n`,
    });
    expect(r.code).toBe(0);
  });
});

describe('check-build-secrets.sh — the leak it was written to stop', () => {
  test('ENV baking a token into the final image config fails', () => {
    const r = runGuard({ Dockerfile: `FROM node:22-alpine\nENV NPM_TOKEN=abc123\n` });
    expect(r.code).toBe(1);
    expect(r.out).toContain('ENV/ARG bakes a credential');
  });

  test('ARG recording a token in docker history fails', () => {
    const r = runGuard({ Dockerfile: `FROM node:22-alpine\nARG SENTRY_AUTH_TOKEN\n` });
    expect(r.code).toBe(1);
  });
});

// ── the six bypasses closed by 9f01fcc9, one test each ──────────────────────
describe('check-build-secrets.sh — closed bypasses stay closed', () => {
  test('1. matching is case-insensitive: `ENV npm_token=` leaks as hard as NPM_TOKEN', () => {
    const r = runGuard({ Dockerfile: `FROM node:22-alpine\nENV npm_token=abc123\n` });
    expect(r.code).toBe(1);
  });

  test('2. a directive split over backslash continuations is scanned as one line', () => {
    // Docker sees one ARG; a naive line-at-a-time scan sees neither half.
    const r = runGuard({ Dockerfile: `FROM node:22-alpine\nARG \\\n    GITHUB_TOKEN\n` });
    expect(r.code).toBe(1);
  });

  test('3. the no-`=` --build-arg form inherits from the environment and still fails', () => {
    const r = runGuard({
      Dockerfile: SECRET_MOUNT,
      '.github/workflows/deploy.yml':
        `jobs:\n  b:\n    steps:\n      - run: docker build --build-arg NPM_TOKEN .\n`,
    });
    expect(r.code).toBe(1);
    expect(r.out).toContain('--build-arg passes a credential');
  });

  // Bypass 7, found 2026-09-07 by re-reading the regex rather than the diff.
  // Docker's CLI takes `--build-arg=NAME=value` as readily as the space form,
  // but the pattern demanded whitespace after the flag, so the =-joined spelling
  // walked past the guard with a green check on all 9 repos. Never exploited.
  test('3b. the `=`-joined flag spelling --build-arg=NAME=value also fails', () => {
    const r = runGuard({
      Dockerfile: SECRET_MOUNT,
      '.github/workflows/deploy.yml':
        `jobs:\n  b:\n    steps:\n      - run: docker build --build-arg=NPM_TOKEN=abc123 -t x .\n`,
    });
    expect(r.code).toBe(1);
    expect(r.out).toContain('--build-arg passes a credential');
  });

  // Bypass 8, found 2026-09-08 by the pre-ship security gate constructing the
  // evasion cases instead of re-reading the regex. `--build-arg[[:space:]=]+`
  // required the secret NAME to sit immediately against the delimiter, so any
  // quote character in between broke the match and the guard exited 0 "PASS".
  // Quoting a --build-arg value is ordinary Docker usage -- and it is the exact
  // spelling this fleet's own images get built with by hand
  // (`--build-arg "NODE_AUTH_TOKEN=$(gh auth token)"`), so the guard was blind
  // to the form most likely to actually be typed. Never exploited: no deploy*.yml
  // in the fleet quotes --build-arg.
  test.each([
    ['double-quoted, =-joined flag', 'docker build --build-arg="NPM_TOKEN=abc123" .'],
    ['double-quoted, space-separated', 'docker build --build-arg "NPM_TOKEN=abc123" .'],
    ["single-quoted", "docker build --build-arg='NPM_TOKEN=abc123' ."],
    ['quoted, inheriting from the environment', 'docker build --build-arg "NPM_TOKEN" .'],
  ])('3c. a quoted --build-arg value still fails (%s)', (_label, cmd) => {
    const r = runGuard({
      Dockerfile: SECRET_MOUNT,
      '.github/workflows/deploy.yml':
        `jobs:\n  b:\n    steps:\n      - run: ${cmd}\n`,
    });
    expect(r.code).toBe(1);
    expect(r.out).toContain('--build-arg passes a credential');
  });

  test('4. a *.dockerfile filename variant is scanned, not just "Dockerfile"', () => {
    const r = runGuard({ 'web.dockerfile': `FROM node:22-alpine\nENV API_KEY=abc\n` });
    expect(r.code).toBe(1);
  });

  test('5. shell scripts are scanned, not only workflows', () => {
    const r = runGuard({
      Dockerfile: SECRET_MOUNT,
      'scripts/deploy.sh': `#!/bin/sh\ndocker build --build-arg NPM_TOKEN=$NPM_TOKEN .\n`,
    });
    expect(r.code).toBe(1);
  });

  test('6. scanning zero Dockerfiles is an ERROR, not a pass — no silent fail-open', () => {
    const r = runGuard({ 'README.md': 'no dockerfile here\n' });
    expect(r.code).toBe(2);
    expect(r.out).toContain('no Dockerfile was scanned');
  });
});

describe('check-build-secrets.sh — escape hatch', () => {
  test('an allow comment suppresses only its own line, not the whole file', () => {
    const r = runGuard({
      Dockerfile:
        `FROM node:22-alpine\n` +
        `# build-secrets-guard: allow documented false positive\n` +
        `ARG BUILD_TOKEN_NAME\n` +
        `ENV NPM_TOKEN=abc123\n`,   // second finding, deliberately unguarded
    });
    expect(r.code).toBe(1);          // the hatch must not become a kill switch
    expect(r.out).toContain('ALLOWED');
  });

  test('NEXT_PUBLIC_ is NOT exempt — a credential in the client bundle is worse', () => {
    const r = runGuard({ Dockerfile: `FROM node:22-alpine\nENV NEXT_PUBLIC_API_KEY=abc\n` });
    expect(r.code).toBe(1);
  });
});
