# 03: A reader opens the help library and plays ProductPort's first clip

**What to build:** A reader opens the help library inside ProductPort, finds an entry, and watches a clip that shows the product doing the thing the entry describes. ProductPort ships no help media at all today. This ticket produces the first one and, just as importantly, makes it reachable.

The slice deliberately does not stop at a file on disk. A clip nobody can reach from the help library is a horizontal slice that ends at the media layer and demos nothing. The end-to-end behaviour is a reader watching it in the running app, so the help entry that references the clip belongs in this ticket.

Watch the dangling-key trap. An unresolved help key hides the help button silently: the reader sees nothing and nothing errors. That is why the help audit passing is acceptance criteria here rather than a nicety.

Scope is one entry, the one that proves the loop closes. Authoring the rest of the help corpus is separate work.

**Blocked by:** 02 (Capture specs authenticate with no hub reachable).

**Status:** ready-for-agent

- [ ] A capture spec runs against the staged capture database and produces a clip of a real ProductPort screen
- [ ] The clip and its poster are transcoded with the repo's vendored ffmpeg
- [ ] Media is served from same-origin help media paths, never a CDN
- [ ] The clip is at most 1,500,000 bytes and at most 25 seconds
- [ ] The poster or still is at most 200,000 bytes
- [ ] A help entry references the clip so it renders in the help library
- [ ] The help audit is green, confirming the help key resolves and the button is actually visible
- [ ] Opening the help library in the running app shows the entry and the clip plays
- [ ] No fictional person data is introduced: ProductPort's captured screens show catalog data, so the question does not arise here and should not be pre-empted for apps where it does
- [ ] The capture database used is documented well enough for someone else to stage the same environment
