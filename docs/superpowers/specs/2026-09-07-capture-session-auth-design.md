# Capture-session auth for the help-media harness

Status: specified, not implemented. Settled over two grilling rounds on 2026-09-07.
Scope of this spec: ProductPort. Fleet-wide consequences are recorded but deferred.

## Problem statement

ProductPort's help library ships no screenshots and no clips. Every article is
text. OpsPort has three videos, ClinicPort and FinPort have stills, and a
ProductPort reader learning the catalog filters gets prose describing a screen
they cannot see.

The blocker is not the pipeline. ffmpeg is installed, the transcode gates are
written, the capture Playwright config exists, and a seeded throwaway database
is running. The blocker is that a capture needs an authenticated browser, and
ProductPort cannot produce one locally.

ProductPort is an SSO spoke. It has no login form of its own: `/login` redirects
straight to the hub, and `src/middleware/auth.js` only ever verifies tokens.
Nothing in the repo signs one. The existing `web/e2e/auth.setup.ts` drives the
hub's login form, which works against the deployed dev mesh but not on a
developer's box, where the local hub seed holds four users and none of them is
the account that harness expects. So the capture specs have never run, and the
first clip has never been produced.

This is the same wall FinPort hit, and FinPort solved it. The work here is to
take that solution rather than invent a second one.

## Solution

Add a local-only session mint to ProductPort, ported from
FinPort's `web/e2e/helpers/mint-session.cjs`.

The mint holds the private half of a throwaway RS256 keypair. The local API is
configured to trust the public half. A capture run mints a token, sets it as the
session cookie, proves the session works, and saves the storage state that the
capture projects already expect.

The safety property that makes this acceptable is narrow and worth stating
plainly: a token minted this way is accepted only by an API deliberately
configured to trust that keypair, which means a local one. Against
`product-dev.microport.com` the key does not match and every request gets a 401.
Nothing runs in the server process, and no route is added.

ProductPort keeps both paths. `auth.setup.ts` continues to drive the hub form
for the deployed mesh. A new `capture.setup.ts` mints, and only the capture
config's setup project points at it.

## User stories

1. As a help author, I want to record a clip of the catalog filters, so that a reader can see the interaction instead of reading a description of it.
2. As a help author, I want the capture harness to authenticate without a hub, so that I can produce media on my own machine with no dependency on a running IdP.
3. As a help author, I want the capture to run as the role the article is written for, so that the reader sees the screen their own permissions would show them.
4. As a help author, I want capture failures to name the reason, so that a broken run does not present as an unrelated redirect loop three layers away.
5. As a help author, I want the harness to refuse to save a signed-out storage state, so that a green setup never hands a broken session to every later spec.
6. As a developer new to the repo, I want a single documented command to generate the local keypair, so that I do not have to reconstruct the crypto invocation from prose.
7. As a developer, I want the required environment variables named in the error when they are missing, so that a first run tells me what to set rather than failing on a signature.
8. As a developer, I want a mismatched keypair caught at mint time, so that the failure says the keys disagree instead of surfacing as a 401 from the API.
9. As a developer, I want the mint's duplicated literals pinned against the API's own exports by a test, so that a cookie rename or an audience change breaks a test rather than the harness.
10. As a developer, I want the minted claim set validated against the shared `SsoClaims` schema in a test, so that claim drift is caught in CI and not during a capture session.
11. As a developer, I want the minted token to authenticate through the real `requireAuth` in a test, so that the proof covers the actual verify pipeline and not a mock of it.
12. As a developer, I want to run the deployed-mesh suite unchanged, so that adding the mint costs nothing to the existing SSO coverage.
13. As a developer running against the deployed dev mesh, I want the mint path to be unreachable there, so that no capture credential can be pointed at a real environment by accident.
14. As a reviewer, I want the reason the mint exists written in the file, so that a reader who finds a JWT signer in a spoke repo can tell in thirty seconds whether it is a backdoor.
15. As a reviewer, I want the private key kept out of the repository and out of the Docker build context, so that the harness cannot leak into an image.
16. As a security reviewer, I want the mint to be incapable of producing a token any deployed API accepts, so that its blast radius is one developer's machine.
17. As a security reviewer, I want no new server route and no code path in the running application, so that the production attack surface is unchanged.
18. As a reader of a translated article, I want the clip's play and pause controls in my own language, so that a Chinese or French page does not show an English button. (Shipped ahead of this spec: `98a28e3`.)
19. As a reader, I want clips served from the app's own origin, so that help media works in an environment with no external network access.
20. As a maintainer, I want the media integrity checks to run as a named script, so that a bad path or an oversized clip fails a command rather than a review.
21. As a maintainer, I want the capture database documented per repo, so that the next person can recreate the environment without reverse-engineering a container.
22. As a maintainer, I want the seeded capture data to be safe to show, so that a published clip never exposes a real person's record.
23. As a maintainer of a different satellite, I want ProductPort's harness to be a faithful copy of FinPort's, so that extracting a shared package later is a mechanical job rather than a reconciliation.
24. As a maintainer, I want the shared-package extraction deferred until a second real consumer exists, so that the interface is designed against two use sites instead of one guess.
25. As a fleet operator, I want the hub and spoke boundary preserved, so that no spoke repo contains anything that reaches for the IdP's signing key.

