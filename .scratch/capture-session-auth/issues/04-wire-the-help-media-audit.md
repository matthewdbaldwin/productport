# 04: Wire the help media audit

**What to build:** A maintainer can check ProductPort's help media in one command and find out whether any of it has drifted outside the pipeline's limits. ProductPort has a help audit and a help media build script but no audit for the media itself, so the size and duration gates are only ever enforced at production time and nothing re-checks them afterwards.

Port OpsPort's help media audit rather than writing a new one, so the fleet keeps one definition of what a valid clip is.

This ticket blocks on 03 on purpose. The script could land earlier, but with no help media in the repo it could only prove that it reports an empty set. Landing it after the first clip exists means it ships verified against real media instead of ships early and quietly untested.

Hoisting this script into a shared package is explicitly out of scope. It travels as a copy for now.

**Blocked by:** 03 (A reader opens the help library and plays ProductPort's first clip).

**Status:** ready-for-agent

- [ ] A help media audit script is present and wired as an npm script, named consistently with the existing help audit and help media scripts
- [ ] Running it reports on ProductPort's real help media and passes
- [ ] It enforces the same size and duration limits the production pipeline applies, so the two cannot disagree
- [ ] Its behaviour matches OpsPort's audit, and any deliberate divergence is stated in the script's header with the reason
- [ ] The script is a copy by design; the header says so, so a future reader does not mistake the duplication for an oversight
