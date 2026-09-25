# Animation 17 — Ultimate 2

Preview: <http://localhost:5180/?experiment=micro-17>. Deterministic defaults: append `&time=9.4666667` (finite values only; negative values clamp to zero). Remotion: `MicroAnimation17`, **1280×720, 30fps, 17.818 seconds** (535 frames) by default. No early zoom, football bars, finale bar, Signals title, or downward cloud exit. Playback does not loop.

## Choreography / provisional timings

All bars are independently editable. These are authoring defaults, not approved final pacing.

| Clip | Start | Duration |
|---|---:|---:|
| agentEnter | 0 | .31 |
| firstThinking | .23 | .7 |
| streamRun | 1.9 | 2.718 |
| cameraCenterAgent / smokeEnter | 1.9 | .32 / .26 |
| continueStraight | 4.618 | .65 |
| upwardTurn | 5.268 | 1.1 |
| cameraBacktrack | 6.418 | 1.6 |
| redThinkingLift / readLift / thinkingLift | 6.918 / 7.418 / 7.918 | .3 each |
| highlight | 8.618 | 1.1 |
| warningEnter | 8.868 | .24 |
| warningFocus | 9.568 | .55 |
| finalZoom | 10.118 | 2 |
| streamCollapse / loaderFade / dotDim / smallGridFade | 11.318 | .6 each |
| cloudEnter | 12.618 | 1.4 |
| cloudHold | 14.018 | 3.8 |
| subtitleBuild | .45 | 1.45 |
| subtitleTrace | 1.9 | 2.718 |
| subtitleFailure | 4.618 | 1.8 |
| subtitleWhy | 6.418 | 3.15 |
| subtitleInsights | 9.568 | 4.45 |
| subtitleIfOnly | 14.018 | 3.8 |

Animation 12's first Thinking, intro camera offset, grid, cloud photos, typography, icons, continuous repeating blocks, smoke defaults and paper/highlight copy are retained. Six screen-pinned subtitle tracks align to the agent entrance, live trace, upward failure, backtrack, warning zoom, and final cloud hold. The stream removes fourteen blocks before the lifting blue Thinking block and shortens the composition by the corresponding 4.182 seconds. Clouds and world hold from **14.018s**, including arbitrary far-future seeks.

At the default 660px/s, streaming reaches x=2094. The extra straight segment reaches the shortened route's elbow at x=2520. Exactly fourteen preceding blocks (2760px) are omitted while preserving the agent circle's velocity. The canonical Animation 7 tail still rises 720px. Camera follows horizontally, stays at that elbow during ascent, then backtracks to the blue/Read/red trio (blue center x=1440). Speed/duration changes still select a compatible route; extra straight distance remains nonnegative and under one 2040px repeat.

The warning is the exact `micro-12/warning.svg`, centered at the blue door's upper-right (screen 820,180 after backtrack). Its independent placement defaults are +180/−180 from the blue center. Whole-world rebase centers it before the only zoom, from scale 1 to 1/48. The final lattice is 100px with 12px dots. Clouds use Animation 12's geometry-entry convention: fixed canvas, ±700px inward/upward entry, original cloud renderer held at progress 0 and yOffset 27. Only the renderer is reused, **not** `Micro09Scene`, its sparkling/title scene, or its playback.

## Architecture / authoring

