# ProductPort Refresh Client — Design

**Date:** 2026-08-14
**Status:** Approved design, pending implementation plan
**Tracks:** Follow-on to hubport#67 (Track B, CLOSED). Second of three satellites
(salesport → productport → EngagePort) gaining silent-token-renewal support.
Salesport's equivalent design/plan/build is complete and shipped to `develop`
(`salesport/docs/superpowers/specs/2026-08-14-salesport-refresh-client-design.md`).

## Goal

Give ProductPort the consumer-side refresh client it lacks, so HubPort/SalesPort's
IdP can safely add `productport` to `SSO_REFRESH_SATELLITES` and move ProductPort
sessions from the legacy 8h stateless token to the short-access (15 min) +
rotating-refresh (90 d) pair — the posture execport/reviewport/opsport/clinicport
already run.

## Background

ProductPort is a pure SSO spoke — it has no local login, no IdP role of its own,
and (unlike salesport) every token it ever sees comes from the same source: the
legacy handoff exchange at `{IDP_API}/api/auth/handoff/exchange` (defaulting to
salesport-as-IdP; repointed to HubPort via `IDP_API_URL`). `POST /sso/exchange`
(`src/routes/auth.js:57-83`) forwards that token verbatim into the session cookie
and never requests the (access, refresh) pair — no `X-Satellite-Refresh: 1` header
is sent, so the IdP always mints the single legacy token. `src/lib/cookies.js`
already carries `REFRESH_COOKIE_NAME`/`setRefreshCookie`/`clearRefreshCookie`
(via `createCookieHelpers`) for shape parity with the rest of the fleet, but they
are unused — the file's own header comment documents this as deliberately out of
scope for the 2026-08-05 cookie-hardening pass that added it.

This design is **the consumer half only**: the wiring the other four satellites
already carry via `@matthewdbaldwin/microport-auth`'s `createRefreshClient` +
`createWithFreshAccessToken`, adapted to ProductPort's simpler topology.

**Zero HubPort/IdP code changes.** Nothing here changes the IdP; onboarding is
code here first, env vars later (Rollout, below).

### Verified against real code, not by analogy to salesport

The initial design pass assumed productport would mirror salesport's shape
closely. A direct read of productport's own code (and the two satellites that
already ship this pattern live — clinicport and execport) corrected three things
salesport's design does not apply here:

1. **No web-side task.** `web/lib/api.ts` is pure cookie-credentialed
   (`credentials: 'include'`, no `Authorization` header, no `localStorage` token
   read anywhere in the request path). The one place a Bearer header is sent
   (`web/lib/theme.ts:33`) targets `PATCH /api/auth/me/theme`, which since
   2026-08-04 ignores Bearer entirely and authenticates via a per-satellite
   service key instead (`src/routes/auth.js:116-145`) — so that Bearer send is
   vestigial. The browser picks up a renewed session cookie automatically on the
   next request; there is nothing for the web client to do.
2. **No id-space-bug class.** `requireAuth` resolves every user by `payload.email`
   (`src/middleware/auth.js:93-102`) and never reads `payload.sub` at all — the
   bug class salesport had (satellite `User.id` vs. hub `sub` being different
   numeric spaces) cannot occur here structurally. No dual-key foreign/self test
   path is needed.
3. **No verify adapter needed.** ProductPort's existing `verify` function (from
   `createVerifier`, `src/middleware/auth.js:38-49`) already has the exact call
   shape `createWithFreshAccessToken` needs — `verify(token, { audience,
   ignoreExpiration })` — so it can be passed straight through as `config.verify`
   with zero wrapper, unlike salesport's `verifyForRefreshPeek` adapter.

### A pre-existing hazard this plan must neutralize, not just wire around

`requireAuth` (`src/middleware/auth.js`, the `if (payload.jti)` block) does a
local `db.session.findUnique({ where: { jti: payload.jti } })` and 401s with
`SESSION_NOT_FOUND` if no row exists. This code was carried over from the
shared satellite auth-file lineage (clinicport, execport), where it guards
**locally-minted** session tokens from each app's own `/login` route
(`createSessionAndSignToken`, which creates the matching `Session` row at mint
time). **ProductPort has no local login and no code path that ever creates a
`Session` row.** Today this block is dead — the legacy 8h token productport
receives carries no `jti` (confirmed: salesport's `signToken`, the legacy-path
signer, never stamps one), so `payload.jti` is always falsy and the branch never
runs.

