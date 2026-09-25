# Animation 16 — Cost of a trace

1280×720 · 30fps · **17 seconds / 510 frames** · editor `http://localhost:5180/?experiment=micro-16` · Remotion `MicroAnimation16`.

## Preview / edit beats

Append `&time=<seconds>` for deterministic paused inspection. Otherwise the persistent DialKit playhead owns time.

| Beat | Useful times | Default action |
| --- | --- | --- |
| Continuous cloud sweep | 0.9, 1.5 | Flow-1 cloud image/shader; one .45–3.71s track moves continuously through reveal to fully offscreen |
| Separate yellow passes | 1.6, 2.09, 2.59 | Three row-local agents: right, left, right; each traverses x−80↔1360 with no vertical connector. Ultimate's white-agent spinner at9rps, editable1.5px stroke |
| Thinking warning peek | 3.2, **3.9** | After the yellow passes: center Thinking block drops20px; three colored warnings rise from behind it and rotate−20° together,2.95–3.5s |
| Bash expansion / inspection | **6.4**, 8, **8.5** | Down-camera at4.51; entry/stop; 2400px output unfolds; agent descends2040px; highlighted expired-token error and top-left warning |
| Budget run / exhaustion | **10.5**, **12.5**, 16.97 | Second down-camera at9; entry to center; run at10.11; depletion11.07–13.67; permanent halt and final subtitle through17s |

## Authoring defaults

`timeline.ts` stores the user's exact tuned values. `clip()` sets `from.progress:0`, `to.progress:1`, and an easing transition with duration equal to the clip duration. Smooth easing is `[.45,0,.55,1]`; linear is `[0,0,1,1]`.

| Track | At | Duration | Easing |
| --- | ---: | ---: | --- |
| Cloud Sweep | .45 | 3.26 | smooth |
| Cheap Leg One Right | 1.4 | .4 | linear |
| Cheap Leg Two Left | 1.89 | .4 | linear |
| Cheap Leg Three Right | 2.39 | .4 | linear |
| Thinking Drop | 2.95 | .55 | smooth |
| Camera Down To Bash | 4.51 | 1.58 | smooth |
| Purple Bash Entry | 5.38 | .75 | linear |
| Purple Bash Stop | 6.08 | .25 | smooth |
| Bash Expand | 6.23 | .2 | smooth |
| Bash Descent | 6.4 | 1.84 | smooth |
| Bash Highlight | 7.9 | .7 | linear |
| Bash Warning | 8.23 | .24 | smooth |
| Camera Down To Budget | 9 | 1.3 | smooth |
| Purple Budget Entry | 9.56 | .8 | smooth |
| Budget Appear | 9.88 | .3 | smooth |
| Budget Run | 10.11 | .6 | linear |
| Smoke Enter | 9.85 | .4 | smooth |
| Budget Depletion | 11.07 | 2.6 | linear |
| Smoke Fade | 11.08 | 2.6 | smooth |
| Smoke Shrink | 11.07 | 2.6 | smooth |
| Subtitle — Cheap LLMs | .45 | 2.5 | linear |
| Subtitle — Miss issues | 2.95 | 1.73 | linear |
| Subtitle — Powerful LLMs | 5.23 | 4.79 | linear |
| Subtitle — Unsustainable cost | 10.02 | 6.98 | linear |

The24 timeline tracks remain independent; Thinking Drop owns all three warning-peek motions. Authored overlaps are intentional and preserved. Six controls: travel660px/s, purple spinner1.9rps, cheap spinner9rps, **Cheap Spinner Stroke Width**1.5px (0–12px), **Smoke Size**1 (0–2), and **Smoke Minimum Scale**.25 (0–1, step.05). Keep these controls separate from timeline windows.

`sampleMicro16(time, controls, timing)` is the pure editor/export seam. Live DialKit timings and transition curves pass into the same sampler used by `sampleMicro16Frame` / Remotion. Keep `useDialTimeline`, `<DialTimeline />`, and the exact `TODO(production)` comment immediately above the hook. No conversion to production Motion has happened.

