# Flow21 publication validation

## Corrective cloud-only rollback

The initial handoff's cloud preservation claim was too narrow: the last interpolation attempt had been reverted, but an earlier frame-pinned rewrite remained. This correction restores the chapter-driven cloud rendering from `449f3d67` (last local commit before September 28 midnight), without restoring that commit's other code or timing.

- Three new differential checks failed before the fix and pass afterward: native Ultimate2/Cost cloud poses, Flow's incoming-world cloud attachment, and immunity to saved frame-cloud controls.
- Focused typecheck and 33 tests passed. The broader publication suite then passed **136 tests, zero failures**, plus typecheck, whitespace checks, and a code-only Vite build (`publicDir:false`, `/tmp/midnight-cloud-rollback-build-pallXo`; existing large-chunk warning only).
- Browser verification passed: one canonical Ultimate2/Cost canvas, moving Flow plane, no duplicate native canvas, deterministic reverse seeks, removed frame-cloud controls, and retained narration controls.
- The Animation21 browser suite also passed after rollback: fixed anchors, no graph camera pan, reverse seeking, stagger dial, and original-cut preservation.
- The initial browser script's case-sensitive `vo01` assertion was corrected for DialKit's displayed `Vo01`; no runtime narration change was needed. An obsolete subtitle test that prohibited Flow's cloud plane was updated to verify captions stay above both the world and restored plane.
- Source preservation hashes confirm only cloud runtime/UI, cloud-related regression assertions, and cloud documentation changed. Animation21, shared camera logic, settings, narration/audio, assets, other chapters, and the publication settings snapshot remain unchanged. No local storage was cleared.
- Legacy cloud JSON remains readable/exportable but no longer drives rendering. No media was generated.

## Initial publication integration (historical)

- Fetched `origin/sandbox/signals-launch-video` at `6ba5d926c38281ea8f4d9cd2eafb3b051ab21494`.
- Prepared a separate publication worktree and fast-forwarded the earlier handoff `b46174caa`; the existing project and other worktrees were not switched or reset.
- Applied current local changes relative to the original transfer's source hashes. Recovered source baseline bytes from the earlier handoff or local checkpoint `411aed4b`, verifying their hashes before three-way merging.
- Preserved upstream-only files and score/keyboard features. Resolved two textual conflicts: README descriptions retain both histories; the score registry retains Phase, Tintinnabuli, and Acoustic Chill together. No sound alignment or rendering was performed.

## Checks on the publication tree

- `pnpm typecheck`: passed.
- **135 tests passed, zero failed**, using:
  - `src/experiments/introducing-flow-1-2/*.test.ts`
  - `src/experiments/introducing-flow-1/geometry.test.ts`
  - `src/experiments/introducing-flow-1/opening.test.ts`
  - `src/experiments/micro-18/*.test.ts`
  - `src/experiments/micro-18/score/handoff-merge.test.ts`
  - `scripts/render-ultimate3-score.test.ts`
  - `scripts/cdp-client.test.ts`
- Code-only Vite build with `publicDir:false`: passed, 743 modules, `/tmp/flow21-publish-build-vw65X9`. Existing large-chunk warning only. No public assets were duplicated into a build output or committed there.
- `git diff --check`: passed.
- Browser verification against the existing port5180 preview, whose visual implementation matches the publication tree: passed for stitched source21 layout, x1150/y270 anchor, round axes, gray Sol, no graph pan, axis exit, captions, reverse seeks, live stagger dial, and legacy original-cut preservation. No second preview server was started.

## Independent review and fix

A read-only review found a camera discontinuity with an authored nonzero source21 opening-camera endpoint. Parent independently reproduced it, then made the focused bridge-target fix and added regression coverage for nonzero `cameraZoom`, `cameraToBenchmark`, and `cameraToEngine` opening progress. Those tests pass in the publication suite.

With `cameraZoom.from.progress = .5`, near-arrival and arrival now converge:
- `entryProgress=.999999`: x=-905.0004081, y=-3760.0003795, scale=.8000004.
- `entryProgress=1`: x=-905, y=-3760, scale=.8.

The worker's baseline retained hashes rather than source bytes, so that review was current-file correctness/compatibility review, not an exact worker-only diff. Publication merging separately used hash-verified historical baseline bytes.

## Preservation and limitations

- All 25 newly transferred audio files match the existing local source byte-for-byte. No existing frozen media was rewritten.
- Candidate-file credential-pattern scan found no private-key headers or recognized GitHub/OpenAI/Anthropic/AWS key patterns. This bounded scan is not a security audit.
- Every new candidate file is below GitHub's 100MiB limit. Dependencies, local agent/session state, generated sound-study/Silk output, build output, and rendered video were excluded.
- Original-cut defaults, explicit historical presets, existing narration settings, canceled cloud interpolation, and other chapters remain preserved. New settings snapshot is a new handoff file, not a rewrite of a historical export.
- An exploratory earlier wildcard included Animation13's browser layout test and hit its percentage-layer 1px tolerance (418.9456 versus420). It was not changed, and baseline reproduction did not establish whether the failure predates this task. Its pure geometry/opening tests pass.
- Audio alignment and recorded comparison wording are intentionally pending. No fresh video/audio export, listening approval, or subjective visual approval is claimed.
