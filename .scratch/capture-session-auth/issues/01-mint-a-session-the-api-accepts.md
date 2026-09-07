# 01: Mint a ProductPort session the API accepts

**What to build:** A developer on this machine can produce a real ProductPort session token without a HubPort IdP in the loop, and can prove the running API accepts it. ProductPort is an SSO spoke with no login of its own, so nothing in the repo signs a token today. This ticket adds a local-only minting helper that holds the private half of a throwaway keypair whose public half the local API is configured to trust.

This is not a backdoor. Nothing runs in the server process and no route is added. A token minted this way is accepted only by an API deliberately configured to trust this keypair, which means a local one. Against a deployed environment the key does not match and every request 401s.

Prior art to port: FinPort's mint helper and its accompanying middleware test. Design rationale and locators live in the spec at `docs/superpowers/specs/2026-09-07-capture-session-auth-design.md`.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] A helper mints an RS256 session token for ProductPort carrying the claim set the API enforces, including the ProductPort app role and the app's own audience
- [ ] The token omits the session id claim on purpose, so it takes the stateless path rather than failing closed against a session row that does not exist
- [ ] The keypair is generated locally and both halves live only in the gitignored local environment file; neither is committed
- [ ] The helper refuses to mint when the private key or the issuer is missing, and the error names the missing variable
- [ ] The helper verifies its own signature against the configured public key before returning, so a mismatched pair fails with a plain message instead of as a 401 three layers away
- [ ] A test mounts the API's real auth middleware and proves the minted cookie authenticates on the stateless path and just-in-time upserts the user, with no session lookup
- [ ] The test pins the helper's duplicated cookie name and audience literals against the API's own exports, so they cannot drift silently
- [ ] The test proves the token satisfies the shared SSO claims schema, which the API runs in enforce mode
- [ ] The test generates its own keypair rather than depending on local environment state
- [ ] The full test suite is green
- [ ] Running the helper from the command line prints a token that the running local API answers 200 for
