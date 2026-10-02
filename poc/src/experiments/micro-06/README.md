# Snail

Figma artwork: 4720:9774. Original route plus three additional cycles, generally down/right with an upward detour. First block is blue Thinking..., without purple before it. Added cycles begin with purple chat, blue Thinking..., yellow tool, Read, purple chat, red Thinking..., yellow tool, Write, yellow tool, Bash. A final purple chat ends the entire path.

## Color variants
Snail appearance has a persisted palette dropdown: vibrant (original/default) and metal.
Metal maps text surfaces to micro-04's dark teals and warm gunmetal, with off-white labels. Chat/tool tiles reuse micro-04/middle-symbol.svg and time-symbol.svg exactly, plus the original gradient angles/colors at the tuned -5 lightness offset and seeded soft-light grain. Symbols stay upright and route corner clips remain unchanged.
Inspect with `?experiment=micro-06&time=5&palette=metal`. Remotion accepts `--props='{"palette":"metal"}'`; default exports stay vibrant.

## Current invariants
- Every Bash is exactly 240×120 (or 120×240 when vertical).
- Every interior purple/yellow icon is a 90-degree turn; every turn occurs at an icon center, never inside a text block.
- Final chat is the terminal exception: a rounded end cap facing the arrival direction.
- Artwork backgrounds use square variants of the original SVG assets; route-derived clips round the exterior corner without rotating the symbols. Connected edges stay full-width.
- Single rounded reveal path, no rectangular start exception; all text says Thinking... where applicable.
- Agent stays centered; grid/artwork share the camera transform. Local font loading is render-blocking for Remotion.

## Timeline v15 / 18 seconds
- agentEnter: 0–.6s, scale 0→1 with ease-out. Circle and spinner scale together about their center.
- firstThinking: .8–1.38s (duration .58s), stops at x840—half a120px tile before the first yellow corner. The initial label alone reads “Thinking” with32px left padding (60% more than its previous20px); later blocks remain “Thinking...”.
- Pause: 1.38–1.99s; spinner continues.
- remainingTrack: 1.99–6.63s (duration4.64s), ease `[0,0,.6,.5]`.
- spinnerExit: 6.61–7.06s; worldFade / agentWhiten: 6.62–7.12s.
- handoff: 7.1–7.15s (DialKit minimum50ms); midpoint switches exclusive ownership on the matching plateau.
- overviewZoom: 7.27–9.57s, eased logarithmic 10×→1× camera.
- blueWave: 9.46–13.46s; heroDim: 9.99–10.88s. These intentionally overlap.
- DialKit and Remotion both end at18s (540frames), leaving a4.54s final hold after the wave.
- DialKit clips retain live current bindings. Shared sampling drives browser inspection and Remotion; duration constant drives both composition lengths.

## Checks / decisions
- 🟢 Tests cover 8041 on-track centered samples, no overlapping blocks, full mask bounds, exact Bash length, all turns/icons matched, corner outlines, terminal chat, scale entrance and pause.
- 🟡 Keep travel clips sequential when tuning; overlapping clips add their distance contributions.
- 🟡 Direction choices are authored in geometry.ts; repeated text dimensions derive tile positions. Rerun geometry tests after route changes.
- 🟠 Self-crossing routes need segment-specific reveal masks; current layout has no crossings.
- 🟡 Port browser-tuned values to defaults before production export.

## Matched overview handoff
`Sequence.tsx` selects Snail or independent `OverviewScene.tsx`; `overview.ts` owns pure bridge/geometry. No DOM measurements, layoutId, previous-frame state, snapshots, or wall-clock animation. Figma 4724:10384 / 4724:10520: 15×9 cells, 148px squares, 2px gaps, centered hero at (640,360). At 10× its 12px dot matches Snail's 120px circle, and the 1480px square extends beyond all four video edges. Zoom to1× reveals the cropped 2248×1348 grid. Stable row/column IDs support later overview choreography.
- 🟢 Shared sample and live clip.current channels drive the same bridge.
- 🟢 Verified: TypeScript and both geometry suites pass; Remotion frames495/496 have zero differing pixels. Browser/export frames496,525,567 match exactly; both palette browser seams match.
- 🟡 Cleaned Snail renders only its backdrop/circle: invisible filtered descendants changed Chromium antialiasing. Overview projects the hero separately using the same radius60 primitive at scale10; preserve this seam when adding effects.
- 🟡 Screenshot pixel/geometry checks are verified; subjective motion pacing still needs author review.
- 🟡 Keep cleanup complete before handoff and zoom after handoff; reordering can create an intentional hard cut.
- 🟡 New timeline persistence ID resets old saved timings. Both authoring and export are intentionally capped at18s.

Run `pnpm typecheck`, `pnpm exec tsx src/experiments/micro-06/geometry.test.ts`, and `pnpm exec tsx src/experiments/micro-06/overview.test.ts`.
Browser: `?experiment=micro-06&time=16` inspects the final chat. Omit time for DialKit authoring.

## Blue wave
Figma target4726:11214: all cell backgrounds settle to #1a1a1a; dots stay #85bcff at40% alpha, except hero at100%. `wave.ts` is a pure per-cell sampler shared by live DialKit and exports; no stateful crossing events. Crest uses increasing screen-space x+y (Cartesian y=x+k with decreasing k when y points upward). Cell starts easing toward #23272c on first contact at its top-left corner, then fades independently. Dot changes when crest crosses its center. Full offscreen grid participates, so the diagonal naturally enters/exits the viewport. Last cell fully settles before phase1; no fade snap at clip end.
The persisted **Blue wave — % of clip** panel exposes **Tile fade in** (0–5%, default3.5%) and **Tile fade out** (0.5–50%, default45%). At the default4-second clip these are0.14s and1.8s. Both use smoothstep easing; fade-in0 restores the instant crest. Bounds ensure even the final offscreen cell settles by clip end. Controls never change crest speed or dot timing. Deterministic `?time=` inspection uses committed defaults; live playback uses the dials. Remotion accepts `waveEnvelope:{fadeIn:0.035,fadeOut:0.45}` as fractions, not percentages.
Run `pnpm exec tsx src/experiments/micro-06/wave.test.ts`. Inspect19.6s for gray,21.1s for wave,24.5s for final blue.
Verified: typecheck and all three suites pass; browser/Remotion frames591,633,660,735 have zero differing pixels. Final DOM has135 activated cells, hero #85bcff, other dots #85bcff at0.4 fill opacity. Subjective motion pacing remains for author review.
