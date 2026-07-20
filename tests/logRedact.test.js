'use strict';
// Credential-redaction guard for the pino logger. pino-http logs req/res headers,
// so a regression here (dropping the redact block) would leak live tokens into
// CloudWatch. Builds a pino logger with the shared redact config against a memory
// stream and asserts the sensitive values never reach the output.

const pino   = require('pino');
const redact = require('../src/lib/logRedact');

function capture(fn) {
  const chunks = [];
  const stream = { write: (s) => chunks.push(s) };
  const log = pino({ redact, level: 'info' }, stream);
  fn(log);
  return chunks.join('');
}

describe('log redaction', () => {
  it('redacts authorization / cookie / set-cookie headers and token/secret/key fields', () => {
    const out = capture((log) => log.info({
      req: { headers: { authorization: 'Bearer live-access-token', cookie: 'productport_session=live-session' } },
      res: { headers: { 'set-cookie': 'productport_session=fresh-session; HttpOnly' } },
      data: { token: 'raw-token', secret: 'raw-secret', key: 'raw-key' },
    }, 'request completed'));

    // sensitive values must NOT appear anywhere in the output
    expect(out).not.toContain('live-access-token');
    expect(out).not.toContain('live-session');
    expect(out).not.toContain('fresh-session');
    expect(out).not.toContain('raw-token');
    expect(out).not.toContain('raw-secret');
    expect(out).not.toContain('raw-key');
    // and the censor marker is present
    expect(out).toContain('[REDACTED]');
  });

  it('leaves non-sensitive fields intact', () => {
    const out = capture((log) => log.info({ req: { method: 'GET', url: '/api/products' } }, 'ok'));
    expect(out).toContain('/api/products');
    expect(out).toContain('GET');
  });
});