`MicroAnimation16` accepts serializable `{controls,timing}` props. Copy tuned editor values when exporting non-default settings. Default duration is510 frames with no trailing hold. Timing-derived metadata extends exports only to the latest effective clip endpoint (minimum17s), rather than truncating motion or subtitles. Shifting all current tracks+3s yields600 frames.

## References and geometry

Figma file `VEbMxK1qMXzqjAVJaSQMPs`. Retrieved reference data: `/tmp/micro16-reference/frame-{1,2,3}.txt`, matching metadata, and `budget.txt`.

- Frame1 `4779:14008`: #1a1a1a background, #333 120px grid; traces at(-140,61),(-20,301),(-260,541); 120px-tall gray blocks and48px JetBrains Mono. The300px Bash width and1620px repeat intentionally use60px half-cell seams. Yellow agent diameter120, gradient #fff9a8→#ebe262. Each row has its own agent. Spinner centerline is verbatim from `micro-07/spinner.svg`, as used by Ultimate's white agent; only stroke width differs.
- Frame2 `4779:14221`: 360px Bash door,24px output and12px gutter. Purple gradient #bba8ff→#9a88dd. Normalize the isolated reference phase onto the shared grid: Bash x340 and initial screen row y301. Output is deliberately much longer than the reference, using fictional static terminal strings that are never executed. Warning retains86.797×80.604 dimensions and head-relative(-111,-96) placement.
- Frame3 `4779:14624`: center-follow purple at screen(640,361), repeated gray trace. Budget259×50; white dollar circle64px, glyph18×41. Marker trails the fill tip14px with center clamped to[32,259], preserving x130 at144px fill and keeping near-empty red visible around its curved edge.
- Budget fill changes from #ffe700→#f8bd1c to #ef8d8f→#f2747d as remaining budget falls from100% to25%. **The last25% stays fully red**, while fill width continues draining.
- Local Figma SVGs are in `poc/public/micro-16/`; `geometry.ts` maps active assets. The original short yellow-spinner SVG is retained as a reference but no longer rendered.

### Center-trace warning reference

Figma full frame `4779:16602`, center close-up `4779:16756`. Screenshots captured to `/tmp/micro16-reference/warnings-frame.png` and `warnings-center.png`.

Only the center trace's first Thinking block changes: x340, width360, height120, y301→321. The other blocks and rows stay stationary. Three exact local Figma SVGs (`thinking-warning-{left,middle,right}.svg`) retain81.9405×76.0943 dimensions and their red #f78079, pink #f59ed5, and green #26ae6c fills.

Warnings begin centered at y361, fully concealed behind the opaque block. They rise to y281.739975 and rotate about their centers from0° to−20°. Final centers x432.211552,506.578740,579.465458 follow the revised Figma frame: left/middle/right shift right7/10/13px and all rise an additional10px. These centers are derived from Figma's rotated top-left origins; metadata y−41 is **not** the axis-aligned bounding-box top y−69.025. Revised screenshot: `/tmp/micro16-reference/warnings-center-revised.png`. Right→middle→left warning draw order matches Figma; the door paints last and occludes their bottoms. There is no opacity/scale substitution or duplicate stationary Thinking block.

One **Thinking Drop** track drives the door, warning rise, and all warning rotations together over2.95–3.5s, after the yellow passes and before the camera move. If yellow passes are retimed, reposition this reveal explicitly rather than relying on hidden gates. The existing `thinkingDrop` key retains saved timing; obsolete `thinkingWarningsRise` and `thinkingWarningsRotate` settings are ignored without deleting storage.

## Rendering and deterministic motion

Read-only reuse of `micro-09/DitherClouds` preserves Flow-1's texture/shader, yOffset37 and final translate900. One Cloud Sweep progress value drives both spread and downward translation without an intermediate hold. Both later camera moves translate the same world; no cuts, dissolves or scale changes.

The Bash door lifts120px. Like Ultimate's `micro-12/Paper.tsx`, an explicit moving `clip-path: inset(120*(1-progress)px 0 0 0)` reveals output **only below the door's bottom edge**. A foreignObject's ordinary overflow boundary alone did not protect the partially lifted door: text was painting over its lower area. The moving clip fixes that while retaining the existing upward text motion and independently authored descent.

