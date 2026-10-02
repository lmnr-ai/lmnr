# Micro 08 — Streamers → dot grid

Seven white agents head left-moving colored streams, then become the **first column of a16×7 dot grid**. The original agents survive the transition; they are not replaced by a second set of dots. Other dots slide in from offscreen right at full size. All dots then dim from white to`#4e4e4e`.

## Figma sources

- Streamers: frame`4730:14319`; `figma-reference.json` preserves its geometry, gradients and asset provenance. Fifth agent intentionally starts at`(850,456)`.
- Dot grid: frame`4730:15806`, fetched with Figma design context.1280×720, background`#1a1a1a`,16 columns,80px cells,20px white dots. Figma has nine rows; the user explicitly requested **seven**, so the adapted rows are vertically centered at y120,200,…600. Column centers are x40,120,…1240.

- Final dot fill: node`4730:16372`, fetched with Figma design context:`#4e4e4e`, fully opaque.

## Outro choreography

The composition is now **12s /360frames /30fps**, with a finite end state. Authoring autoplay does not loop by default. Timeline persistence:`micro-animation-08-timeline-v6`.

| Clip | Seconds | Behavior |
|---|---|---|
| Travel | 0–12 | Continuous linear stream motion, including landing and exit |
| Dot position | 8–10 | Original seven agents move to column zero |
| Dot shrink | 8–9.8 | White heads48→20px; ribbons/content scale uniformly with them |
| Loader stroke | 8.2–9.6 | Actual spinner stroke width2→0, not just image opacity |
| Backdrop fade | 9.6–10.8 | Dithered cloud and line grid disappear together |
| Streamer exit | 10.4–10.9 | Tails fade only **after position animation has finished** |
| Grid slide | 8–11.3 | Remaining105 dots slide from offscreen right during loader movement, easing column by column; ~94ms start stagger,1.98s per column, constant20px diameter and opacity1 |
| Dot dim | 11.05–11.65 | All112 dots animate from white to Figma`#4e4e4e` |
| Final hold | 11.65–12 | Plain16×7 dimmed-dot grid on dark background |

All stages have separate DialKit timeline clips and `clip.current.progress` bindings. Keep Streamer Exit after Dot Position when retuning. Travel must cover the exit, not end at landing.

`outro.ts` owns pure pose/reveal calculations. Each ribbon's pattern stays anchored to its moving head; its phase clock never freezes. During the post-landing hold and fade, scaled ribbons still move left at280screen px/s (672×20/48). The same seven keyed head circles become column zero. `OTHER_DOTS` deliberately excludes column zero. Each incoming column eases its own1280→0 horizontal offset, with all seven dots in that column moving together. The linear Grid Slide clock staggers column starts across its first40%; each column uses a smoothstep ease over60% of the clip. Columns temporarily spread apart, never cross, and settle to80px spacing. There is no scale or opacity reveal. A separate Dot Dim clip controls the actual fill of both the original heads and incoming dots, not their opacity.

The loader uses the original `spinner.svg` path inline, exposing its real stroke width. Scale and stroke collapse are independent. Final radius10, stroke0, cloud/grid/tail opacity0. Nothing accumulates or depends on previous frames, pointer history, or wall time.

## Cloud filter

The original rejected terrain approximation is removed. `DitherBackground.tsx` uploads `public/micro-08/image-218.png` once. `dither-shader.ts` adapts Paper **Image Dithering**: Bayer8 thresholds and grayscale quantization.

- Preserve original cloud placement`(383,-104)`,1908×1072,`xMidYMid slice`.
- Output alpha comes from the original unsnapped texture coordinate. Filter settings do not change the silhouette. Premultiplied-alpha interpolation retains soft edges.
- Intensity0 bypasses the filter. Optional pulse modulates intensity only, on an8s cycle independent of composition duration.
- Static settings draw once, not once per streamer/outro frame. Cloud fade is compositor opacity. No RAF, Three.js, or new runtime dependency.
- PNG readiness and first draw are render-gated. Failure is explicit; texture/program resources are freed on unmount.
- Preview and Remotion both default to the filtered cloud. `&background=reference` selects the original PNG; it follows the same outro fade.