The refresh flow changes that — for productport's *current* IdP path.
ProductPort's exchange target is SalesPort (`IDP_API` defaults to
`SALESPORT_API_URL` until the Slice-4h IdP flip to HubPort — see
`src/routes/auth.js`), and SalesPort's own short-lived access token is minted
by `signAccessToken`, which **always** stamps a `jti` (`salesport/src/middleware/auth.js:818-821`,
unconditional, used whenever `X-Satellite-Refresh: 1` triggers the pair path).
The instant productport opts in, every access token it receives — the initial
one from `/sso/exchange` and every subsequent refreshed one — carries a `jti`
with no local `Session` row behind it. Without a fix, `requireAuth` would 401
`SESSION_NOT_FOUND` on the very first authenticated request after refresh flips
on: the feature would actively break auth, not just sit inert. **This jti-always-
stamped behavior is specific to SalesPort's signer, not a property of "the IdP"
in general** — HubPort's own docs describe having removed jti embedding from its
token signer, so a future IdP flip to HubPort would need this assumption
re-verified rather than carried over.

**Fix (in scope for this plan, Component 2 below):** remove the jti-based local
session lookup from productport's `requireAuth`. ProductPort was never given a
local session-creation path, so this block has no legitimate case to protect —
building one now (to make the lookup meaningful) would be new infrastructure this
plan doesn't need and YAGNI argues against. Session-level revocation for
hub-issued tokens is already handled by mechanisms independent of this block:
hub's own refresh-token family-revoke, and productport's existing fast-revocation
`active`-field recheck (`src/middleware/auth.js:103`) plus the lifecycle webhook
receiver (`src/routes/ssoLifecycle.js`) — both untouched by this plan and both
already confirmed live.

**⚠ Fleet-wide follow-up, NOT fixed by this plan, recorded for separate triage
(scoped narrower than earlier drafts of this note — see below).**
Reading clinicport's and execport's own `/sso/exchange` handlers found neither
creates a local `Session` row for hub-issued tokens either — their jti/session
block exists solely for their own `/login` route's locally-minted tokens. Grep
found no live `CLINICPORT_REFRESH_ENABLED=true` in either repo's checked-in
config (task-defs aren't in the repo, so this isn't a full answer), but if that
flag is ever `true` in a real environment **where their IdP path is also
SalesPort** (whose signer always stamps `jti`, per above), clinicport (and
structurally execport, if its own refresh flag were ever flipped the same way)
would hit the identical `SESSION_NOT_FOUND` storm on every request past the
first refresh. This is a SalesPort-as-IdP-path hazard specifically, not a
universal one — a satellite whose refresh path already points at HubPort would
not be exposed, since HubPort's signer does not stamp `jti`. This needs a
fleet-wide check (confirm the live flag states, confirm which IdP each
satellite's refresh path actually targets, confirm whether either has actually
been exercised with refresh-flow tokens in anger) — out of scope for
productport's plan, tracked in the rollout memory checkpoint as its own thread.

## Architecture

Four small, additive changes, all in the productport repo. Shipped fully
**inert**: the peek middleware no-ops until `PRODUCTPORT_REFRESH_ENABLED=true`,
the refresh client no-ops until `IDP_REFRESH_SHARED_SECRET` is provisioned, and
the IdP sends no pair until productport requests it (which only happens when the
flag above is on) — two independent gates, both defaulting off, plus the
allowlist-equivalent opt-in header being conditioned on the same flag.

```
browser ──(productport_token + productport_refresh cookies, cookie-only client)──▶
  app.js: withFreshAccessToken (peek, mounted on /api before every router)
    ├─ flag off → next()
    ├─ no refresh cookie → next()  (pre-rollout sessions: zero overhead)
    ├─ token >2 min left → next()
    └─ near-expiry/expired → lib/refreshClient → POST IdP /api/auth/refresh
         ├─ pair → rotate both cookies, mutate req.cookies for same-request
         │         visibility → next()
         └─ null → clear refresh cookie → next()  (requireAuth decides; never 401s here)
  requireAuth (email resolution unchanged; jti/local-session block REMOVED — see Background)
```

### 1. `src/lib/refreshClient.js` — new, thin adapter

