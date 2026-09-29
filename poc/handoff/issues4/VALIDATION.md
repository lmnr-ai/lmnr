# Animation22 publication validation

Publication base: `9e5e09ccb4b05a5600630f91f827d499b18993b9` on `sandbox/signals-launch-video`, fetched with `git pull --ff-only` in `lmnr` before transfer.

## Passed on the merged checkout

- `pnpm typecheck`.
- `pnpm exec tsx --test src/experiments/micro-22/*.test.ts src/experiments/micro-20/*.test.ts src/experiments/micro-18/*.test.ts src/experiments/micro-15/*.test.ts src/experiments/introducing-flow-1-2/*.test.ts src/experiments/micro-18/score/handoff-merge.test.ts`: **210/210**.
- Code-only Vite production build with `publicDir:false` and output under a unique temporary directory; no media copying/rendering. Existing large-chunk warning remains.
- `git diff --check`.
- Latest recording copied byte-for-byte; SHA-256 and ffprobe metadata recorded in `recording.json`.
- Transfer applies only local changes since the pre-Animation22 snapshot, using a three-way merge against current upstream. No conflicts. Upstream score/style files, previous recordings, frozen audio, phrase schedule and other unrelated changes were not overwritten. The source checkout was not committed or modified by publication.

## Additional score tests and limitations

An expanded run including `score/typing-sync.test.ts` passed213/214. The failing test is `blocked source20 emits no postlude foley, duck, typing, pops or cluster cues` at `score/typing-sync.test.ts:51`, specifically its acoustic composition note-list assertion. The **same assertion fails on an isolated archive of untouched upstream9e5e09ccb** (3/4 tests pass there). This pre-existing upstream score issue was not changed as part of the animation transfer.

A broader `score/*.test.ts` run exceeded a240-second timeout; it is not claimed to pass. No new soundtrack or video was rendered, and no subjective listening or image review was performed.

The original local animation work additionally passed206 tests and isolated Chrome DOM/state checks for live authored progress, shared-world continuity, reverse seeks, full preset save/load/clear and postlude ripple. An independent read-only review found no remaining code issues.530 historical source20 frames matched the pre-task snapshot. These browser checks were on the source preview, not a newly started publication server.

The attached76.928-second take is available for the next agent to transcribe and align. Existing playback still uses the previous recording and frozen bed; do not treat this publication as an audio-aligned final render.