Adapted from Paper Shaders revision`7002061d8389781a45e479584deeca0cf538474e`, `packages/shaders/src/shaders/image-dithering.ts`. Apache-2.0 license/attribution are in `vendor/paper/`; modifications are marked. Powered by [Paper Shaders](https://shaders.paper.design).

**Paper dithering — Cloud**, persistence`micro-animation-08-dither-v5`:

| Control | Default |
|---|---:|
| Pixel size | 3 |
| Color levels | 8 |
| Contrast | 1.4 |
| Intensity | 1 |
| Pulse | 0 |

## Block words and icons

**Stream blocks → Show words and icons** defaults on, persistence`micro-animation-08-block-content-v2`.

- Blue→Thinking; red→Thinking...; orange→Read; green→Write; pink→Bash.
- Purple→original chat outline; yellow→original hex outline. `generate-block-icons.py` extracts unchanged Micro07 paths, removing only backgrounds/gradients so Micro08 retains its authored colors.
- Initial scale48/120=0.4: header48→19.2px, line height63→25.2px, left inset32→12.8px (red20→8px), icon stroke4→1.6px. Ribbons and their contents then shrink uniformly during the outro.
- Same local JetBrains Mono Regular as Micro07, under a scene-specific font-family. Font/icon readiness is render-gated and preloaded for toggles.
- Authored blocks fit full labels. A few narrower offscreen padding blocks ellipsize without changing font size or block widths.
-112 label elements and112 icon images live inside fixed patterns; disabling content removes them.

## Preview and deterministic sampling

Existing tuning server:`http://localhost:3002/?experiment=micro-08`.

- `&time=9`: seek into the morph; `&time=10.2`: landed heads with tails **still streaming**; `&time=12`: final grid.
- `&content=1`/`&content=0`: explicitly show/hide block content, independent of browser persistence.
- Remotion accepts composition prop`showWordsAndIcons`; its default is also true. Browser storage does not affect exports.
- `sampleStreamers` remains periodic, reducing time before multiplication. Strip period2688px/speed672px/s=4s; grid48px; spinner1.5turns/s.
- `sampleMicro08` combines those phases with finite, endpoint-clamped outro clips sampled by the same DialKit functions as the preview. The full animation no longer loops: large future seeks remain on the final grid.
- Stage is16:9 with256px reserved for authoring controls; rendering uses1280×720 regardless of viewport/DPR.

## Assets

Local `staticFile` paths only; no runtime Figma or `/tmp` dependency:

- `public/micro-08/image-218.png`: original623×350 RGBA cloud.
- `public/micro-08/spinner.svg`: retained as source provenance for the inline loader path.
- `public/micro-08/block-{chat,hex}.svg`: exact Micro07 icon-only geometry.
- `public/micro-07/JetBrainsMono-Regular.woff2`: shared original typeface and adjacent OFL license.

## Validation

From `poc`:

- `pnpm typecheck`
- `pnpm exec tsx src/experiments/micro-08/outro.test.ts`
- `pnpm exec tsx src/experiments/micro-08/geometry.test.ts`
- `pnpm exec tsx src/experiments/micro-08/block-content.test.ts`
- `pnpm exec tsx src/experiments/micro-08/dither.test.ts`
- `pnpm exec tsx src/experiments/micro-08/dither-renderer.test.ts`

These cover target geometry, offscreen-right entry during loader motion at constant20px size/opacity1, column staggering without overtaking, final80px spacing, the exact final`#4e4e4e` fill on all112 dots, source scaling, exact paths, seven persistent head elements, no duplicate first column, actual stroke-width0, independent timeline parity, stream motion **after landing and throughout exit**, endpoint holds, reverse/random seeks, label fit, and renderer resource/draw lifecycle. The renderer test is mock WebGL, not GLSL execution. Source/structural checks do not establish visual fidelity.

`scene.browser.test.ts` is an optional explicitly invoked browser check for rendered SVG positions, effective head widths, strokes, ribbon attachments, fixed node counts, shader draw counts and responsive layout. It closes its isolated session in `finally` and does not clear the user's localStorage. It is not part of the Node suite; agent-browser has not been restarted for the outro work.

The previously exported8s `~/Downloads/micro-animation-08.mp4` predates the outro. That image-filter export completed with real WebGL/Remotion, but is not validation of this new12s transition.