## Implementation decisions

### Mint the session; do not drive a login form

ProductPort has no local login surface and its local hub seed does not contain
the account `auth.setup.ts` expects. The alternatives were to seed a matching hub
user, to add a dev-only login route, or to mint. Seeding the hub makes the
capture depend on a second running application. A dev-only route puts a code path
in the server. Minting puts a script outside the server that only a
locally-configured API will trust.

### Port FinPort's implementation rather than write a new one

FinPort's mint already resolved the questions this one faces: it signs with
`node:crypto` because `web/` has no `jsonwebtoken` dependency, it omits `jti` on
purpose so the token takes the stateless verification path, and it verifies its
own signature before returning so a mismatched pair fails with a readable message.
ProductPort's `requireAuth` verifies and then JIT-upserts the user with no
server-side session lookup, so the same stateless reasoning holds.

Differences from FinPort are limited to constants: the audience is
`['productport', 'microport-apps']`, the cookie is ProductPort's own from
`src/lib/cookies.js`, the app key in `app_roles` is `productport`, and the roles
come from ProductPort's map, where `admin` is the capture principal and the
`ROLES` list in the capture config is `['admin']`.

### An earlier recommendation, withdrawn

The first proposal was to call HubPort's real signer with HubPort's dev keys, on
the grounds that borrowing the issuer's own code makes claim drift impossible.
That was withdrawn. It weighted claim-shape fidelity above key exposure, and the
two are not comparable: drift breaks a test you notice, key exposure is a failure
you do not. It would also have put a script reaching for the IdP's private key
into a spoke repo, and it would have minted tokens a real ProductPort accepts.
The throwaway keypair is the whole point.

### The two auth paths do not collide

The local `.env` has no `SALESPORT_JWT_PUBLIC_KEY` and no `SALESPORT_JWT_ISSUER`
today, so the capture keypair takes an empty slot rather than displacing a hub
key. The deployed mesh carries the hub's key and never sees the capture pair.
The verifier does support an `additionalKeys` list, currently holding an empty
`SALESPORT_JWT_PUBLIC_KEY_B` reserved for a hub key rotation, so a machine that
ever needs to trust both keys at once has a slot for it. That is a fallback,
not part of this work.

### Separate setup files, not one file that branches

`auth.setup.ts` keeps driving the hub form for the deployed mesh. A new
`e2e/capture.setup.ts` mints. Only the capture config's setup project is
repointed. A single file branching on `BASE_URL` was considered and rejected:
the two flows share no steps, and a conditional would make each one harder to
read than either is alone.

### The setup proves the session before it writes anything

Two checks, in this order, both taken from FinPort:

1. The API answers 200 for the minted identity when given the cookie directly.
2. A browser holding the cookie lands on the app's own origin, off `/login`, with
   the root layout's own auth probe answering 200.

Origin, not hostname. Locally the app and the hub are both `localhost` and differ
only by port, so a hostname check proves nothing. The storage state is written
only after both pass. OpsPort learned the cost of the other order: a state
snapshotted from a session that does not authenticate fails every later spec as a
redirect loop that never names setup as the culprit.

### Keys live only in the local environment

Both halves are base64-encoded PEMs in the gitignored `.env`. The generation
command is documented in the mint's own header so nobody reconstructs it. The
keypair is long-lived and generated by hand, matching FinPort. Generating a fresh
pair per run was considered and rejected: it would require writing the public half
into the API's environment and restarting it as part of every capture, which
turns a one-time setup into a per-run one.

### Media integrity checks travel with the media

OpsPort's `help-media-audit.js` already enforces the rules that matter: media
paths must be same-origin under `/help-media/`, never a CDN, and clips and stills
must stay under their size gates. It gets copied alongside the media and wired as
an `npm run help:media:audit` script. ProductPort currently has `help:audit` and
`help:media` and no audit for media.

### Fictional seed data is required only where a screen shows people

