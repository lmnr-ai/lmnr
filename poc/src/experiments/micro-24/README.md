# Animation 24 — Introducing Flow-1 3

Animation 21's opening/intelligence and engine ending, with **Animation 23 replacing Graph Spread**. Original Animations 21 and 23 remain independently editable and unchanged in appearance.

- Preview: http://localhost:5180/?experiment=micro-24
- Inspect a fixed time with `&time=4.5`, `&time=8.5`, `&time=9.7`, or `&time=11`.
- Remotion: `MicroAnimation24`, 1280×720, 30fps; default 458 frames (~15.267s).
- **Copy export props** snapshots the actual native timeline and appearance.

## Default sequence

| Time | Action |
|---|---|
| Before 5.15s | Original title/cloud/intelligence scene, including all five peer labels/scores, blue flow-1 ball, and string. |
| 5.15–5.65s | Title folds down inside its stationary mask. Beads, labels, ball and string move left as a group, without an exit fade. |
| 5.77–6.55s | Empty 60px grid zooms to 20px. Stroke transitions from 1px/#333333 to .5px/#1f1f1f. |
| 6.11–8.41s | Shared Animation 23 headline, 38 orange + 718 blue dots, labels and 37/756 cards. |
| 8.90–9.66s | Zoom back into empty space below the content; everything moves above the frame. Restore 60px, 1px/#333333 grid. |
| 9.66–10.05s | Empty-grid bridge. |
| From 10.05s | Camera to Engine, activation, spinner, split-door cover and ending. |

**Only the inserted dense grid is darker/thinner.** Animation 24's original camera zoom and all other sections retain the original grid. No grid-color appearance dial was added to 24. At both renderer boundaries, line placement, pitch, color and width match. The shared Micro23 renderer accepts an optional grid-width override; standalone 23 still defaults to .5px throughout, unchanged.

## Authoring and persistence

One native DialKit timeline owns every motion. Ten prefixed `micro23*` tracks retain the standalone sequence's relative defaults but can be individually edited. `flow3Insert()` forwards actual progress **and starts/durations** to `sampleMicro23Progress()`; there is no nested timeline or hidden animation clock. Live rendering uses `clip.current`, with static inspection and Remotion sharing the same geometry. Keep return completed before Camera to Engine when manually retiming overlapping bars.

The production TODO immediately above `useDialTimeline` remains. The editor measures its dock and reserves at least 6px clearance.

Timeline storage is `micro-animation-24-timeline-v3`; appearance remains `micro-animation-24-appearance-v1`. The load-only migration retains edited surviving tracks and named presets from v1/v2, adjusts timing offsets relative to new defaults, removes obsolete graph controls from the new working schema, and leaves original records byte-for-byte intact. Existing v3 edits win. An automatically created default v2 does not discard custom v1 values. Animation 21 storage is never read or changed.

## Checks

From `poc`:

- `pnpm typecheck`
- `node --import tsx --test src/experiments/micro-23/*.test.ts src/experiments/micro-24/*.test.ts src/experiments/introducing-flow-1-2/*.test.ts src/experiments/zoom-grid-color.test.ts`
- `bash src/experiments/micro-24/baseline.browser.test.sh`
- `bash src/experiments/micro-23/return-grid.browser.test.sh`

The browser test uses the existing editor and isolated installed Chrome. It checks the retained labels/ball, inserted field, empty ending, native timing/from/to edits, dock clearance, and exact empty-grid raster equality at both renderer cuts. Evidence is saved in a unique temporary directory. Numerical checks are not subjective visual approval.
