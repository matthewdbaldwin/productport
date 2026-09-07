# 04: Wire the help media audit

**What to build:** A maintainer can check ProductPort's help media in one command and find out whether any of it has drifted outside the pipeline's limits. ProductPort has a help audit and a help media build script but no audit for the media itself, so the size and duration gates are only ever enforced at production time and nothing re-checks them afterwards.

Port OpsPort's help media audit rather than writing a new one, so the fleet keeps one definition of what a valid clip is.

This ticket blocks on 03 on purpose. The script could land earlier, but with no help media in the repo it could only prove that it reports an empty set. Landing it after the first clip exists means it ships verified against real media instead of ships early and quietly untested.

Hoisting this script into a shared package is explicitly out of scope. It travels as a copy for now.

**Blocked by:** 03 (A reader opens the help library and plays ProductPort's first clip).

**Status:** done

**Done:** 2026-09-07. `tools/help-media/help-media-audit.js` ported from OpsPort's script of the same name — wiring checks 1-6 unchanged (same-origin src, src/poster exist, non-empty alt, poster required for clips, locale-twin parity, orphan warning). One deliberate divergence, stated in the script's own header: a 7th check re-applies build.js's own size/duration gates against the files actually on disk, importing the three limit constants (plus its duration-reading helper) from build.js rather than retyping them, so the two cannot disagree. Lives in tools/help-media/ (not scripts/) so ffmpeg-static's ~75MB binary stays out of root's dependencies and the production Docker image, matching build.js's own placement and its README's stated reasoning. Wired as `help:media:audit` in package.json, alongside the existing `help:audit`/`help:media`. Verified green against ticket 03's real media (0/0/0), verified it actually catches a manufactured oversized clip (blocker, exit 1) and an orphaned file (warning, exit 0) before restoring the real asset from git. Full suite still green: 54/54 jest, lint and help:audit clean.

- [x] A help media audit script is present and wired as an npm script, named consistently with the existing help audit and help media scripts
- [x] Running it reports on ProductPort's real help media and passes
- [x] It enforces the same size and duration limits the production pipeline applies, so the two cannot disagree
- [x] Its behaviour matches OpsPort's audit, and any deliberate divergence is stated in the script's header with the reason
- [x] The script is a copy by design; the header says so, so a future reader does not mistake the duplication for an oversight
