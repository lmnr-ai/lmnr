# Animation 12 — Ultimate

Open `?experiment=micro-12`. Deterministic defaults preview: `?experiment=micro-12&time=9.5`.
Remotion: `MicroAnimation12`, 1280×720, 30fps, 21 seconds. Render with `--gl=angle` (Animation 9 needs WebGL2).

## Structure

- `timeline.ts`: 17 independent clips; all timings are provisional authoring defaults.
- `sample.ts`: converts either DialKit `clip.current` bindings or deterministic static samples into `Playback`. Both paths call the same scene and geometry.
- `geometry.ts`: pure camera/stream/phase state and bounded block lookup.
- `World.tsx`: one SVG world from first Thinking through final zoom. No scene swap during live streaming.
- `Paper.tsx`: Animation 7's three paper reveals and blue highlight, without its elbow.
- `Subtitles.tsx`: bottom-centered Figma subtitles; each sentence owns one editable timeline bar.
- `Scene.tsx`: bridge to the original `Micro09Scene`; the 2.5-second finale time-compresses `sampleMicro09` while preserving its original defaults.

## Default sequence

| Clip | Start | Duration |
|---|---:|---:|
| agentEnter | 0 | .31 |
| firstThinking | .23 | .7 |
| streamRun | 1.9 | 6.9 |
| cameraCenterAgent | 1.9 | .32 |
| smokeEnter | 1.9 | .26 |
| footballOut | 5.8 | 1.2 |
| footballBack | 7 | 1.2 |
| cameraBacktrack | 8.8 | 1.6 |
| redThinkingLift | 9.3 | .3 |
| readLift | 9.8 | .3 |
| thinkingLift | 10.3 | .3 |
| highlight | 11 | 1.1 |
| warningEnter | 11.25 | .24 |
| warningFocus | 11.95 | .55 |
| finalZoom | 12.5 | 2 |
| streamCollapse / loaderFade / dotDim / smallGridFade | 13.7 | .6 |
| cloudEnter | 15 | 1.4 |
| cloudHold | 16.4 | 2 |
| finale | 18.4 | 2.5 |
| subtitles | .8–18.4 | individually editable; final subtitle ends at 20.9 |

## Critical decisions for review

Likelihood that the author will want to change the choice: 🟢 low, 🟡 medium, 🟠 high, 🔴 known blocker.

