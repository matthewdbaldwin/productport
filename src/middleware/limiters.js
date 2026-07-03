// src/middleware/limiters.js
// Canonical MicroPort platform limiters (fleet parity — apple audit
// 2026-07-03 flagged productport as the only satellite with ZERO rate
// limiting). Built via microport-auth's makeLimiters(), which bakes in the
// ONE correct skip policy (ciOnlySkip — CI only, NEVER NODE_ENV=development,
// so the internet-reachable AWS dev mesh stays throttled) plus the canonical
// header flags.

const { makeLimiters } = require('@matthewdbaldwin/microport-auth');

const { apiLimiter, authLimiter } = makeLimiters({
  // Global API rate limit applied via app.use('/api', apiLimiter). 500/15min.
  apiLimiter: { windowMs: 15 * 60 * 1000, max: 500 },
  // Tight limit on the SSO token exchange (productport is pure-SSO — no local
  // login/forgot paths to guard). 20 attempts / 15 min per IP.
  authLimiter: {
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { error: 'Too many authentication attempts. Please try again later.' },
  },
});

module.exports = { apiLimiter, authLimiter };
