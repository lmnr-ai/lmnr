# Animation 14 - Issue clusters

## Current authoring revision (supersedes earlier timeline plans)

- [x] Reproduce the hidden cover delay using saved 10.8s merge values, without resetting storage.
- [x] Remove all three global merge tracks; use one Warning Cover Duration dial with formation-triggered onset.
- [x] Reject same-group swaps and forward re-formation after breakup, so the first complete reverse square stays complete. Reproduce and fix the seed-5 transient-square regression.
- [x] Add the Appearance track with seeded random per-cell dot-out/triangle-in transitions that finish within the segment.
- [x] Apply the user's authored defaults: Appearance at 0 for 1.01s; Swapping at 1.11 for 2.3s.
- [x] Preserve DialKit and add the exact requested production handoff comment above its timeline hook.
- [x] Add separate Animation 15 — ISSUE CLUSTERS 2 with frozen starts, direct triangle paths, and stationary ground dots.
- [x] Put the animation selector in numerical order.

Current behavior and validation commands are documented in `README.md` and `../micro-15/README.md`. Earlier sections below preserve the implementation history, not current timing semantics.

## Per-cluster completion revision (earlier user follow-up)

- [x] Reject gray-dot/gray-dot proposals before reserving either swap endpoint.
- [x] Record each cluster's earliest permanently settled reverse step from its actual swap history.
- [x] Convert the final arrival into a timestamp that excludes the trailing swap gap.
- [x] Give every cluster its own shrink/fade/grow state; permit completion while other clusters still gather.
- [x] Retain timeline merge tracks as shared per-cluster templates: their positive offset after Swapping is post-settlement delay, with independently editable durations.
- [x] Prevent merging before readiness and verify that merged groups never move again.
- [x] Cover no-dot-dot swaps across seeds, zero movement, per-cluster endpoints, overlapping gathering/merging, independent templates, and deterministic rewind.
- [x] Browser check: small groups fully merged at 5.5s while medium/large groups continue gathering.

## Timing revision (user follow-up)

The original one-step-per-authored-frame timing below is superseded by the user's request for independent timing and staggered gathering:

- [x] Expose independently editable Swapping, Small Warning Shrink, Cluster Background Fade, and Large Warning Grow timeline clips.
- [x] Distribute N recorded simulation steps evenly over the Swapping segment, independent of fps. Preserve disjoint swaps per simulation step.
- [x] Expose Swap Gap as the hold fraction of each equal step slot, with movement first and no hold at zero.
- [x] Expose Small Cluster Delay: lock 2×2 groups for the selected fraction of forward steps, 3×3 for half that fraction, and 4×4 for none. Protect both swap endpoints.
- [x] Use the same pure sampling/timing contract in the editor, exact-time inspection, and Remotion. Add Timeline Duration for the overall length and final hold.
- [x] Add tests for retiming, gap endpoints, exact recorded boundaries, delayed identities, earlier settlement, cache keys, and independent merge clips.
- [x] Exercise timeline resize/move and reload persistence in the live browser.

The original geometry, stable identity, exact reversal, local asset, and isolation requirements still apply. Retiming a segment shorter than N/fps can cross several simulation steps in a rendered frame; the previous render-frame movement bound no longer defines elapsed time.

## Goal and ownership

Create a new animation, `micro-14`, named **Animation 14 - Issue clusters**. Do not change any existing animation. Another agent is actively working in this checkout, including `introducing-flow-1` and shared registration files. Implementation happens in a separate temporary worktree seeded with the current `poc` source. The parent alone integrates the completed new files and minimal additive registrations into the live checkout, rereading shared files first. No commits, resets, stashes, server restarts, dependency upgrades, or edits to other animations.

Editor destination: `http://localhost:5180/?experiment=micro-14`.

## Reference frames