Read-only reuse of `micro-10/DitherPhoto` / `DitherPuffs` retains Ultimate's textures and dither shader. Explicit scoped CSS stacking is **grid(0) → puffs(1) → main smoke(2) → traces/agents/text/warnings(3) → budget badge(4) → opening reveal clouds(5)**. The grid is a separate SVG behind the smoke, sharing the same world camera transform.

The original DOM-order-only change was insufficient: globally imported `.micro10-puffs` / `.micro10-photo` styles set z-index1/2, while the foreground SVGs stayed at auto(0). A real browser check reproduced smoke covering the agent (normalized crop RMSE.267786 when hiding smoke). All six layers now have `.micro16-scene>`-scoped z-index rules that override inherited styles. Do not rely on JSX order or server-rendered markup alone to validate stacking.

The Bash agent spinner accumulates time only during movement: entry, stopping approach, and descent. Overlapping windows count once. It pauses6.33–6.4s at the block, resumes for descent6.4–8.24s, then holds its angle permanently. Resolved clip durations support retiming; authored zero-duration moves add no rotation. This is absolute-time sampling, so rewind restores the same angle.

Travel velocity is a smooth run envelope multiplied by inverse smooth depletion. Four-point Gauss-Legendre integration, split at envelope boundaries, integrates their piecewise cubic product. Position, spinner angle and smoke phase use this absolute-time integral. Smoke phase freezes at halt; its opacity and size now follow separate authored tracks (see below). No frame accumulation, `time*changingSpeed`, randomness or post-stop drift. Zero-duration clips are steps before DialKit's .05s visual minimum; invalid values normalize safely.

Font and image loading are awaited for export. The scene uses the existing local `micro-07/JetBrainsMono-Regular.woff2`. Editor and Remotion both load `micro-16/styles.css`.

## Smoke authoring

- **Smoke Fade** independently controls body and puff opacity: progress0→1 means opacity1→0. Puff lifetime fade still applies. It no longer depends on budget power.
- **Smoke Shrink** independently moves the body scale from100% to **Smoke Minimum Scale**, relative to **Smoke Size**. Default minimum25%; set0 for the former shrink-to-zero effect or1 to prevent shrink. Mature puffs respect the same relative floor, including their lifetime shrink.
- Smoke Shrink defaults to11.07–13.67s and Smoke Fade to11.08–13.68s, closely matching the depletion window, but can be retimed without changing travel, spinner, camera, or budget fill. Retiming budget depletion does not silently retime either smoke track.
- Entry and newborn puff growth may start below the minimum. Puff motion/pulse/birth age still use the integrated budget clock, so they freeze when the agent stops. A delayed fade can keep stationary minimum-size smoke visible afterward; custom visual tracks extend export duration as needed.
- Default smoke becomes transparent at14.46s but retains25% geometry rather than collapsing to a point. Layering stays behind all foreground content, above only the grid.

## Subtitles

Four independent timeline bars cover the cheap-agent sweep, missed-issue warning, deep Bash inspection, and budget exhaustion. Each bar owns the complete visible lifetime of its subtitle, with a short edge fade contained inside that lifetime. Subtitles are screen-pinned above the cloud layer and are shared by the DialKit preview and Remotion sampler.

## Persistence

Stable IDs remain `micro-animation-16-timeline-v1` and `micro-animation-16-controls-v1`. Source config owns total duration. Surviving tracks keep their persisted values; obsolete cloud reveal/exit and down-turn keys are ignored. Older control sets receive the default1.5px spinner stroke and.25 smoke minimum scale. Missing Smoke Fade/Shrink tracks receive their source defaults. No user storage is deleted or replaced when updating defaults. Saved customized clips can still extend an editor timeline beyond the default17s.

The preview observes actual timeline dock height, including hide/reopen/resize, and keeps6px clearance.

## Verification

From `poc`:

```sh
pnpm exec tsx --test src/experiments/micro-16/*.test.ts
pnpm run typecheck
pnpm exec vite build
bash src/experiments/micro-16/layering.browser.test.sh
pnpm exec remotion still src/video/index.ts MicroAnimation16 /tmp/micro16-layout-check/export-door-6.9.png --frame=207 --browser-executable='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' --gl=angle --log=error
```

