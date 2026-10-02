# Animation 20 rebuild — parent verification

## Changes verified

- Persistent SVG world replaces hard Bash-to-analysis scene swap.
- Source16-like full report, original geometry and visible late highlights replace blank descent.
- Source17 camera/content scaling carries trace, grid and blue agent through the pullback.
- Actual cell98 centers under the agent; complete layout moves into source15 coordinates after agent exit.
- Spinner phase remains continuous; agent scales about its local origin.
- Warning discovery uses actual rendered distance and visible circle radius, including partial-zoom authoring.
- Complete source15 postlude reused; one authoring transport, dependency-aware timing and full serialized transitions.
- Version-pinned Micro20 compatibility adapter preserves independent base/preset transition values and modes with immutable Reset defaults. Parent read adapter and actual-store regression tests.
- Parent corrected exact picker spacing: `micro-18` is `Animation 19 - Ultimate 3`; Silk remains distinct. Restored required production TODO above useDialTimeline.

## Parent-executed checks

1. `cd poc && pnpm exec tsx --test src/experiments/micro-20/*.test.ts src/experiments/micro-15/sample.test.ts src/experiments/micro-16/sample.test.ts src/experiments/micro-17/sample.test.ts`: **44/44 passed**.
2. `pnpm typecheck`: passed.
3. `pnpm exec vite build`: passed; existing large-chunk warning only.
4. `node artifacts/tmp/micro20-rebuild/parent-browser.cjs`: all animation/browser assertions passed at **16 poses** using the existing localhost5180 server and a dedicated installed-Chrome session. Verified one paused transport, actual agent/cell alignment, no ahead-of-radius warning, persistent world/report DOM identity across zoom, final 12px agent, settled scan hold, source15 entry/end, exact picker labels and no browser errors.
   - Paper boundary delta: **0px**.
   - Spinner boundary delta: **0.00684 degrees** across 20 microseconds; original bug was a 131.75316-degree reset.
   - Raw evidence: `parent-browser.json`.
   - Process initially exited nonzero ONLY after passing/saving assertions, because `agent-browser close` exceeded its 20-second timeout. Explicit retry returned `{closed:true}`. Cleanup timeout in the reusable script is now 60 seconds. This is not reported as a clean initial process exit.
5. `diff -q before/Root.tsx poc/src/video/Root.tsx`: unchanged composition registration.
6. Staged-file list empty; no commits/resets/installs or source-animation edits by parent.

## Evidence and limitations

Worker retained 31-pose browser tests, reference16/17 captures, browser/Remotion pixel parity, actual UI timeline edits, storage/reset/reload checks and 57-test broader suite. These are worker-run evidence, distinct from the parent's narrower independent 44-test run.

Images cannot be viewed by the available model. Source comparisons, CTM geometry, continuity, browser interaction and export-parity evidence support the corrections, but do NOT constitute subjective visual/motion approval. No claim is made that the user's actual browser profile was inspected. The compatibility seam is private and pinned to DialKit 1.4.3; updating the dependency requires revalidation. Insufficient scan radius intentionally yields a documented incomplete finite analysis hold, not invented warnings.

Implementation/automated verification complete. Subjective visual acceptance remains unperformed.
