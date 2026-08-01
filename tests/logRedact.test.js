'use strict';
// Credential-redaction guard for the pino logger.
//
// History this test exists to prevent repeating:
//  1. The redact list had `'*.key'` and the live 64-char FORUM_AUTOMATION_KEY
//     still reached CloudWatch in cleartext — pino's `*` is a SINGLE-LEVEL glob,
//     so it never matched `x-forum-automation-key`.
//  2. The previous version of THIS FILE hid that. It asserted `data.key` was
//     redacted — a property literally named `key`, the one shape `*.key` does
//     handle — so the suite proved the wildcard worked in the only case that did
//     not matter. A check that could not fail.
//  3. The first fix enumerated credential headers explicitly and STILL missed
//     `x-signature-256`. Hence the allowlist: the headline test below is that an
//     unknown header is redacted by default.
//  4. pino-http OVERRIDES the base logger's serializers, so wiring the allowlist
//     into pino() instead of pinoHttp() would be silently inert. That is
//     asserted end-to-end through a real HTTP request, not by unit-calling the
//     serializer.
const express = require('express');
const pino = require('pino');
const pinoHttp = require('pino-http');
const { Writable } = require('stream');
const fs = require('fs');
const path = require('path');
const logRedact = require('../src/lib/logRedact');

const SENTINEL = 'a'.repeat(64); // stands in for a live 64-char credential

function sink() {
  const chunks = [];
  const stream = new Writable({ write(c, _e, cb) { chunks.push(c.toString()); cb(); } });
  stream.text = () => chunks.join('');
  return stream;
}

// Drives the REAL wiring: base logger + pinoHttp with the exported serializers,
// exercised by a real request. If the serializers stop taking effect, this fails.
async function roundtrip(headers) {
  const out = sink();
  const logger = pino({ redact: logRedact.redact }, out);
  const app = express();
  app.use(pinoHttp({ logger, serializers: logRedact.serializers }));
  app.get('/probe', (_q, res) => res.set('set-cookie', `s=${SENTINEL}`).json({ ok: true }));

  const srv = app.listen(0);
  await new Promise((r) => srv.once('listening', r));
  await fetch(`http://127.0.0.1:${srv.address().port}/probe`, { headers });
  await new Promise((r) => setTimeout(r, 50));
  srv.close();
  return out.text();
}

describe('log redaction — allowlist behaviour', () => {
  // THE headline property. A denylist cannot pass this test; that is the point.
  it('redacts a header nobody has ever classified (fail-closed)', async () => {
    const text = await roundtrip({ 'x-some-header-invented-tomorrow': SENTINEL });
    expect(text).not.toContain(SENTINEL);
    expect(text).toContain('[REDACTED]');
  });

  // Every credential-bearing header found in the 2026-08-01 fleet sweep. These
  // are covered by the allowlist automatically; listing them means a failure
  // names the specific header rather than just "something leaked".
  const CREDENTIAL_HEADERS = [
    'x-forum-automation-key',
    'x-satellite-token',
    'x-satellite-refresh',
    'x-hubport-signature',
    'x-salesport-signature',
    'x-opsport-signature',
    'x-reviewport-signature',
    'x-bugreport-signature',
    'x-twilio-email-event-webhook-signature',
    'x-signature-256',
    'authorization',
    'cookie',
  ];

  it.each(CREDENTIAL_HEADERS)('redacts %s', async (header) => {
    const text = await roundtrip({ [header]: SENTINEL });
    expect(text).not.toContain(SENTINEL);
  });

  // Over-redaction is a real regression: losing these blinds log-sweep and makes
  // cross-app requests untraceable.
  it('preserves the headers needed for tracing and debugging', async () => {
    const keep = {
      'x-correlation-id': 'corr-123',
      'x-satellite-id': 'salesport',
      'x-lifecycle-event-id': 'evt-456',
      'user-agent': 'probe-agent',
    };
    const text = await roundtrip(keep);
    for (const v of Object.values(keep)) expect(text).toContain(v);
  });

  it('still logs method and url', async () => {
    const text = await roundtrip({});
    expect(text).toContain('"method":"GET"');
    expect(text).toContain('/probe');
  });

  it('redacts set-cookie on the response', async () => {
    const text = await roundtrip({});
    expect(text).not.toContain(SENTINEL);
  });
});

describe('log redaction — base redact (non-header payloads)', () => {
  it('redacts password and bare token/secret/key fields on logged objects', () => {
    const out = sink();
    const log = pino({ redact: logRedact.redact }, out);
    log.info({ password: 'pw-raw', data: { token: 'tok-raw', secret: 'sec-raw', key: 'key-raw' } }, 'x');
    const text = out.text();
    for (const v of ['pw-raw', 'tok-raw', 'sec-raw', 'key-raw']) expect(text).not.toContain(v);
  });
});

describe('log redaction — wiring', () => {
  // pino-http overrides base-logger serializers, so the allowlist is only live
  // if app.js passes it to pinoHttp(). Guard the wiring itself: removing it
  // would otherwise leave every test above passing while prod leaks.
  it('app.js passes serializers to pinoHttp', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.js'), 'utf8');
    const call = src.slice(src.indexOf('pinoHttp('));
    expect(call.slice(0, call.indexOf('}))'))).toContain('serializers');
  });

  it('logger.js applies the redact config', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'logger.js'), 'utf8');
    expect(src).toMatch(/redact/);
  });
});
