# Animation 21 — Introducing Flow-1 2

A standalone 13.3s / 399-frame, 1280×720 sequel to Animation 13. Existing Issue clusters Animation 20 (`micro-20`), Ultimate3, original-cut defaults and media are unchanged.

- Preview: `http://localhost:5180/?experiment=introducing-flow-1-2`
- Inspection: append `&time=4.2` (beads entering), `&time=5.2` (string), `&time=7.5` (spread), or `&time=8.97` (exit).
- Remotion: `IntroducingFlow1-2`, 30fps. **Copy export props** captures current timings, curves, endpoints and appearance controls for the shared renderer.
- Persistence IDs remain `introducing-flow-1-2-timeline-v1` and `introducing-flow-1-2-appearance-v1`. Existing authored settings are not reset.
- Cover default: **Split doors** in editor, scene and export. Saved appearance choices remain intact.

## Current Figma references

Figma file `VEbMxK1qMXzqjAVJaSQMPs`, nodes **4844:7684** and **4844:8056**, retrieved through Figma MCP metadata and design context. Reference data and fetched SVGs are under `/tmp/flow-1-2-reference/{string,spread}*`.

The implementation reuses the original continuous world, camera, grid, title, cloud renderer and engine. It uses normal React/CSS, not the generated Tailwind scaffolding or screenshots.

## Choreography

1. Reuse the opening clouds and lowercase **flow-1** title.
2. Descend to the intelligence scene. A vertical gray **string slides in from the left**, settling at x=280: the updated score / dot / name row shifted 10px right to align the beads with a grid line. The intelligence headline is now at x=640 / y=60, as in the new frame.
3. Six **beads rise from below the artboard along the string**, including the blue flow-1 dot. The highest bead leads so later beads do not pass through it: opus → sonnet → flow-1 → sol → gemini → luna. Each dot and its label move together; all circles start at 20px. flow-1 grows to 60px during the horizontal spread.
   - String: 2.77–3.52s, following the supplied timing defaults.
   - One **Beads entry** bar: 2.88–4.28s. Beads travel for 0.85s each, starting at 2.88 / 2.99 / 3.10 / 3.21 / 3.32 / 3.43s. The sequence overlaps the string slide, as requested. Peer visibility still follows `modelPoints` at 3.49s.
   - **Bead stagger seconds** is the gap between adjacent beads, default 0.11s. Set it to zero for simultaneous motion. The bar duration covers the entire sequence; resizing it adjusts each bead's travel duration. Large gaps clamp to fit all six within the bar, retaining at least 50ms travel—lengthen the bar for wider gaps.
   - The six old bead tracks are replaced by `beadsEntry`. Its linear `clip.current` is the group clock; `beads.ts` applies the supplied `[.45,0,.55,1]` easing per bead through DialKit's native evaluator. Changing the bar's curve/endpoints warps the group clock. Existing `ballEntry` remains the string slide and `modelPoints` remains peer visibility. The stagger dial is included in copied export props and shared by preview and Remotion.
4. At 5.41s, spread over 1.54s horizontally into the traces-per-dollar graph. The vertical string follows flow-1 to x=1150; its horizontal crossbar appears during the spread. No camera or settled-dot Y movement occurs here.
   - All model labels use the Figma lowercase shorthand and 24px type. Actual description F1 scores appear to the left of the beads in the first scene, then fade out during the spread. Figma's repeated `90.4` / `sonnet-5` placeholders are not copied as data.
   - flow-1's label starts at x=310 / y=254, beside its dot, and moves to x=1019 / y=296 below-left in the spread view.
   - GPT-6 Luna's label moves from the right to the **left** of its dot.
   - GPT-6 Sol's dot and label stay the same gray as the other peers throughout.
