// productport#13 — the migration runner's catch-all used to be
// `console.error('[db-migrate] failed:', e)`. Node prints an Error's message AND
// stack AND any own properties (cause, stdout, meta, ...), and a driver-level
// connection failure can carry the connection string in any of them. Those
// lines ship to CloudWatch. These tests prove a `postgresql://user:pass@host`
// string never reaches the log, while the failure stays loud and diagnosable.
'use strict';

const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { reportMigrateFailure, redactCredentials } = require('../scripts/migrateFailure');

const SECRET = 'hunter2-s3cr3t';
const URL_WITH_CREDS = `postgresql://pp_admin:${SECRET}@prod-db.cluster.eu-central-1.rds.amazonaws.com:5432/productport`;

function capture(err, env = {}) {
  const lines = [];
  reportMigrateFailure(err, { log: (...a) => lines.push(a.join(' ')), env });
  return lines.join('\n');
}

describe('redactCredentials', () => {
  test('strips user:password from a postgres URL, keeps host for diagnosis', () => {
    const out = redactCredentials(`connect failed for ${URL_WITH_CREDS}`);
    expect(out).not.toContain(SECRET);
    expect(out).not.toContain('pp_admin');
    expect(out).toContain('prod-db.cluster.eu-central-1.rds.amazonaws.com');
  });

  test('strips a password even when it contains a slash or colon', () => {
    const out = redactCredentials('postgres://u:pa/ss:wd@host:5432/db');
    expect(out).not.toContain('pa/ss');
    expect(out).not.toContain('wd@');
  });

  test('strips libpq key=value password forms', () => {
    const out = redactCredentials(`host=db user=pp password=${SECRET} dbname=x`);
    expect(out).not.toContain(SECRET);
  });

  test('strips the literal password from the configured env URL wherever it appears', () => {
    const out = redactCredentials(`auth failed (${SECRET})`, { DATABASE_URL: URL_WITH_CREDS });
    expect(out).not.toContain(SECRET);
  });
});

describe('reportMigrateFailure', () => {
  test('message, stack, cause and stdout carrying the URL never reach the log', () => {
    const cause = new Error(`getaddrinfo ENOTFOUND for ${URL_WITH_CREDS}`);
    cause.code = 'ENOTFOUND';
    const err = new Error(`Can't reach database server at ${URL_WITH_CREDS}`, { cause });
    err.code = 'P1001';
    err.stdout = Buffer.from(`Datasource "db": ${URL_WITH_CREDS}`);
    err.meta = { url: URL_WITH_CREDS };

    const logged = capture(err);

    expect(logged).not.toContain(SECRET);
    expect(logged).not.toContain('pp_admin');
    // still diagnosable: name, code, and the fact it was a connection failure
    expect(logged).toContain('Error');
    expect(logged).toContain('P1001');
    expect(logged).toContain('ENOTFOUND');
    expect(logged).toMatch(/connection failure/i);
  });

  test('a non-Error throwable is redacted too', () => {
    expect(capture(`boom ${URL_WITH_CREDS}`)).not.toContain(SECRET);
  });
});

describe('scripts/db-migrate.js end to end', () => {
  // Runs the REAL runner in a child process with execSync patched (via a
  // --require preload) to throw an error whose message and stack carry the
  // connection string, then inspects everything the process wrote.
  test('a failing migrate exits non-zero and never prints the credentials', () => {
    const localUrl = `postgresql://pp_admin:${SECRET}@localhost:5432/productport`;
    const res = spawnSync(process.execPath,
      ['--require', path.join(__dirname, 'fixtures', 'throwingExecSync.js'), 'scripts/db-migrate.js'],
      {
        cwd: path.join(__dirname, '..'),
        env: { ...process.env, MIGRATE_DATABASE_URL: localUrl, DATABASE_URL: localUrl, THROW_WITH: localUrl },
        encoding: 'utf8',
        timeout: 30_000,
      });
    const output = `${res.stdout}\n${res.stderr}`;
    expect(res.status).toBe(1);
    expect(output).toContain('[db-migrate] failed');
    expect(output).not.toContain(SECRET);
  });
});