- `timeline.ts`: dedicated persistence ID, independent clips, serializable timing/transition overrides, invalid-order warnings and export duration.
- `sample.ts`: pure arbitrary-time sampler; `livePlayback` consumes actual DialKit `clip.current` values. Both produce the same `Playback` for `worldState` and `Micro17Scene`. Smoke clock uses the live smoke start. Zero-duration clips are true steps; floating-point endpoint noise is snapped; time clamps at the resolved terminal endpoint.
- `geometry.ts`: read-only reuse of 12's block template/opening-cloud geometry; 7's exact tail, elbow outline and **block-local route masks**, translated into the continuing stream. No scene cut, route-wide wipe or teleported loader.
- `World.tsx`: same world camera for trace, agent, smoke, paper and warning rebase. Partial masks live inside header lifts; paper is only shown for completely visited doors and remains in its fixed clipped column.
- Scoped SVG stacking contexts explicitly put grid/back clouds behind smoke, then trace/agent/paper, intro foreground clouds, and warning. Imported smoke canvas z-index 1/2 cannot escape their SVG layer. Cover has its own upper layer; screen-pinned subtitles paint above it.
- `App.tsx`: original production handoff comment and DialTimeline retained; independent motion/cloud/warning persistence IDs; ResizeObserver reserves at least 6px below the stage when the timeline mounts/resizes.
- **Animation audio:** after one user click enables Web Audio, Animation 10's tick and puff recipes follow the live `streamRun` clip, then retain their cadence while a dedicated family bus fades them linearly to silence over 3 seconds. The final `cloudEnter` clip triggers the supplied “clouds whoosh in” recipe for exactly the clip's resolved duration. Pause/seek stops active voices, and tick/puff/cloud gains remain independently tunable without the stream fade affecting cloud, drawer, or camera effects. No drone is used.
- Editor inspection uses **defaults**, ignoring browser-persisted edits, as Animation 12 does. Normal authoring uses live values. Remotion accepts `{controls, timing}` and the same pure sampler. Copy tuned timing/controls into defaults or pass serialized export props; browser persistence does not automatically alter exports.

## Validation

```sh
pnpm --dir poc exec tsx src/experiments/micro-17/geometry.test.ts
pnpm --dir poc exec tsx src/experiments/micro-17/sample.test.ts
bash poc/src/experiments/micro-17/layering.browser.test.sh
pnpm --dir poc run typecheck
pnpm --dir poc exec vite build
pnpm --dir poc exec remotion still src/video/index.ts MicroAnimation17 /tmp/ultimate2-verification/turn.png --frame=284 --browser-executable='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' --gl=angle
```

Pure checks cover opening geometry parity, every pre-finalZoom frame at scale 1, route continuity, exact 7 partial elbow masks, visited door selection, warning centering/cell clipping, static/live parity, reverse seeks, retiming, instantaneous bars, terminal freeze and registrations. Browser checks use the existing preview and isolated `ultimate2-worker` session: computed layers 0–5; nonvacuous smoke/paper tests with **zero foreground/occluded-region pixel differences**; mount/resize clearance 6.015625px; warning center 820,180; and zero differing pixels between the terminal frame and a far-future seek.

Stills in `/tmp/ultimate2-verification`: `turn.png` (284), `highlight.png` (402), `warning-zoom.png` (453), `cloud-hold.png` (555), `post-completion-a.png` (615), `post-completion-b.png` (654). The last two PNGs match byte-for-byte. `intro-12.png` / `intro-17.png` at frame 18 verify the original opening assets/geometry; their small label/agent edge rasterization differences are **not** an exact-pixel parity claim. Browser evidence: `browser-check.txt`, smoke/paper screenshots, and terminal/far-future seek captures.

Before subtitle removal, parent verification also reran both micro-17 test files and `git diff --check` successfully. At 1280×720, browser opening comparisons against saved Animation 12 defaults were pixel-identical at **0.2s** and normalized RMSE **0.000259248** at **2.4s** (not pixel-identical). Reference/comparison captures are in `/tmp/ultimate2-reference/`. The registration diff is additive; existing animation sources are unchanged and unrelated `sound-synth` edits were left untouched.

## Limitations

- No human visual approval or full-motion review is implied by these tests/stills. Pacing and the small extra straight-run duration remain provisional.
- Keep forward clips ordered, backtracking after ascent, warningFocus before finalZoom, and cloudHold after cloudEnter. Invalid authoring overlaps warn rather than silently changing the edit; deliberately instantaneous bars can create intentional jumps.
- WebGL2/ANGLE and the existing read-only shared assets are required. Shared source changes to 7/10/12 or the cloud renderer can intentionally affect this experiment.
- Vite reports the repository's existing >500kB bundle warning. No new dependencies or global styles were added.
