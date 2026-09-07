# 02: Capture specs authenticate with no hub reachable

**What to build:** A help author can run ProductPort's capture specs on a machine where no HubPort IdP is reachable. Today the capture specs have never run: the existing setup drives the hub's login form, and the local hub seed holds no user matching what that setup expects. This ticket gives the capture harness its own setup that mints a session directly.

ProductPort keeps both authentication paths. The hub-login setup stays exactly as it is and the main Playwright config keeps using it; only the help-capture config points at the new one. The two paths never collide because they live in different environments: the deployed mesh carries the hub key and never sees the capture pair, and the local environment currently has no hub key configured at all.

The two proofs before writing state are the point of the ticket, not ceremony. OpsPort learned why: storage state snapshotted from a session that does not actually authenticate fails every later spec as a redirect loop that never names setup as the culprit.

**Blocked by:** 01 (Mint a ProductPort session the API accepts).

**Status:** done

**Done:** 2026-09-07. `web/e2e/capture.setup.ts` added, mints via ticket 01's helper, proves both the API and the browser accept the session before writing storage state, writes to the same `./e2e/.auth/admin.json` path the capture config's role project already reads. Repointed only `playwright.help-capture.config.ts`'s setup project. `e2e/auth.setup.ts` untouched. Also narrowed `playwright.config.ts`'s own setup-project regex from `/.*\.setup\.ts/` to `/auth\.setup\.ts/`: the wildcard would otherwise have swept the new capture-only setup into the main suite too, and thrown there (no local keypair in that context), breaking every authenticated main-suite run. Verified end to end against the running local API and dev server: setup goes green with no hub reachable; a negative run (API down) fails loudly with no storage state written; `catalog-browse.admin.capture.ts` then runs starting from an authenticated session and produces a clip. Full suite still 54/54, 502/502.

- [x] A capture-only setup mints a session and writes Playwright storage state for the capture role
- [x] Before writing anything, the setup proves the API accepts the session: the identity endpoint answers 200 for the minted identity
- [x] Before writing anything, the setup proves the browser accepts it too: a browser holding the cookie lands on the base URL and the app's identity probe answers 200 with no bounce to login
- [x] The browser check compares origin, not host, because locally every app is on localhost and they differ only by port
- [x] When either proof fails, the setup fails loudly and writes no storage state
- [x] Only the help-capture Playwright config's setup project points at the new setup
- [x] The existing hub-login setup file is unchanged and the main config still uses it
- [x] The capture config's setup project goes green on a machine with no hub reachable
- [x] A capture spec depending on that setup starts in an authenticated session rather than on the login screen
