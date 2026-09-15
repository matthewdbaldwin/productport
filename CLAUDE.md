# CLAUDE.md — ProductPort

## Fleet conventions

This repo's commit-message format and contribution conventions are the fleet-wide ones,
hosted centrally — not copied here:

- `microport-infra/docs/COMMIT_CONVENTION.md`
- `microport-infra/docs/CONTRIBUTING.md`

Do not copy that content into this repo. Link to it. A per-repo copy of cross-cutting
policy has no reason to be updated when the source changes, and this fleet has already
hit that exact rot twice (see the platform's own note on this in
`~/dev/.claude/CLAUDE.md`).

ProductPort does not currently have its own root `CHARTER.md` or `SECURITY.md` (those
exist only in the "Gen A" satellites today). If this repo ever adds them, they should
describe ProductPort's own product domain and control posture and stay local — they are
not fleet-wide policy, and should not become copies of another repo's charter/security
doc. See `microport-infra/docs/README.md` for why CHARTER.md/SECURITY.md were kept
per-repo rather than centralized alongside CONTRIBUTING.md/COMMIT_CONVENTION.md.

Decision record: CV-1 in `HANDOFF_fleet_repo_conventions_unification_2026-09-13.md`.
