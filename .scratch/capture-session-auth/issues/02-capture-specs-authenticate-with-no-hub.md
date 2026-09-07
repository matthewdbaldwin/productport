# 02: Capture specs authenticate with no hub reachable

**What to build:** A help author can run ProductPort's capture specs on a machine where no HubPort IdP is reachable. Today the capture specs have never run: the existing setup drives the hub's login form, and the local hub seed holds no user matching what that setup expects. This ticket gives the capture harness its own setup that mints a session directly.

ProductPort keeps both authentication paths. The hub-login setup stays exactly as it is and the main Playwright config keeps using it; only the help-capture config points at the new one. The two paths never collide because they live in different environments: the deployed mesh carries the hub key and never sees the capture pair, and the local environment currently has no hub key configured at all.

The two proofs before writing state are the point of the ticket, not ceremony. OpsPort learned why: storage state snapshotted from a session that does not actually authenticate fails every later spec as a redirect loop that never names setup as the culprit.

**Blocked by:** 01 (Mint a ProductPort session the API accepts).

**Status:** ready-for-agent

- [ ] A capture-only setup mints a session and writes Playwright storage state for the capture role
- [ ] Before writing anything, the setup proves the API accepts the session: the identity endpoint answers 200 for the minted identity
- [ ] Before writing anything, the setup proves the browser accepts it too: a browser holding the cookie lands on the base URL and the app's identity probe answers 200 with no bounce to login
- [ ] The browser check compares origin, not host, because locally every app is on localhost and they differ only by port
- [ ] When either proof fails, the setup fails loudly and writes no storage state
- [ ] Only the help-capture Playwright config's setup project points at the new setup
- [ ] The existing hub-login setup file is unchanged and the main config still uses it
- [ ] The capture config's setup project goes green on a machine with no hub reachable
- [ ] A capture spec depending on that setup starts in an authenticated session rather than on the login screen
