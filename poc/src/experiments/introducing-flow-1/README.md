# Animation 13 - Introducing Flow-1

A deterministic 13.3-second, 1280×720 continuous-world animation. Reference screenshots are fixtures, never runtime scene assets.

- Preview: `http://localhost:5180/?experiment=introducing-flow-1`
- Static inspection: append `&time=8.3`
- Remotion composition: `MicroAnimation13`

## Endpoint schedule

| Time | Figma node | State |
|---:|---|---|
| 1.5s | 4773:10504 | Flow-1 gray/blue field, clouds held around title |
| 5.6s | 4773:6390 | benchmark percentages |
| 8.3s | 4773:10843 | trace counts and bars |
| 9.9s | 4773:9034 | open engine |
| 11.1s | 4773:8257 | active blue module |
| 12.7s | 4773:8666 | closed cover |

## Authoring dials

- **Cloud position → yOffset:** default `37px`, range `-500…500px`. Adjusts the held cloud framing after `cloudReveal`; `cloudExit` remains additive.
- **Dot appearance → blueScale:** default `1.2×`, range `0.25…5×`. Changes only selected blue dots; gray dots remain `1×`.
- **Benchmark rows → numberRowStagger:** default `0.05s`, range `0…0.25s`. Delays each successive card and percentage during their opening reveal; `0` restores simultaneous entry.
- **Cover motion → direction:** dropdown with `From top` (default), `From right`, and `Split doors`. Right-entry keeps the two circle centers symmetric around the fixed engine center. Split mode uses two overflow-hidden halves of the same full-circle cover, moving inward symmetrically; both copies use a fixed `55.75°` loader orientation so the assembled spinner gap points straight down.
- **Engine colors → mutedGray:** color picker, default `#474747`. Drives the ring border, module/line/cover backgrounds, thick connector, and spinner disc through one CSS variable.

Remotion uses these defaults unless production props are supplied. The master timeline defaults use persistence ID `introducing-flow-1-timeline-v5`; the exact authored values are defined in `timeline.ts` and regression-tested.

## Independent timeline tracks

Camera motion never drives a component's reveal, count, bar width or activation. Clouds remain screen-pinned outside the world transform. Each row below is separately editable in DialKit.

| Track | Default interval | Controls |
|---|---|---|
| cloudReveal | 0.45–1.35 | Animation 9 cloud geometry reveal |
| cloudExit | 2.20–3.71 | downward exit |
| cameraZoom | 2.11–3.11 | 100px→60px grid pitch |
| cameraToBenchmark | 2.13–3.33 | descend vertically to the percentage section |
| dotsExit | 1.95–2.85 | all dots scale to zero |
| benchmarkHeading | 3.28–3.51 | Trace analysis / intelligence masked slide |
| modelRows | 3.49–3.74 | bar/name layers masked slide, staggered top-to-bottom by `numberRowStagger` |
| percentageReveal | 3.39–3.59 | percentage layers masked slide, using the same row stagger |
| percentageCountUp | 3.59–3.99 | Flow-1 only, linear 0→81.9%; others remain fixed |
| cameraToAnalysis | 6.10–6.61 | move the same rows upward 240px |
| numberSwap | 6.11–6.41 | percentages leave down; zero counts enter from above |
| analysisCountUp | 6.42–7.43 | all six counts increase, fully visible |
| barsGrow | 6.42–6.98 | individual target widths and 12→20px gap |
| analysisHeading | 6.35–6.80 | Traces analyzed / per dollar masked slide |
| cameraToEngine | 8.64–9.30 | descend to the engine section |
| moduleActivation | 9.20–9.39 | module gray→blue fill |
| engineSpinner | starts 9.35 | upper-right spinner clock |
| engineLines | starts 9.35 | upward seamless line clock |
| coverDescent | 9.77–10.26 | cover position/size and loader-asset blend |
| coverTint | 10.11–10.56 | cover gray→blue fill |
| coverSpinner | starts 10.16, 0.41s/revolution | cover loader clock; clip start and duration directly control the loop |
| subtitleIntroducing | 0.45–3.28 | Flow-1 introduction |
| subtitleIntelligence | 3.28–6.10 | Sonnet-5 benchmark claim |
| subtitleCost | 6.10–8.64 | cost claim |
| subtitleSignals | 8.64–13.30 | Signals engine explanation |

Subtitles are screen-pinned above the world and clouds. Each bar owns one complete visible lifetime with a short internal edge fade and remains independently editable.

Loop tracks use elapsed time from their own editable start, continuing beyond their timeline bar. To preserve visible count-ups, keep `percentageCountUp` after `percentageReveal`, and `analysisCountUp` after `numberSwap`. The default timing does this deliberately; independent editing is not silently overridden.

## Geometry and rendering decisions