```js
const client = createRefreshClient({
  apiUrl:       () => process.env.IDP_API_URL || process.env.SALESPORT_API_URL,
  sharedSecret: () => process.env.IDP_REFRESH_SHARED_SECRET || process.env.SALESPORT_REFRESH_SHARED_SECRET,
  satelliteId:  'productport',
});
module.exports = { ...client, revokeUpstreamRefresh: client.revokeOnSalesport };
```

- **IDP_\*-first with a `SALESPORT_*` fallback** — matching productport's own
  existing `/sso/exchange` resolver (`const IDP_API = process.env.IDP_API_URL ||
  SALESPORT_API;`) and clinicport's Slice-0 resolver shape. Unlike salesport
  (which has no self-pointer and deliberately omits the fallback), productport
  has always resolved this way; keep it consistent.
- **Single-flight wrapper** around `refreshFromSalesport`, identical mechanism to
  salesport's: a module-level map keyed by the raw refresh token, entry removed
  in `finally` on both success and failure. This is the defense against hub's
  replay-detection family-revoke when concurrent requests share one refresh
  cookie — required regardless of app, not a salesport-specific concern.
  (Note: clinicport's own `refreshClient.js` has no single-flight wrapper — a gap
  worth flagging alongside the jti finding above, not fixed here.)

### 2. `src/middleware/auth.js` — peek wiring + the jti-block removal

**Peek wiring** — no adapter needed; productport's existing `verify` passes
straight through:

```js
const withFreshAccessToken = createWithFreshAccessToken({
  verify:       verify,               // existing createVerifier() result, unchanged
  audience:     AUDIENCE,             // existing ['productport', 'microport-apps']
  isEnabled:    () => process.env.PRODUCTPORT_REFRESH_ENABLED === 'true',
  thresholdSec: 120,
  getRefreshToken: (req) => req.cookies?.[REFRESH_COOKIE_NAME] || null,
  getAccessToken:  (req) => req.cookies?.[COOKIE_NAME] || null,   // cookie-only; no Bearer path
  refresh: (rawRefresh, req) => refreshFromHub(rawRefresh, req.log),
  onRefreshed: (req, res, pair) => {
    const refreshRemainMs = Date.parse(pair.refreshTokenExpiresAt) - Date.now();
    setSessionCookie(res, pair.accessToken,
      Number.isFinite(refreshRemainMs) && refreshRemainMs > 0 ? refreshRemainMs : undefined);
    setRefreshCookie(res, pair.refreshToken);
    req.cookies[COOKIE_NAME] = pair.accessToken; // same-request visibility — requireAuth
                                                   // reads req.cookies[COOKIE_NAME] as its
                                                   // ONLY source (no candidate list), so a
                                                   // direct mutation is sufficient; no
                                                   // salesport-style req.freshSessionToken
                                                   // field or header rewrite is needed.
  },
  onRefreshFailed: (_req, res) => clearRefreshCookie(res),
});
```

`REFRESH_COOKIE_NAME` needs importing from `../lib/cookies` (already exported;
today unused by anything). `refreshFromHub` is the renamed re-export from
Component 1.

**The jti-block removal** — delete the `if (payload.jti) { ... }` session lookup
in `requireAuth` (`src/middleware/auth.js:66-75`, including its closing brace;
the surrounding `try { ... }` at line 64 continues past it into the existing
role-resolution/JIT-provision code at line 77+, so removal is a clean excision,
not a restructure) per the Background section's finding. `req.sessionId` (read
later by `POST /logout`, `src/routes/auth.js:91`) becomes permanently
`undefined` — which is what it already evaluates to today for every request
that reaches that far (the block never successfully resolves a session today,
since it always 401s first when `payload.jti` is present and never runs at all
when absent). The existing `if (req.sessionId) await db.session.update(...)`
guard in `/logout` already handles `undefined` safely (no-op) — that line does
not need to change.

Export `withFreshAccessToken`.

### 3. `src/app.js` — mount

```js
app.use('/api', withFreshAccessToken);
```

Mounted immediately after the existing `app.use('/api', csrfGuard)` (line 74)
and before `app.use('/api/auth', require('./routes/auth'))` (line 90), so it
runs ahead of every current and future `requireAuth`-gated router — global mount,
matching salesport's decision, not a per-router mount.

### 4. `src/routes/auth.js` — exchange, logout

**`POST /sso/exchange`** (`:57-83`):

