# Pricing update: 888 vs 38

## Approved decision

Use the screenshot's rows below 100k base-trajectory LLM tokens, taking the
**Flow-1 (4k output)** column. Keep existing intelligence/F1 scores unchanged.
The user explicitly approved displaying **888 versus 38 traces per dollar**,
while retaining the conservative **20x** headline and existing narration.
No recordings, soundtrack beds, or timeline timings were changed.

## Source precision

The included row counts are 3, 71, 42, 70 and 38: **224 traces**.
Displayed per-trace costs:

| Tokens | n | Flow-1 (4k output) | GPT comparator |
|---|---:|---:|---:|
| <5k | 3 | $0.0004 | $0.013 |
| 5–10k | 71 | $0.0007 | $0.019 |
| 10–25k | 42 | $0.0010 | $0.025 |
| 25–50k | 70 | $0.0012 | $0.027 |
| 50–100k | 38 | $0.0020 | $0.040 |

Using `sum(n) / sum(n × cost)` gives approximately **885.73 / 38.30** traces/$.
The screenshot's rounded parenthesized Flow rates instead imply approximately
887.40. The final **888 / 38** figures are the user's chosen presentation values,
not a claim that the screenshot supplied full-precision inputs. The screenshot
has no intelligence/F1 measurements, so those scores remain unchanged.

## Layout and scope

- Exact count: **888 total dots**, of which **38 are orange** and **850 blue**.
  Orange is the comparator subset of Flow's total, not 38 additional dots.
- User-revised layout: **20 full rows of 43, then 28 left-aligned dots**.
  No side extensions. The Flow number's right edge aligns with the final
  occupied cell at x=780 rather than the full field's right edge at x=1080.
- Preserve 20px grid pitch, 6px default dots, grid phase, colors and native reveals.
- Move labels above/below the taller field, on whole-cell boundaries.
- Compensate Ultimate3's existing horizontal grid-origin offset by whole cells,
  centering the odd-width full rows on the nearest compatible cell (x=650).
  Compensation
  stays fixed in world coordinates throughout the continuous return to Signals.
- Standalone return travels 32 whole rows instead of 30 so the taller bottom
  cards leave the viewport even at the minimum 20px opening cell size. Clip
  timings and end grid phase stay unchanged; Ultimate3 retains its own camera.
- Shared renderer updates apply to Ultimate3 and standalone Animations 23/24.
  Intelligence metrics and original source13/source20 renderers are untouched.

## Verification

`micro-23/pricing-data.test.ts` asserts exact counts, 20 full 43-dot rows,
the left-aligned 28-dot remainder, cell alignment, number alignment and label clearance. Existing native timeline and
preview/export parity tests use the new endpoints (including authored from/to).
The Ultimate3 browser suite checks real DOM row counts, final-cell alignment, labels, 888/38 values,
renderer-cut continuity, and unchanged intelligence/engine/Issues artwork.

Historical checks before the user's 43-column revision: **233 tests passed**,
zero failures; TypeScript and production
build passed. Installed-Chrome suites for Ultimate3, Animation23 and Animation24
passed. Actual Ultimate3 DOM reports 888/38 and field center x=640, with labels
clear of the dots. Intelligence and Issues comparison rasters are identical;
engine differences are limited to two one-channel rounding pixels. Return cuts
pass their bounded circle-edge/rounding checks. Animation23 opening/ending
rasters match exactly, as do both Animation24 insertion boundaries.

The 43-column revision passed **234 tests**, typecheck, production build and
all three installed-Chrome browser suites. Actual DOM checks confirm 43-column
rows, the 28-dot remainder and the Flow number's final-cell alignment. The
intelligence, engine and Issues comparison rasters are identical; the return
handoff differs only in five permitted circle-edge samples. Standalone opening/
ending and both Animation24 insertion boundaries match exactly.
No new full video export or subjective visual approval is claimed.
