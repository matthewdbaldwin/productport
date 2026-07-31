# ProductPort service-auth — design

**Date:** 2026-07-30
**Status:** approved (design); implementation not started
**Scope:** sub-project 1 of 4 (see [Decomposition](#decomposition))

## Problem

ProductPort has no machine-usable write path. `requireAuth` reads the token
*only* from the `productport_token` cookie with no `Authorization` fallback
(`src/middleware/auth.js:51`, deliberate per
`feedback_phase4_cookie_vs_bearer_drift`), and that cookie holds an RS256 SSO JWT
checked against a live `Session` row. There is no service account and no machine
credential of any kind.

The consequence, observed 2026-07-30 while applying a Coronary catalogue review:
every automated catalogue edit requires a human to copy an `httpOnly` cookie out
of browser devtools. That session cost four round trips to plumbing — a missing
CSRF header, then an expired token, then the discovery that re-copying the cookie
returns the *same* expired JWT because cookie lifetime is independent of the inner
JWT's `exp`. Credentials also end up pasted into transcripts, and expire mid-task.

## Goals

- Authenticated, non-interactive catalogue writes with no browser involvement.
- Least privilege: a credential can hold read-only, or write-but-not-delete.
- Instant revocation and rotation without a redeploy.
- Regulated-record integrity: every automated edit names an accountable human.
- Shaped so the guard interface lifts into `microport-auth` unchanged (sub-project 2).

## Non-goals

- No HubPort changes. No JWKS wiring. (`HUBPORT_JWKS_URL` stays unset and inert.)
- No changes to browser/SSO auth. The existing cookie suite must pass untouched.
- No rollout to other satellites — that is sub-project 3.
- No token-minting HTTP endpoint (see [Minting](#minting)).

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Credential model | DB-backed bearer service tokens | Scopes and revocation become first-class; good agent/CLI ergonomics; no redeploy to rotate |
| Successor | HubPort-minted machine JWTs, explicitly planned | Likely fleet end state; this design leaves a named seam rather than a rethink |
| Capability model | Per-credential scopes | Only model that permits handing out a narrow credential later |
| Attribution | Service identity **plus** accountable human | Catalogue carries NMPA/FDA/CE data; a shared credential must not be the sole actor of record |
| Token hashing | sha256, not bcrypt | 256-bit random secrets, not low-entropy passwords — a slow KDF buys nothing and taxes every call |
| Minting surface | CLI script, not an endpoint | Minting is rare; an endpoint is a high-value target needing its own protection |

## Data model

```prisma
model ServiceClient {
  id          String    @id @default(cuid())
  name        String    @unique   // "svc:catalog-agent" — the audit actor string
  description String?             // what it is for, who owns it
  tokenPrefix String              // "ppsk_a1b2c3d4" — displayable identifier
  tokenHash   String    @unique   // sha256 of the full token; plaintext never stored
  scopes      String[]            // ["catalog:read","catalog:write"]
  expiresAt   DateTime?           // null = no expiry
  revokedAt   DateTime?
  lastUsedAt  DateTime?
  createdAt   DateTime  @default(now())
  createdBy   String              // email of the human who minted it

  @@index([tokenHash])
  @@map("service_clients")
}
```

`ProductAudit` gains **one** nullable column:

```prisma
actor String?   // service name for machine writes; null for UI writes
```

`userEmail` continues to hold the effective human in both cases, so existing audit
consumers are unaffected and no backfill is required. "Was this automated" is
`actor IS NOT NULL`.

### Token format

`ppsk_` + 32 random bytes, base64url. The prefix is greppable by secret scanners
and safe to log. `tokenPrefix` stores the first 12 characters so `list` can
identify a credential without holding the secret. Verification is a sha256 of the
presented token looked up against the indexed `tokenHash` — one indexed read, no
per-row scan.

### Minting

`scripts/service-token.js`, following the existing `scripts/db-migrate.js` pattern:

- `mint --name svc:catalog-agent --scopes catalog:read,catalog:write --by <email>`
- `list` — name, prefix, scopes, `lastUsedAt`, `revokedAt`
- `revoke --name svc:catalog-agent`

Plaintext is printed **once** and is not recoverable. Production minting runs via
ECS exec. Rotation is mint-new → verify traffic moved via `lastUsedAt` → revoke-old.

## Authentication and authorization

Replace the blanket `requireAuth` at the `/api/products` mount
(`src/app.js:82`) with `authenticateAny`, which populates exactly one identity:

- `req.user` — human, from the `productport_token` cookie (unchanged logic)
- `req.service` — service client, from `Authorization: Bearer ppsk_…`

401s if neither is present. Then one helper per route:

```js
authorize('catalog:write')   // human product_admin OR service client with the scope
```

A single helper rather than two stacked guards, so a route cannot accidentally
accept a service token that a human admin would be refused for.

### Scope map

| scope | routes |
|---|---|
| `catalog:read` | `GET /api/products`, `GET /:slug`, `GET /export.csv` |
| `catalog:write` | `PATCH /:slug`, `PUT /:slug/clearances` |
| `catalog:lifecycle` | `POST /:slug/disable`, `POST /:slug/enable` |
| `catalog:delete` | `DELETE /:slug` |
| `catalog:import` | `POST /import` |

Scope strings live in `src/lib/scopes.js` as the single exported source. They must
be byte-identical to the vocabulary sub-project 2 lifts into `microport-auth` — a
drifted string silently re-grants.

### Accountable human

`X-On-Behalf-Of: <email>` is required on every write scope (`catalog:write`,
`:lifecycle`, `:delete`, `:import`) and optional on `catalog:read`. It is validated
against `User`: must exist, be `active`, and hold `product_admin` or `superuser`.
A service token therefore can neither invent an attributee nor pin a regulated
edit on someone lacking authority to make it.

On a service write, `audit()` records `userEmail` = the validated attributee,
`userId` = their id, `actor` = the service name.

## CSRF interaction

`csrfGuard` is mounted app-wide at `src/app.js:61`, **before** `requireAuth` at
`:82`, so it cannot know how a request authenticated.

**Adding `/api/products/*` to `bootstrapPaths` would be a vulnerability** — it
would disable CSRF for *cookie-authed browser* requests to the same catalogue
mutation endpoints.

Instead the guard skips only when a request presents an `Authorization: Bearer`
header **and** carries no `productport_token` cookie. Browsers never attach
`Authorization` automatically and a cross-origin form cannot set custom headers,
so this discriminator is strictly narrower than a path bypass and leaves all
browser traffic guarded. If both are present, CSRF is enforced.

## Error responses

| condition | status | code |
|---|---|---|
| no credential | 401 | `AUTH_REQUIRED` |
| bearer malformed or not found | 401 | `SERVICE_TOKEN_INVALID` |
| revoked | 401 | `SERVICE_TOKEN_REVOKED` |
| past `expiresAt` | 401 | `SERVICE_TOKEN_EXPIRED` |
| valid token, scope missing | 403 | `SCOPE_REQUIRED` (names the scope) |
| write without `X-On-Behalf-Of` | 400 | `ON_BEHALF_OF_REQUIRED` |
| attributee unknown / inactive / not admin | 400 | `ON_BEHALF_OF_INVALID` |
| `ServiceClient` lookup throws | 503 | `AUTH_UNAVAILABLE` |

Fails closed on the last row — a DB error must never fall through to an
unauthenticated success. Token values never appear in logs or error bodies; only
`tokenPrefix`. `lastUsedAt` is best-effort and must not fail the request it
records, but logs on failure rather than swallowing — an empty `.catch(() => {})`
would hide the one signal showing a credential is still live.

## Rate limiting

Service callers get a limiter bucket keyed on `ServiceClient.id` rather than
sharing `apiLimiter`'s IP keying. A legitimate bulk run is burstier than a browser
and should neither be throttled against human traffic nor throttle it.

## Migration path to HubPort JWTs

`authorize(scope)` is the seam. Under the successor model, `authenticateAny` gains
a third branch that verifies a HubPort-minted JWT and populates `req.service` from
its claims instead of from the DB. Routes and `authorize()` are unchanged.
Revocation moves to HubPort; `ServiceClient` becomes legacy rather than being
rewritten. The scope vocabulary carries over verbatim.

## Testing

Security-critical, with adversarial cases:

- bearer only → CSRF skipped
- cookie only → CSRF **still enforced**
- bearer *and* cookie → CSRF **still enforced**
- neither → 401

Unit: token generation/hash/verify, scope matching, on-behalf-of validation,
expiry and revocation checks. Route-level: accept/refuse per scope for every row
of the scope map; write refused without a valid `X-On-Behalf-Of`; read permitted
without one.

Regression: the existing cookie-flow suite must pass **untouched**. If it needs
edits, the design has broken browser auth.

## Decomposition

Fleet-wide machine auth, in order. All four are wanted; this spec covers 1.

1. **ProductPort service-auth** — this document.
2. **Extract to `microport-auth`** — generalize into `createServiceGuard` alongside
   the existing `createLifecycleGuard` / `createCsrfGuard`; centralize issuance.
3. **Fleet rollout** — 5 remaining satellites + HubPort via `satellite-fanout`,
   plus secret provisioning. Note: only HubPort uses Secrets Manager today; the
   other six hold plaintext task-def env (2026-07-13 kevlar finding), so this wave
   inherits that problem and should not widen it.
4. **Client tooling** — a small CLI so callers do not hand-roll requests.

## Prior art in this repo

`src/routes/userCensus.js` is the existing machine-auth precedent — HMAC over the
raw body via `createLifecycleGuard`, dedicated secret and header, fails closed,
CSRF-bypassed by an explicit `bootstrapPaths` entry. It was considered and
rejected as the model here: scopes cannot be expressed without a secret per
scope-set, rotation requires a redeploy, there is no usage visibility, and every
caller must reproduce an HMAC over exact raw bytes. It remains correct for fixed
server-to-server links.

`express.json` captures `req.rawBody` for every path unconditionally
(`src/app.js:39-41`), so no per-path rawBody list exists to maintain.
