// scripts/migrateFailure.js — the migration runner's failure reporter (productport#13).
//
// db-migrate.js used to end with `console.error('[db-migrate] failed:', e)`.
// Node's inspector prints an Error's message, its stack, AND its own enumerable
// properties (cause, stdout, meta, ...). A driver- or CLI-level connection
// failure can carry the full connection string in any of those, and these
// lines ship to CloudWatch. This module logs a redacted, still-diagnosable
// summary instead.
//
// Dependency-free on purpose: it runs at migrate time, before the app's own
// deps (pino, the logger) are guaranteed loadable. feedback_db_migrate_pattern.
'use strict';

const CENSOR = '[REDACTED]';

// Error codes that mean "could not reach / authenticate to the database".
// P1000-P1002 + P1017 are Prisma's; the rest come from Node / pg.
const CONNECTION_CODES = new Set([
  'P1000', 'P1001', 'P1002', 'P1017',
  'ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'ETIMEDOUT', 'EAI_AGAIN', 'EHOSTUNREACH',
  '28P01', '28000', '3D000',
]);

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Credential values from the configured URLs. Matching these literally catches
// a password echoed outside URL form (e.g. inside a quoted auth error).
function configuredSecrets(env) {
  const out = [];
  for (const key of ['MIGRATE_DATABASE_URL', 'DATABASE_URL']) {
    const raw = env && env[key];
    if (!raw) continue;
    try {
      const u = new URL(raw);
      if (u.password) out.push(u.password, decodeURIComponent(u.password));
    } catch { /* not a parseable URL — the regex pass below still applies */ }
    out.push(raw);
  }
  // Longest first so a full URL is replaced before its password substring.
  return [...new Set(out)].filter((s) => s.length >= 4).sort((a, b) => b.length - a.length);
}

function redactCredentials(value, env = process.env) {
  let s = String(value);
  for (const secret of configuredSecrets(env)) {
    s = s.replace(new RegExp(escapeRe(secret), 'g'), CENSOR);
  }
  return s
    // scheme://userinfo@host — userinfo runs to the LAST '@' before whitespace,
    // so a password containing '/', ':' or '@' is still fully covered. This
    // over-redacts a credential-less URL with an '@' in its path; that's fine.
    .replace(/\b([a-z][a-z0-9+.-]*:\/\/)[^\s'"`]*@/gi, `$1${CENSOR}@`)
    // libpq key=value form: password=... / pwd=...
    .replace(/\b(password|passwd|pwd)\s*=\s*('[^']*'|"[^"]*"|[^\s;&]+)/gi, `$1=${CENSOR}`);
}

function describe(err, env, depth = 0) {
  if (err === null || err === undefined) return String(err);
  if (typeof err !== 'object') return redactCredentials(err, env);

  const parts = [];
  const name = err.name || err.constructor?.name || 'Error';
  parts.push(`${name}${err.code ? ` code=${err.code}` : ''}`);
  if (err.message) parts.push(redactCredentials(err.message, env));
  for (const stream of ['stdout', 'stderr']) {
    if (err[stream] && String(err[stream]).trim()) {
      parts.push(`${stream}: ${redactCredentials(String(err[stream]).trim(), env)}`);
    }
  }
  if (err.stack) {
    // The stack's first line repeats the message; keep only the frames.
    const frames = String(err.stack).split('\n').filter((l) => /^\s+at /.test(l)).join('\n');
    if (frames) parts.push(redactCredentials(frames, env));
  }
  if (err.cause && depth < 3) parts.push(`caused by: ${describe(err.cause, env, depth + 1)}`);
  return parts.join('\n');
}

function isConnectionFailure(err, depth = 0) {
  if (!err || typeof err !== 'object' || depth > 3) return false;
  if (err.code && CONNECTION_CODES.has(String(err.code))) return true;
  return isConnectionFailure(err.cause, depth + 1);
}

// Logs ONLY strings built by describe() — never the raw error object, which is
// what the inspector would expand into credentials.
function reportMigrateFailure(err, { log = console.error, env = process.env } = {}) {
  const kind = isConnectionFailure(err) ? ' (database connection failure)' : '';
  log(`[db-migrate] failed${kind}:\n${describe(err, env)}`);
}

module.exports = { reportMigrateFailure, redactCredentials, isConnectionFailure, CENSOR };