- Send `X-Satellite-Refresh: 1` to the IdP when
  `process.env.PRODUCTPORT_REFRESH_ENABLED === 'true'` (mirrors clinicport's
  `refreshEnabled` gate at `clinicport/src/routes/auth.js:136-138` — this is the
  per-request opt-in the IdP's handoff/exchange checks, independent of any
  satellite allowlist).
- When the IdP response includes `payload.refreshToken`: set the session cookie
  with `maxAgeMs` = refresh-token remaining lifetime (fall back to today's
  default TTL if unparseable), set the refresh cookie, and **delete
  `refreshToken`/`refreshTokenExpiresAt` from the forwarded JSON body** before
  `res.json(payload)`. This is a deliberate departure from clinicport, which
  forwards the raw refresh token verbatim in the JSON response during its
  "dual-mode transition" — that violates the hard security invariant salesport's
  refresh-client design established (raw refresh token must only ever travel via
  HttpOnly cookie or server-to-server header, never a JS-readable response body).
  Apply that invariant here from the start rather than replicating clinicport's
  weaker interim shape.
- No pair (`payload.refreshToken` absent, or flag off so the header was never
  sent): byte-identical to today.

**`POST /logout`** (`:85-96`), before `clearSessionCookie(res)`:

```js
const rawRefresh = req.cookies?.[REFRESH_COOKIE_NAME];
if (rawRefresh) revokeUpstreamRefresh(rawRefresh, req.log, req.id).catch(() => {});
clearRefreshCookie(res);
```

Best-effort, fire-and-forget — a captured refresh token must not outlive logout,
but an IdP outage must not block logout.

## Failure modes

