// Structured logger. pino — pino-http attaches a per-request child carrying the
// correlation id, so log.error inside a handler is traceable end-to-end.
'use strict';
const pino = require('pino');
// Credential redaction — pino-http logs req/res headers, and
// authorization/cookie/set-cookie carry live tokens. See
// @matthewdbaldwin/microport-auth's logRedact module (src/app.js wires the
// `serializers` half onto pinoHttp()).
const { redact } = require('@matthewdbaldwin/microport-auth');

const logger = pino({
  name: 'productport-api',
  level: process.env.LOG_LEVEL || 'info',
  base: { service: 'productport-api', env: process.env.NODE_ENV || 'development' },
  redact,
});

module.exports = logger;