- 🟡 **Warning handoff:** the exact Figma warning SVG scales in at the blue lift's top-right. `warningFocus` rebases the whole lifted scene so the warning reaches the standard world/frame origin before final zoom; the grid itself stays at its normal origin. The old agent moves away with that rebase and fades, so the warning—not its circle—owns the center cell. Initial placement defaults to x +180/y −180 and has its own DialKit panel.
- 🟢 **Cloud/grid bridge:** warning rebase lands world/grid origin at screen center, aligning the final 100px lattice with Animation 9's lattice. During the last quarter of cloud entry the old grid still crossfades to Animation 9's exact scene.
- 🟠 **Straight stream's content:** starts with Animation 7's exact first 300px Thinking travel and initial agent entry. Afterwards the camera tracks a continuous, rich repeating straight sequence rather than playing its first Read/second Thinking/first Write STOP clips. Content uses 7's blue/Read/red trio, not 11's exact Write/Thinking/Bash order, so real visited blocks can later lift. One 120px separator completes a 2040px repeat.
- 🟡 **Motion/timing:** provisional 20.9 seconds; `firstThinking` lasts .7 seconds and the remaining edit block is shifted +.8 seconds. Maximum football pullback defaults to 31.75×, adjustable 1–48×. Out/back have a shared zero-velocity apex and no pause. Their bars remain independently editable. Streaming speed defaults to 660px/s, loader 1.9 turns/s, stream seed 209.
- 🟡 **Lift selection:** choose the last completely visited blue/Read/red trio from the frozen run. Changing speed or stream duration can choose a different repeat and change backtrack distance. Camera targets the blue paper like 7; red then Read then blue lift, with the same copy/highlight. Offscreen head and trace stop moving when streamRun ends; spinner clock can continue.
- 🟡 **World pitch:** 4800 world units instead of 11's 2400 to contain the long backtrack. Final pitch remains exactly 100px; dots finish at 12px. Stream, agent, and small grid share uniform size correction during zoom so their relative sizes stay matched.
- 🟡 **Neighbors:** live seeded streams during the football arc. Once backtracking starts they are plain gray dots, before the final zoom reveals them. If you overlap backtrack with the football arc, this change may become visible.
- 🟡 **Cloud entrance:** translates each cloud's geometry upward and inward *inside a fixed 720px WebGL canvas*: left cloud enters from down-left, right cloud from down-right. Horizontal spread defaults to 700px and is exposed as `cloudEntrySpread`. Moving the already-clipped canvas produced straight cloud tops and is intentionally avoided. `cloudYOffset` remains reserved for 9's END pose. At entry completion clouds exactly match the original starting pose.
- 🟢 **Finale reuse:** `Micro09Scene` itself is reused, including its shader, original six-second cloud easing, warning RNG seed 209, sparkle controls, cloud final offset +27, and Signals offset −36. Animation 9's local time is held at zero during entry. No rewritten approximation of the finale.
- 🟢 **Isolation:** no existing experiment implementation changed. Shared 7 geometry/copy/assets and 9's scene are imported read-only; later edits to those shared sources can intentionally change 12 too.
- 🟡 **Phase-aware clipping:** football clips at the original hero cell. Backtrack is unbounded. After scene rebase, final zoom clips to the full center-cell frame; its boundary begins offscreen and enters naturally, preventing both sudden cuts and trace overflow onto neighboring cells.
- 🟢 **Ubiquitous small grid:** during backtrack, lifts, warning focus, and final zoom, the 120px grid is camera/world-anchored with one-cell overscan. It does not inherit the hero-content rebase. Football retains independent cell-local grids.
- 🟢 **Intro camera:** the camera starts at the original centered position. `firstThinking` moves the stationary hero `0.75 × 120px = 90px` right on screen; `cameraCenterAgent` starts with `streamRun` and smoothly returns it to center. This is camera focus only—hero, grid, stream head, and rebase coordinates remain unchanged.
- 🟢 **Opening clouds:** Figma node `4741:28865` supplies separate rear and foreground cloud photos. Both use the Signals WebGL dither shader, preserve the foreground horizontal flip, and move at `−head` so they remain grid/world-pinned and naturally leave frame as the agent advances. Rear and foreground X offsets are independently tunable.
- 🟢 **Animation 10 smoke:** the center hero alone receives Animation 10's dithered smoke stack and seeded puffs with the unchanged `MICRO_10_DEFAULTS`. They run from `streamRun` through the camera backtrack and remain attached to the original agent world position. Their opacity follows the football out/back curve (`100% → configurable minimum → 100%`); the default minimum is `0%` so the zoomed-out center does not read as an overly dark mass.
- 🟢 **Determinism/performance:** no wall-clock timers or fresh random calls. Only visible visited hero blocks are materialized; neighbors use SVG patterns. Arbitrary frame scrubbing and Remotion share the same pure state sampler.

## Authoring hazards requiring attention

- `REVIEW(timing)`: keep streamRun before cameraBacktrack, and cloudEnter before finale. The authoring UI warns on these invalid overlaps. Also keep footballBack complete before backtracking if neighbors should not pop.
- `REVIEW(short-run)`: shortening streamRun too far may leave some chosen doors unvisited; UI warns. This is deliberately not silently clamped to an unrelated motion.
- Browser-persisted timing edits do NOT automatically update Remotion defaults. Copy the tuned values back into `timeline.ts` before export; keep DialKit `clip.current` until production handoff.
- The finale bar intentionally time-compresses Animation 9's six seconds into 2.5 seconds.
- WebGL2/ANGLE is required; render failure is explicit rather than silently dropping clouds.

## Validation results

- TypeScript and `geometry.test.ts` passed.
- Remotion stills rendered for intro, football apex, lifts, final grid, and finale (`poc/out/micro12-*.png`).
- Final-zoom regression samples every frame to ensure the warning remains inside the center cell and the rebased clip boundary begins outside the viewport.
- At Animation 12 time 17.2s versus Animation 9 time 3s, PNG hashes match and ImageMagick reports **zero differing pixels**. This is a sampled-frame check, not proof for every frame.
- Full-motion/browser visual QA has not been performed; inspect timing and cloud bridge in the tuning UI.

## Checks

`pnpm --dir poc typecheck`

`pnpm --dir poc exec tsx src/experiments/micro-12/geometry.test.ts`

`pnpm --dir poc exec remotion render src/video/index.ts MicroAnimation12 out/micro-animation-12.mp4 --gl=angle`