A capture publishes whatever is on screen. The rule: a satellite must seed
fictional data when its captured screens show person-level records. ProductPort
is exempt, verified: the catalog carries products, clearances and trials, with no
person columns. EngagePort is bound by this rule, because its capture spec invents
the physician it creates while the list behind the form shows whatever is seeded.

### Capture database setup is documented, not shared

Each repo's `tools/help-media/README.md` documents its own throwaway database. A
shared compose file was considered and rejected: the databases differ per app and
a shared file would need per-app overrides that cost more than the duplication.

## Testing decisions

A good test here exercises the boundary a real caller crosses. For the mint that
means the API's actual verify pipeline, not a re-implementation of it, and not a
mock standing in for the subject.

**One seam, and it already exists.** ProductPort's `tests/` directory runs jest
with supertest against real Express middleware. FinPort's
`tests/e2e-mint-session.test.js` is the exact prior art: it mounts the real
`requireAuth` on a bare Express app, generates a keypair in the test, points the
API's environment at it, and drives the real mint module. Only the database and
the logger are mocked, because they are ProductPort's collaborators rather than
the thing under test.

Choosing this seam over the alternatives is deliberate. Unit-testing the mint's
JWT encoding would prove that base64url works. Testing through Playwright would
prove the mint only as a side effect of a capture run, slowly, and only on a
machine with the environment already set up. The API seam is the highest point
where the mint's real consumer sits.

What the ported test pins:

- The literals the mint duplicates still equal the API's exports. The mint
  duplicates the cookie name and audience as string literals rather than
  importing them, because those API modules pull in the auth library and the TTL
  module for one string each. The test is what stops that duplication from
  drifting silently.
- The hand-rolled token verifies with `jsonwebtoken`, the library the API
  actually verifies with, since the mint hand-rolls the encoding with
  `node:crypto`.
- The claim set passes `SsoClaims`. ProductPort runs that schema in enforce mode,
  so drift is a 401 rather than a warning.
- No `jti`, so the token takes the stateless path.
- The cookie authenticates through `requireAuth` end to end, and the user row is
  JIT-upserted from the claims.
- A private key that does not match the configured public key is caught by the
  mint's self-check, naming the mismatch.
- A missing private key or issuer fails with the variable's name in the message.

The Playwright setup file is not separately unit tested. Its two proofs are
assertions that run on every capture, which is the right place for them: they
check a live session against a live app, which is not something a unit test can
stand in for.

## Out of scope

- **Extracting `@matthewdbaldwin/microport-e2e`.** Agreed as the destination and
  the name, deferred until FinPort migrates onto it, so the interface is designed
  against two real consumers rather than one. Its publishing and versioning
  conventions are deliberately unanswered until then.
- **Hoisting `help-media-audit.js` into that package.** It travels as a copy for
  now, on the same reasoning.
- **The other duplicated capture helpers.** `clip.ts`, `cursor.ts` and `paths.ts`
  are duplicated across four repos. Real duplication, separate job; the package's
  first scope is session auth only.
- **EngagePort's fictional seed.** Bound by the rule above and needs its own
  design. Nothing here unblocks it and nothing here should pre-empt it.
- **`@matthewdbaldwin/microport-auth` as the shared home.** Rejected on evidence:
  it is a production dependency in every app and `Dockerfile:14` prunes only
  devDependencies, so a mint placed there ships in every production image.
- **Producing the articles themselves.** This spec ends at a working capture
  session. Which clips get recorded and what they show is content work.
- **Anything touching the deployed mesh.** No environment variable changes, no
  deploys, no changes to `auth.setup.ts`'s existing behaviour.

## Further notes

The environment is already staged on the devbox: `productport-helpmedia-pg` on
127.0.0.1:5434 with the full catalog seeded, ffmpeg 7.0.2 under
`tools/help-media`, and a gitignored `.env`. Two sibling containers are running
for other work and must not be disturbed.

The play and pause label fix shipped ahead of this spec in `98a28e3`, with
OpsPort's matching defect fixed in `325f298`. OpsPort's was live: three clips
were showing English controls to Chinese and French readers, because the shared
component falls back to English defaults when a label is absent and
`Partial<HelpViewStrings>` makes the omission typecheck. ProductPort's was
pre-emptive, so its first clip arrives already translated.

Worth recording about how this design was reached: the two loose ends that mattered
most were both found by reading the fleet rather than by reasoning about it.
FinPort had already solved the spoke case correctly, and OpsPort's media audit
already enforced the same-origin rule that was about to be re-derived from
scratch. The design's main contribution was noticing that.