26 tests cover all exact authored defaults and the production handoff comment, geometry/assets, cloud sweep, independent passes, Ultimate spinner/stroke control, camera/descent, budget integration/center-follow/monotonicity, permanent halt, rewind/retiming/instantaneous clips,510-frame export metadata, moving paper clip, smoke render order, and fully red fill at/below25%. The warning-peek suite adds source colors/final rotated bounds, concealed initial geometry, synchronized one-track retiming, zero-duration steps, frame parity, rewind, draw order, and compatibility with older persisted controls.

A browser differential check at6.9s reproduced text painting over the door: hiding the text changed pixels in the door region. Applying only Ultimate's moving clip made that region pixel-identical to the hidden-text control (**RMSE0**); the source fix reproduces that result. Browser DOM confirms smoke precedes the world and badge, and gradient stops at13.7s/16.97s are exactly the final red values. Captures are in `/tmp/micro16-layout-check/`.

Final validation passed TypeScript, Vite build (existing bundle-size warning only), and four Remotion stills at frames207,360,411,509. Editor/export comparisons are pixel-identical (RMSE0) for the door at6.9s, red budget at13.7s, and final hold at16.9667s. The12s smoke/run capture has a small nonzero normalized RMSE of0.000658174; it is not claimed to be pixel-identical. The14-test suite and `git diff --check` also pass.

Earlier `/tmp/micro16-verification/` exports omitted the scene stylesheet and are invalid for acceptance. `/tmp/micro16-corrections/` contains valid but now historical29-second captures and spinner checks; use current layout-check artifacts for this17-second revision.

Original three-track warning-peek browser checks (before consolidation): the final door is exactly(340,321,360,120), and transformed warning bounds match Figma. Hiding the warnings before reveal changes no pixels (RMSE0); hiding them after reveal changes no pixels inside the opaque door (RMSE0), verifying top-only occlusion. At the screenshot's1024×576 resolution, source-color warning masks agree with the Figma reference within one pixel on every bounding-box edge (mask intersection/union≈.965–.970 after browser downsampling). Browser console is clean; no saved values were modified. Current captures live in `/tmp/micro16-peek-check/`. Final warning-peek validation passed all19 tests, TypeScript, Vite build, and Remotion stills at frames87,96,117 (2.9s,3.2s,3.9s). All three full-resolution editor/export comparisons are pixel-identical (RMSE0); `git diff --check` passes.

Combined-track/spinner revision: all21 tests, TypeScript, Vite build, and `git diff --check` pass. Browser confirms one Thinking Drop label and neither obsolete warning track. Bash spinner angles are identical at6.5s/6.8s (636.12°), advance during descent at7s (711.36°), and remain identical at9s/9.2s (2052°). No new Remotion stills were rendered for this revision.

`layering.browser.test.sh` is the smoke regression check against the existing editor server. It uses a dedicated browser session, asserts computed z-index order, compares agent/trace/budget pixel crops with smoke shown versus hidden (maximum tolerance1/255 per channel for Chromium GPU gradient rounding), and checks smoke really rendered elsewhere. It reloads afterward to discard temporary capture styles without altering saved controls. Artifacts: `/tmp/micro16-layer-check/`. Final validation:21 tests, TypeScript, Vite build, browser layering/occlusion regression, Remotion frame360, and diff checks pass. Editor/export at12s differ by at most1/255 per channel (normalized RMSE.000136016), within the documented gradient-rasterization tolerance; they are not bit-identical.

Smoke authoring revision: all25 tests, TypeScript, Vite build, background-layer browser regression, and diff checks pass. Browser confirms Smoke Fade/Shrink tracks and a functioning minimum-scale dial (.25→.60→.25, restored). Remotion renders passed for default frame395 and a custom60% floor with delayed fade at frame450. Default editor/export frame395 differs by at most1/255 per channel (normalized RMSE.000136322); artifacts: `/tmp/micro16-smoke-controls/`.

Automated geometry/pixel checks do not constitute human visual approval. This runtime cannot inspect image attachments; no full-video visual review is claimed.