- 🟢 **One world:** grid, static title, persistent six model rows, engine and cover share one camera. The title never fades or gets its own exit transform: camera descent carries it above the viewport.
- 🟢 **Preview coordinate space:** scene geometry is always authored at 1280×720. The responsive preview stage uniformly scales that fixed canvas; it never resizes the scene's CSS coordinate space. At the user's 1224px-wide stage, scale is `1224/1280 = 0.95625`, producing equal measured top/bottom margins of `60×0.95625 = 57.375px`. Previously the browser clipped an unscaled 1280×720 scene to 1224×688.5, silently removing 31.5px from the bottom and creating the apparent half-cell margin.
- 🟢 **Camera/grid:** zoom preserves the world point beneath viewport center `(640,360)`, rather than scaling around the world's top-left. The zoom begins from the viewport-center anchor, then adds a calculated 30px settled phase correction: at 60px pitch, `1280 = 40 + 20×60 + 40`, giving balanced 40px edge cells instead of 10px slivers. Camera X interpolates `-110→220`; post-title sections compensate in world space so screen framing remains unchanged. Benchmark world position is `(-200,1700)` and engine position is `(300,3600)`. Both analysis content unions are 600px tall and use exact 60px top/bottom margins; their camera translations are `(220,-720)` and `(220,-960)`. Engine framing remains `(220,-2040)`. The grid uses 1000 world px of overscan on every side, so its painted surface begins far offscreen (`x=-380` when settled) rather than visibly at the first grid line.
- 🟢 **Borders:** stationary overflow masks own inset top/left line overlays; translated content/backings own no outline. The right heading is exactly `(580,480,600,180)` in the analysis frame. Gradient overlays paint the same inverse-scaled stroke as the world grid without moving during slide reveals.
- 🟢 **Hugging rows:** bar/name masks are intrinsic `max-content`, with 12px right padding and a 1px inset-outline allowance before the bar. Target panel widths from Figma are `[144,195,772,228,542,342]`, not uniform 980px. Model-name text boxes use the measured `[101,135,101,185,202,269]` widths: Figma rounds these to whole pixels, unlike the browser's fractional intrinsic glyph widths. Bar growth changes intrinsic width; masked reveal alone never stretches the panel.
- 🟢 **Numbers:** percentage slide, percentage count, number exchange and analysis count have separate tracks. Counts start after their layers settle in the fixed masks. Other model percentages do not count. In Ultimate 3, every staggered opening-card start triggers the supplied piano cue from the same derived timing.
- 🟢 **Clouds:** unchanged Animation 9 renderer, texture, dither defaults and 27px final Y offset. Reveal → hold → separate exit. No artificial gray backing. Cloud coordinates are independent of camera travel.
- 🟢 **Dots:** directly reuse Animation 9's `sampleSparkleGrid`, seed 209 and `SPARKLE_DEFAULTS`: 4Hz, 20% target selection, 40% state-change probability, 83% color-change probability and 9.25 isolation weight. Selected cells become 24px blue-gradient dots; others remain 12px `#4e4e4e` dots. No other highlight hue.
- 🟢 **Engine:** module text starts `#1a1a1a`, matching the grid background. Assembly is centered within the outer ring. Figma's thick connector export is 240×96px; its overlaid fine stroke is centered at 196×98px including stroke overflow. Both use Figma's horizontal flip; the fine stroke must not use `width:100%`.
- 🟢 **Line loop:** three copies of the downloaded nine-path SVG at measured `(-53,-108,196,481.463)` screen bounds. Positive modulo preserves upward movement with bounded nodes.
- 🟡 **Cover loader:** raised/final assets stay co-mounted and crossfade through descent with shared rotation. This avoids an abrupt source switch; exact blended appearance still needs visual review.
- 🟡 **Travel defaults:** the new one-screen title→benchmark descent and the existing 1080px benchmark→engine descent are art-direction choices. Figma's periodic grid only determines endpoint phase, not whole-cell travel distance.

## Verification

- `geometry.test.ts`: endpoint landmarks/grid phase, camera/component independence, title camera exit, visible-count ordering, exact benchmark targets, modulo wrap boundaries and independently retimed spinner clocks.
- `opening.test.ts`: no backing, fixed hold, offscreen cloud exit, exact Animation 9 dot selection parity, majority gray field and deterministic/live timing.
- `layout.browser.test.ts`: installed Chrome through agent-browser at the user's width-constrained 1224×688.5 stage; asserts a fixed 1280×720 authored scene with uniform scaling, equal vertical margins and offscreen grid overscan, then checks Figma hug widths, bar widths, grid alignment, engine details and visible intermediate count values.
- Existing Micro09/Micro12 regression tests remain part of verification.
- Evidence for this revision: `poc/out/micro13-layout-revision/`. Older validation directories contain obsolete timing/layout captures.
- Prior cloud-only browser PNG hash matched Animation 9 exactly: `59058ed58491dba15a6b6f3fbf59a6e0fea2d3d394db9ffa31d7af71959d3659`.
- Browser layout/count test passed: six analysis panel widths are within 0.42px of Figma; all six counts have fully visible intermediate values. Flow percentage samples were `16.4% → 41.0% → 65.5%`; analysis counts increased across three sampled times.
- Render pixel checks: heading top/left and adjacent grid lines are all exactly `#333333`; the pixel beside the left border is `#1a1a1a`.
- Flow geometry/opening tests, Micro09/Micro12 regression tests and scoped Flow TypeScript check passed. The full-project typecheck reported unrelated `micro-14/sample.test.ts` missing-property errors; that work was not modified.
- The current model cannot view images. Numeric/browser checks and renders are evidence, not visual sign-off.

## Production handoff

Keep DialKit `clip.current`, `<DialTimeline />` and the handoff comment above `useDialTimeline`. Production Motion should preserve the `FlowPlayback` contract and the independent tracks/local clocks before removing DialKit. No wall-clock/CSS-keyframe animation or reference screenshot dissolves.