- Intermediate: https://www.figma.com/design/VEbMxK1qMXzqjAVJaSQMPs/Laminar-personal?node-id=4763-6297
- End: https://www.figma.com/design/VEbMxK1qMXzqjAVJaSQMPs/Laminar-personal?node-id=4763-5274
- Both reference frames are 1280 × 720 with background `#1a1a1a`.
- The grid is 18 columns × 12 rows, 78px cells, positioned at (-62, -71), total 1404 × 936. Preserve intentional clipping by the 1280 × 720 viewport; do not fit the entire oversized grid inside it.
- Grid borders `#333`, bottom and left, 1px. Dots `#4e4e4e`, 12px diameter. Small warning asset layout 25.418 × 23.604px. Use exact exported assets and metadata positions, not generic warning emoji/icons.
- End frame has six large backgrounds `#1f1f1f`, bottom/left `#333` borders, and large warning SVGs. Rectangles (x,y,width,height): (328,475,312,312), (94,241,234,234), (1108,163,234,234), (952,397,156,156), (328,85,156,156), (640,319,156,156). Some are intentionally cropped.
- Corresponding grid blocks, zero-based (column,row,size): (5,7,4), (2,4,3), (15,3,3), (13,6,2), (5,2,2), (9,5,2).
- Read the complete captured Figma design context and metadata before coding. Derive the small triangle identities/colors from the actual intermediate frame. Retain any singleton warning outside the six blocks as in the end frame rather than inventing a seventh cluster. Explain this reference exception in README.

## Sequence

1. Hold a seeded, dispersed field of warning triangles and dots.
2. Replay the generated dispersion history backward, moving neighboring occupants one grid unit at most per frame, until the intermediate arrangement is recovered exactly.
3. Briefly hold the exact intermediate frame.
4. Scale grouped small warnings from 1 to exactly 0 about their own centers. Fade the six larger square backgrounds from 0 to 1; scale their large replacement warnings from exactly 0 to 1 about each block center. Keep grid/background and unaffected occupants stable. No translation shortcut or teleport into a cluster.
5. Hold the exact end frame. A loop may reset at its boundary, but do not insert a visible forward-dispersion intro contrary to the requested sequence.

## Deterministic dispersion model

Create a small pure module, separate from React/DialKit:

- One stable token ID per grid cell, including dots. Token kind/color/cluster identity travels with that token, not with its current location.
- Start from the complete intermediate permutation `S0`.
- Seed a local documented PRNG from an integer dial value; no `Math.random`, timestamps, global mutable random state, or render-order dependence.
- For each dispersion step, create a fresh unused-cell mask. Shuffle cell visitation using the seeded PRNG. For each unused cell, probabilistically propose one of its valid eight neighboring cells. Reject out-of-bounds neighbors (no wrap). Swap only if both endpoints are unused, then mark both used immediately.
- Each frame's swaps form a matching: disjoint pairs of adjacent cells. Apply each batch simultaneously (or equivalently sequentially because endpoints are disjoint). A failed/no-op proposal leaves tokens in place. Do not repeatedly retry until every cell moves.
- Save immutable frame states and/or disjoint swap batches: `S0 ... SN`. Reverse playback uses precisely `SN ... S0`; it does NOT generate a second random walk or re-sort tokens.
- Define one unit as Chebyshev grid distance: max(abs(deltaColumn), abs(deltaRow)) <= 1. Diagonal motion is permitted. Every identity, including visually identical dots, participates at most once per simulation frame. Merely checking displacement is insufficient: tests must also prove batch endpoint uniqueness.
- Bound memory with a sensible maximum step count and cache history by seed, step count, and probability. Avoid rebuilding the whole history on each render or retaining an unbounded cache of slider values.

## Timing and controls

- Expose integer `seed` and `dispersionFrames` dials under an animation-specific persisted DialKit ID. `dispersionFrames` is the number of forward generation steps AND the equal number of inverse playback steps. One shared dial is intentional: unequal counts would not be exact inversion. Label/document this clearly.
- Use a fixed authored fps (prefer existing project conventions) and one simulation step per authored output frame; N steps take N/fps seconds. Do not squeeze N steps into a shorter arbitrary timeline duration, or a rendered frame could jump multiple cells. Holds/merge durations can have their own controls/timeline clips.
- An optional `swapProbability` dial is useful (0..1), with a sensible default, and explicit endpoint tests.
- Timeline/DialKit duration follows the frame-count dial. Any editable gathering duration must not speed playback beyond one step per frame. Best keep gathering duration derived from N rather than introduce competing timing authorities.
- Seed/frame-count changes rebuild from the pristine intermediate arrangement. They must immediately affect preview without stale persisted timeline durations, history, or hooks.
- Provide exact-time/frame inspection suitable for browser verification, following existing `?time=` conventions. Arbitrary scrubbing, reload, reverse seeking, and Remotion must sample the same state.
- Rendering at fractional time may interpolate only between adjacent recorded states without overshoot; output frame sampling must preserve the one-cell limit. No CSS autonomous transitions or spring overshoot on token position.