5. **Axes:** both containers enter together at 6.1–6.6s, only for the full graph. The intelligence-axis panel slides in from the left. The bottom traces-per-dollar panel spans the full artboard width (x=0–1280), sits behind the Y-axis container (`z-index:1` versus `2`), and slides up at 6.1–6.6s. They slide back left/down at 8.02–8.52s and 8.08–8.58s, respectively—both fully clear before the camera starts at 8.64s. Both containers use the retained `xAxisEntry` DialKit track, with independent exit tracks; the former `yAxisEntry` is superseded and no longer shown as a separate control. This also keeps older saved configurations from revealing Y early. A descent visibility guard also prevents opaque panels leaking into the engine after manual retiming. Y ticks are 80%, 75%, 70%, 65%, 60% at y=120, 240, 360, 480, 600: integer percentages every two grid squares. X ticks are 0–800 traces/$ in steps of 100, spaced 136px apart starting at x=120. Peer positions use those exact scales. The X title sits 40px below the axis top and 8px right of center, independently of subtitle overlap. The Y title sits beside its numbers. The bottom caption names the actual X metric, rather than repeating the Y-axis placeholder.
6. At 8.64s, the camera descends toward the engine while the **flow-1 string, dot and label slide right** by 330px. They clear the right edge by 9.3s. This has an independent `stringExit` track, defaulted to the camera descent's start/duration. The peer dots only leave with the descending camera.
7. Continue the existing engine and cover choreography. The former 240px between-statistics camera pan is included in the engine descent, preserving Animation 13's final engine framing.

The string and gradient circle use CSS primitives matching the supplied SVG (`#808080` 1px string, `#a8caff` → `#75abff` circle). They are separate so the string can arrive before its beads. The older local crosshair asset is preserved but no longer rendered by this scene.

## Data and deliberate visual exceptions

Original source: `../lmnr-02/frontend/components/landing/sections/flow-one/benchmark-data.ts:8–17`.
The current labels include user-approved updates to flow-1 **74.1%**, Opus 5 **84.8**, Sonnet 5 **77.3**, and GPT-6 Sol **72.8**; the original source hash below predates those overrides.
Original source SHA256: `065d89088ffd927ed7171eaefe1e74cc6430dc17a7a51034b2575e84b4a06414`.

These are full-benchmark **description F1 percentages** and **measured traces per dollar for rendered traces under 16K tokens**. `metrics.ts` keeps exports independent of another local worktree.

| Model | Description F1 | Traces/$ |
|---|---:|---:|
| flow-1 | 74.1 | 756 |
| Claude Opus 5 | 84.8 | 7 |
| Claude Sonnet 5 | 77.3 | 11 |
| GPT-6 Sol | 72.8 | 37 |
| GPT-6 Luna | 63.8 | 632 |
| Gemini 3.8 Flash | 65.3 | 14 |

- Peer F1 values use a fixed 85% at y=0 / 60% at y=600 scale, with clean 5-percentage-point Y ticks. A **32px minimum point Y** keeps the top label inside the frame: Opus displays **84.8** at Y=32 rather than its unclamped Y=4.8. Other peers retain their metric-derived positions. This is a presentation exception, not a change to the score.
- **flow-1 deliberately settles at Y=256.8px**, giving it the same **36px** gap above GPT-6 Sol as Gemini has above GPT-6 Luna. This is a readability adjustment, independent of the displayed **74.1%**; 32px-high label boxes retain 4px clearance.
- All first-slide bead centers sit on x=280, aligned to the grid: `(280 − 40) / 60 = 4`. This shifts the updated Figma row 10px right. The first/spread X anchors are unchanged.
- Final X maps 0 traces/$ to x=120 and each additional 100 traces/$ to another 136px. The exact position for 756 is x=1148.16, but **flow-1 stays pinned at x=1150**, a deliberate 1.84px discrepancy within the approved ±15px tolerance. Peers use the exact mapping and remain clear of the left axis panel (ending at x=100). Luna therefore moves far right; its label stays inside the artboard by flipping left.
- **20x** is approximately flow-1 versus GPT-6 Sol: `756 / 37 ≈ 20.43`, not a comparison against every model.

## Authoring and verification

Live preview consumes real `clip.current` values. Arbitrary/reverse inspection and Remotion share DialKit's curve evaluator, explicit from/to endpoints, physics springs and native 50ms minimum bar duration. There are no wall-clock timers, CSS keyframes, or export-only animation paths.

`beads.test.ts` verifies the supplied timing/curve defaults, the single-bar stagger, gap limits, and live/export/reverse sampling. `geometry.test.ts` covers the dataset, entry staggering, retiming the shared bead bar, string/grid alignment, horizontal spread, labels, rightward exit, axes entering/exiting before descent, axis/data clearance, split-door defaults, original camera/cloud endpoints and live/export parity. Browser fixtures under `/tmp/flow-1-2-reference/` inspect actual layout, point movement, labels and errors against the existing preview server. Historical initial-version checks are not evidence for later refinements; consult the latest task results. Automated geometry checks do not establish subjective visual approval.
