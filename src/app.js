'use strict';
require('dotenv').config();
const express      = require('express');
const cors         = require('cors');
const helmet       = require('helmet');
const pinoHttp     = require('pino-http');
const cookieParser = require('cookie-parser');
const logger       = require('./lib/logger');
const logRedact    = require('./lib/logRedact');
const { errorHandler, correlationReqId } = require('@matthewdbaldwin/microport-auth');
const { csrfGuard } = require('./middleware/csrf');
const { requireAuth } = require('./middleware/auth');

const app = express();
app.disable('x-powered-by');

// Trust the ALB / load-balancer proxy so rate limiters read the real
// client IP from X-Forwarded-For rather than the proxy's internal address.
app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'"],
      styleSrc:   ["'self'", "'unsafe-inline'"],
      imgSrc:     ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", process.env.SALESPORT_API_URL].filter(Boolean),
    },
  },
}));

const corsOrigins = (process.env.WEB_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
app.use(cors({ origin: corsOrigins.length ? corsOrigins : true, credentials: true }));

app.use(pinoHttp({
  logger, genReqId: correlationReqId,
  // `serializers` carries the header allowlist and MUST be passed here, not to
  // pino() — pino-http overrides the base logger's serializers, so wiring it on
  // the logger looks correct and is silently inert. See lib/logRedact.js.
  serializers: logRedact.serializers,
}));

// Capture the raw body so webhook receivers can verify the HMAC over the exact
// bytes. JSON parsing still runs for everyone else.
app.use(express.json({
  verify: (req, _res, buf) => { req.rawBody = buf; },
}));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Health check. Mounted at BOTH /health and /api/health (before the /api csrf +
// requireAuth stack, so it never 401s or 403s): the ALB target group and other
// callers hit /api/health, matching the rest of the fleet.
const health = (_req, res) => res.json({ ok: true, service: 'productport-api', version: require('../package.json').version });
app.get('/health', health);
app.get('/api/health', health);

// Fleet-canonical rate limits (apple 2026-07-03: pp was the only satellite
// with NONE). Global cap on /api; tight cap on the SSO exchange — pp is
// pure-SSO, so the exchange is its only auth-attempt surface.
const { apiLimiter, authLimiter } = require('./middleware/limiters');
app.use('/api', apiLimiter);
app.post('/api/auth/sso/exchange', authLimiter);

// CSRF guard on /api, with BOOTSTRAP_PATHS bypassing signature-authed ingress
// (webhooks/lifecycle verify their own HMAC). feedback_csrf_bootstrap_allowlist_drift.
app.use('/api', csrfGuard);

// ── Unauthenticated, signature-authed ingress FIRST ──────────────────────────
// Mounted BEFORE the bare-/api requireAuth routers so requireAuth doesn't 401
// the webhook before its own HMAC check runs. feedback_express_mount_prefix_path_check.
// Inbound SSO-lifecycle events from salesport (grant/revoke/disable/reactivate)
// + the hourly /state reconciliation probe. Fleet-canonical path + HMAC.
app.use('/api/sso/lifecycle', require('./routes/ssoLifecycle'));

// HubPort fleet-union census pull (read-only, HMAC-signed, dedicated secret —
// see src/routes/userCensus.js). Mounted alongside the lifecycle receiver: same
// "signature-authed ingress, no cookie auth" section, same csrf bootstrap-bypass
// treatment.
app.use('/api/internal/user-census', require('./routes/userCensus'));

// ── Auth (login/SSO callback/logout) — its own internal gating ───────────────
app.use('/api/auth', require('./routes/auth'));

// ── Authenticated business routes ────────────────────────────────────────────
// Every authenticated employee is at least a `viewer` — the catalog read API is
// open to all of them; editing lives in a role-gated router (P1 tail).
app.use('/api/products', requireAuth, require('./routes/products'));

// Outbound bug reports forward SYNCHRONOUSLY to the SalesPort central queue
// (signed, fleet pattern). bug-report-fanout.
app.use('/api/bug-reports', require('./routes/bugReports'));

// Inbound OpsPort integration (HubPort forum #22, D6) — product lookup + a
// country-clearance read. Own bearer-key gate (requireOpsportKey), not the
// human cookie session; GET-only, so the /api csrfGuard mounted above is a
// no-op here (safe methods bypass it).
app.use('/api/opsport', require('./routes/opsport'));

// Error handler LAST — 5xx → generic body (no leak), 4xx surface their message,
// err.status/.code honored. From microport-auth.
app.use(errorHandler({ logger }));

module.exports = app;