## Implementation seams

Use `poc/src/experiments/micro-11` / `micro-12` as examples, not files to modify. Suggested new files:

- `micro-14/geometry.ts` (reference grid and cluster layout)
- `micro-14/dispersion.ts` (PRNG, swap history, reverse sampling)
- `micro-14/sample.ts` and `timeline.ts` (pure frame/time sampling and phase timings)
- `micro-14/Scene.tsx` (grid, persistent token rendering, merged cluster layers)
- `micro-14/App.tsx` and scoped `styles.css` (DialKit editor)
- focused `*.test.ts`, README, local Figma reference manifest
- assets only under `poc/public/micro-14/`
- `poc/src/video/MicroAnimation14.tsx` (same sampler, deterministic Remotion composition)

Minimal additive registration only in `ExperimentPicker.tsx`, `tune/main.tsx`, `video/Root.tsx`, `video/styles-entry.ts`. Keep other agents' content intact. Reuse existing dependencies and test style. Do not leave runtime references to Figma's temporary localhost asset server. Read native SVG dimensions and preserve each asset's aspect ratio and intended design bounds.

## Verification checklist (required before acceptance)

### Algorithm tests

- Same seed/settings produce deep-equal states and swap batches across separate calls; different representative seeds produce different nonzero-dispersion histories.
- Every state is a permutation of all 216 stable token IDs, exactly one occupant per cell, preserving kinds, colors, and cluster counts.
- Every swap is a distinct-cell, in-bounds 8-neighbor pair. Every batch has unique endpoints, so a token cannot swap twice, even if it might otherwise return to its original cell.
- For each token and every adjacent generated state, Chebyshev displacement <= 1; repeat for every reverse-playback frame.
- Reversing batches/frames reconstructs the complete original state exactly, including dots, not just the final triangle silhouette.
- Boundary cells never wrap. Test 0, 1, default, and maximum supported dispersion steps; zero probability causes no swaps, probability one still honors the mask. Include several seeds and all eight directions across the suite.
- Cached sampling is immutable and independent of call order. Sample end, start, arbitrary middle, and repeated frames and compare against sequential playback.

### Timing and rendering tests

- N generation transitions map to exactly N inverse authored-frame transitions. Test first/last gathering frames and phase-boundary off-by-one behavior.
- Changing seed alters the start/path but not the final intermediate layout or merged end geometry. Changing N changes both the generated start and gathering duration without skipping recorded steps.
- Before merge: small scales 1, background opacity 0, large scales 0. After merge: small grouped scales exactly 0, backgrounds 1, large scales exactly 1. Values bounded throughout; centers stable.
- Intermediate/end geometry matches captured Figma metadata, including colors, crop, singleton warning, six cluster sizes, and actual local asset dimensions.
- Editor and Remotion use the same pure sampler at matching authored frames and settings; all render controls have a documented export path/defaults.

### Integration checks

- Run focused tests, TypeScript checking, and a production Vite build using installed dependencies. Distinguish pre-existing unrelated failures from new failures; do not repair the other agent's work.
- After live integration, use installed `agent-browser` with Chrome (no Playwright downloads) against port 5180. Select Animation 14, play/pause/scrub, change seed and frame count, reload to verify persistence, and inspect start/intermediate/merge/end. Check browser errors and asset loads.
- Save start/intermediate/end screenshots as verification evidence, plus a short rendered video if practical. Do not claim visual screenshot inspection if the model cannot view images; use measured browser geometry and explicitly disclose that limit.
- Verify another existing animation and the other agent's animation remain registered. Inspect the final diff for only new Animation 14 files and minimal additive registration lines. Do not commit or push.

## Deliverable

A completed editor animation and renderable composition, reproducible algorithm tests, documented dial semantics/defaults, and a concise implementation report with exact commands/outcomes, URLs, files, and any remaining limitations. The parent reviews and integrates before declaring completion.