| Condition | Behavior |
|---|---|
| `PRODUCTPORT_REFRESH_ENABLED` unset/false | Peek no-ops; exchange never sends the opt-in header. Byte-identical to today. |
| No `productport_refresh` cookie (pre-rollout session) | Peek no-ops after one cookie read. |
| `IDP_REFRESH_SHARED_SECRET` unset | Refresh client returns null; peek falls through; session dies at token exp → next request 401s → browser bounces to SSO. |
| IdP down / non-2xx / timeout | Same null-fallthrough, indistinguishable (same shared-lib contract gap noted in salesport's spec — not re-litigated here, same fleet-wide follow-up applies). |
| Refresh token revoked/expired/reused | IdP 401s → refresh cookie cleared → session ends at access-token exp → bounce → re-SSO. |
| Concurrent refresh, same instance | Single-flight: one upstream call, shared result. |
| Concurrent refresh, cross-instance | Residual risk, same as the four live satellites — unmitigated here, same as salesport's design. |
| A jti-bearing token reaches `requireAuth` post-rollout | With the Component 2 fix: resolved by email as normal, no session lookup attempted. Without the fix: guaranteed `SESSION_NOT_FOUND` 401 storm — this is why the fix is in scope, not optional hardening. |

## Security invariants (must survive review)

1. **Never re-sign the IdP's token.** The refreshed access token is cookied and
   used as-is.
2. **Raw refresh token never enters JS or logs.** HttpOnly cookie + server-to-server
   header only; stripped from the exchange's forwarded body (a stricter stance
   than clinicport's current shape — see Component 4); never logged.
3. **Secrets by name only.** `IDP_REFRESH_SHARED_SECRET`'s value and any Secrets
   Manager ARN never appear in code, comments, commits, or logs.
4. **Forged tokens can't trigger refresh** — the peek verifies (ignoreExpiration)
   before trusting `exp` (shared-lib contract, unchanged).
5. **The peek never responds and never throws** — no new 401 source.
6. **Removing the jti/session block must not weaken any OTHER check** —
   `requireAuth`'s `active`-field recheck and the session-revoked/expired paths
   for locally-minted tokens don't exist in productport (no local login), so
   nothing else depends on this block. Verify this claim explicitly during
   implementation (grep for any other reader of `req.sessionId` besides
   `/logout`).

## Testing

Jest, existing conventions (mocked prisma, `jest.resetModules()` + local
re-require for module-scope env reads):

- **refreshClient:** IDP_*-first-with-SALESPORT_*-fallback resolution; single-flight
  (two concurrent calls, same token → one upstream fetch, both resolve the same
  pair; map entry cleared after settle on both success and failure).
- **peek middleware:** flag off → no-op; no refresh cookie → no-op; >2 min left →
  no upstream call; near-expiry → refresh called, both cookies rotated,
  `req.cookies[COOKIE_NAME]` mutated for same-request visibility; expired-but-valid
  token → still refreshes (ignoreExpiration); forged token → no refresh; refresh
  null → refresh cookie cleared, `next()` still called; audience-mismatched token
  → no refresh.
- **requireAuth regression:** a jti-bearing token (simulating a hub-refreshed
  access token) with NO matching `db.session` row authenticates successfully by
  email, confirming the removed block doesn't 401 it — this is the single most
  important new test in the whole plan, since it's the regression guard for the
  landmine this design exists to close. A second test confirms `/logout` still
  no-ops safely (`req.sessionId` undefined, no `db.session.update` call).
- **exchange:** flag on + IdP pair response → `X-Satellite-Refresh: 1` sent, both
  cookies set, refresh token absent from forwarded JSON, `token` still present;
  flag off → header never sent, byte-identical current behavior (explicit
  regression assertion); flag on + IdP returns no pair anyway → byte-identical
  current behavior.
- **logout:** refresh cookie present → upstream revoke called with it + cookie
  cleared; absent → no upstream call; IdP failure → logout still 200s.

Since productport has no existing dual-keypair/foreign-token test convention
(unlike salesport), and doesn't need one (Background, point 2), no new test
convention needs establishing here — existing single-key JWT fixtures
(`tests/authVerify.test.js`) are sufficient for every new test above.

## Rollout

Same discipline as salesport's: code ships inert everywhere, env changes are
separate, and **every prod env change waits for Matt's explicit go** (⛔).

1. **Code (inert):** commit to `develop` → dev deploy; merge to `main` → prod
   deploy. Safe with zero env work — both gates default off, and the exchange
   route never sends the opt-in header while the flag is off.
2. **Dev enablement:** productport-dev task-def gets
   `PRODUCTPORT_REFRESH_ENABLED=true` + `IDP_REFRESH_SHARED_SECRET` (secret
   reference to the same hub-dev ARN the other satellites use). Verify on dev:
   sign-in works; after >13 min a request triggers exactly one refresh (log
   line), no `SESSION_NOT_FOUND`/401 storm (the regression this plan exists to
   prevent); logout revokes upstream.
3. **⛔ Prod satellite env** (Matt's go): productport prod task-def gets the flag
   + secret reference.
4. **⛔ IdP-side allowlist/config** (Matt's go, separately, whatever mechanism
   the IdP uses to accept `X-Satellite-Refresh: 1` from productport — verify the
   exact gate during implementation, since productport's exchange target is the
   legacy handoff endpoint, not necessarily hub's `SSO_REFRESH_SATELLITES` path
   salesport used). Then a 30-min CloudWatch sweep on productport + IdP prod log
   groups for `SESSION_NOT_FOUND`/`REFRESH_`/pino `$.level >= 40`.
5. **Rollback:** `PRODUCTPORT_REFRESH_ENABLED=false` → peek off + exchange stops
   requesting pairs; existing pair sessions die at access-token exp and re-SSO.
   Env-only, no redeploy of code. This is a genuine satellite-side kill switch
   (with the whole-branch-review fix to `/sso/exchange`'s pair-consuming
   condition, ProductPort ignores a refresh pair even if the upstream IdP is
   separately configured to send one) — but it only controls the satellite
   side. Whether HubPort *offers* a pair at all is gated separately,
   server-side, by HubPort's own `SSO_REFRESH_SATELLITES` allowlist config
   (not by the `X-Satellite-Refresh` header alone), so a full end-to-end
   rollout also requires a corresponding HubPort-side allowlist change —
   out of scope for this plan/repo.

## Out of scope

- IdP/HubPort code changes of any kind.
- The fleet-wide jti/local-session hazard in clinicport and (structurally)
  execport — flagged in Background, needs its own separate investigation and,
  if confirmed live-risk, its own fix. Not attempted here.
- Retro-fitting the refresh-token body-strip onto clinicport/execport, or adding
  clinicport's missing single-flight wrapper — candidate follow-ups, not this
  project.
- ProductPort's own `/api/service/users/theme` relay and other IdP-service-key
  surfaces — untouched, unrelated.
- EngagePort's refresh client — next in sequence, its own design cycle.
