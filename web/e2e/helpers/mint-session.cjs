#!/usr/bin/env node
'use strict';

/**
 * web/e2e/helpers/mint-session.cjs
 *
 * Mints a real ProductPort session JWT for the local capture harness
 * (e2e/capture.setup.ts), and prints one from the command line for curl-level
 * debugging.
 *
 * WHY THIS EXISTS
 * ---------------
 * ProductPort has no login of its own. It is an SSO spoke: its only doors are
 * /api/auth/sso/start and /api/auth/sso/exchange, both of which need a
 * reachable HubPort IdP behind the branded front door, and
 * src/middleware/auth.js only ever VERIFIES tokens (RS256, issuer and
 * audience pinned via microport-auth's createVerifier). Nothing in this repo
 * signs one. So a local harness cannot drive the hub's login form the way
 * e2e/auth.setup.ts does when no hub is reachable: it has to hold a private
 * key whose public half the local API is configured to trust.
 *
 * That is the whole setup. One throwaway RS256 keypair: the public half in
 * the API's SALESPORT_JWT_PUBLIC_KEY (the name is historical; in deployed
 * environments it carries the hub's key — see src/middleware/auth.js), the
 * private half in E2E_JWT_PRIVATE_KEY, both base64-encoded PEMs, both only
 * ever in the local .env. Generate one with:
 *
 *   node -e "const c=require('node:crypto');const k=c.generateKeyPairSync('rsa',{modulusLength:2048,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});console.log('SALESPORT_JWT_PUBLIC_KEY='+Buffer.from(k.publicKey).toString('base64'));console.log('E2E_JWT_PRIVATE_KEY='+Buffer.from(k.privateKey).toString('base64'))"
 *
 * This is NOT a backdoor in the app: nothing here runs in the server process,
 * there is no new route, and a token minted here is accepted only by an API
 * that was deliberately configured to trust this keypair, i.e. a local one.
 * Against a deployed API the key does not match and every request 401s.
 *
 * The claim set follows microport-contracts' SsoClaims exactly. The API runs
 * that schema in `enforce` mode (SSO_CLAIMS_MODE), so a drifted claim set is a
 * 401, not a warning: sub, email, name, role, app_roles.productport, iss,
 * aud, iat, exp. No `jti` ON PURPOSE: hub-minted access tokens carry one and
 * require a matching local Session row; a jti-less token takes the stateless
 * path instead, which is the only path this repo has ever needed (ProductPort
 * creates no Session rows of its own). The user row is JIT-upserted from the
 * claims (src/middleware/auth.js), so the seed only has to exist for
 * "updated by" columns to look real.
 *
 * `role` is the WIRE role from microport-contracts' productport role
 * contract: viewer | product | product_admin (superuser is local-elevated,
 * never SSO-granted — src/lib/resolveRole.js). It maps 1:1 onto the Prisma
 * Role enum here, so the value passed in is also the value the JIT-upserted
 * row ends up with.
 *
 * Signing uses node:crypto rather than jsonwebtoken because this file lives
 * under web/, whose own package.json does not depend on jsonwebtoken (the
 * root package.json does, for the server and its tests). RS256 is
 * RSASSA-PKCS1-v1_5 over SHA-256, crypto.sign's default for an RSA key. When
 * SALESPORT_JWT_PUBLIC_KEY is also set, the signature is verified against it
 * before the token is returned, so a mismatched pair fails here with a plain
 * message instead of as a 401 three layers away.
 *
 * Required env (dotenv-loaded from the repo-root .env; an exported value
 * always wins):
 *   E2E_JWT_PRIVATE_KEY   base64 PEM (pkcs8), the private half of the pair
 *   SALESPORT_JWT_ISSUER  must equal the running API's
 * Optional:
 *   SALESPORT_JWT_PUBLIC_KEY  base64 PEM (spki), enables the self-check
 *
 * Usage: node web/e2e/helpers/mint-session.cjs [email] [role]
 *        (defaults: admin@microport.com product_admin)
 */

const crypto = require('node:crypto');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

// Mirror the API's dotenv load so a developer running the harness does not
// have to export the API's secrets by hand. dotenv never overwrites a
// variable that is already set. It resolves from the repo root's
// node_modules (web/ has its own, separate node_modules and does not carry
// its own dotenv dependency); if it is somehow absent, an exported env still
// works.
try {
  require('dotenv').config({ path: path.join(REPO_ROOT, '.env') });
} catch {
  /* env already exported is fine */
}

// Must match src/lib/cookies.js (cookie name) and src/middleware/auth.js
// (AUDIENCE). Duplicated as literals rather than required from the API: those
// modules pull in microport-auth and jwtTtl.js for the sake of one string
// each, and tests/e2e-mint-session.test.js pins both against the API's own
// exports so they cannot drift silently.
const COOKIE_NAME = 'productport_token';
const AUDIENCE = ['productport', 'microport-apps'];
const APP = 'productport';
// A hub session is eight hours; a capture run never needs more.
const DEFAULT_TTL_SEC = 8 * 60 * 60;

const b64url = (input) => Buffer.from(input).toString('base64url');

function pemFromEnv(name) {
  const raw = process.env[name];
  if (!raw) return null;
  const decoded = Buffer.from(raw, 'base64').toString('utf8');
  if (!decoded.includes('-----BEGIN')) {
    throw new Error(`${name} must be a base64-encoded PEM; it does not decode to one.`);
  }
  return decoded;
}

/**
 * Mint a session token for `email` with ProductPort wire role `role`.
 * @returns {{ token: string, expiresAt: number, cookieName: string, claims: object }}
 *   expiresAt is a unix timestamp in seconds, the shape Playwright's
 *   addCookies wants.
 */
function mintSession({
  email = 'admin@microport.com',
  role = 'product_admin',
  name = 'Admin User',
  sub = 1,
  ttlSec = DEFAULT_TTL_SEC,
} = {}) {
  const privateKey = pemFromEnv('E2E_JWT_PRIVATE_KEY');
  if (!privateKey) {
    throw new Error('E2E_JWT_PRIVATE_KEY is not set. See the header of web/e2e/helpers/mint-session.cjs for how to generate a local keypair.');
  }
  const issuer = process.env.SALESPORT_JWT_ISSUER;
  if (!issuer) {
    throw new Error('SALESPORT_JWT_ISSUER is not set. It must equal the running API\'s.');
  }

  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + ttlSec;
  const claims = {
    sub, email, name, role,
    app_roles: { [APP]: role },
    iss: issuer,
    aud: AUDIENCE,
    iat, exp,
  };
  const signingInput = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(JSON.stringify(claims))}`;
  const signature = crypto.sign('sha256', Buffer.from(signingInput), privateKey);

  const publicKey = pemFromEnv('SALESPORT_JWT_PUBLIC_KEY');
  if (publicKey && !crypto.verify('sha256', Buffer.from(signingInput), publicKey, signature)) {
    throw new Error('E2E_JWT_PRIVATE_KEY does not match SALESPORT_JWT_PUBLIC_KEY; the API would 401 this token. Regenerate the pair and set both.');
  }

  return { token: `${signingInput}.${b64url(signature)}`, expiresAt: exp, cookieName: COOKIE_NAME, claims };
}

module.exports = { mintSession, COOKIE_NAME, AUDIENCE };

if (require.main === module) {
  try {
    const [email, role] = process.argv.slice(2);
    process.stdout.write(`${mintSession({ email, role }).token}\n`);
  } catch (err) {
    process.stderr.write(`[mint-session] ${err && err.message ? err.message : err}\n`);
    process.exitCode = 1;
  }
}
