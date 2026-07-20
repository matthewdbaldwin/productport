'use strict';
// Sensitive-field redaction for the pino logger. pino-http logs req/res headers
// by default, and `authorization` (Bearer) + `cookie` / `set-cookie` carry LIVE
// session/access tokens — without this they'd land in CloudWatch in the clear.
// So this is load-bearing for credential hygiene, not cosmetic.
//
// Mirrors salesport/src/lib/logger.js's redact block (the fleet reference),
// plus `res.headers["set-cookie"]` which that block omits (fresh session
// tokens ride the login/refresh RESPONSE). Ported fleet-wide as the beacon
// "redact() is salesport-only" systemic follow-up. Kept as its own module so
// lib/logger.js requires it and it can later hoist to a shared package.
module.exports = {
  paths: [
    'password', 'passwordHash',
    'req.headers.authorization', 'req.headers.cookie',
    'res.headers["set-cookie"]',
    '*.token', '*.secret', '*.key',
  ],
  censor: '[REDACTED]',
};
