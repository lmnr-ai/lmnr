# Animation 14 — Issue clusters

Preview: http://localhost:5180/?experiment=micro-14

## Current timeline

Only two tracks remain:

- **Appearance**: starts at 0s, lasts **1.01s**.
- **Swapping**: starts at **1.11s**, lasts **2.3s**.

These are the user-authored defaults. The obsolete Small Warning Shrink, Cluster Background Fade, and Large Warning Grow tracks have been removed. Their old persisted values are ignored, not interpreted as hidden delays. Existing Swapping edits and dials retain their persistence IDs. DialKit stays in place for authoring; `App.tsx` includes the requested production handoff comment directly above `useDialTimeline`.

The timeline's total length remains controlled separately by **Timeline Duration** (13.1s by default). This includes the final hold; changing the two clips does not silently change the total duration. Tracks are independently editable. Keep Appearance before Swapping for the intended sequence; deliberately overlapping them allows warnings to appear while moving.

## Appearance

All cells initially show gray dots. Each future warning cell gets a deterministic, seeded start time within the Appearance segment. Its dot scales from 1 to 0 as its triangle scales from 0 to 1. The purple singleton participates too.

**Warning Appearance Duration** (default 0.25s) controls each individual transition. Random starts use the interval from segment start through `segment end − transition duration`, so every transition finishes inside the segment. A short segment caps the individual duration; a zero-length segment completes instantly. The per-cell hash is stateless, so scrubbing, reloads, and retiming never consume randomness or change the order.

## Swapping and immediate warning covers

All 216 occupants retain stable identities. Seeded, immutable, disjoint eight-neighbor swap batches are generated forward from the exact reference layout and replayed backward.

- Gray dots **never swap with other gray dots**.
- Warnings in the same cluster do not pointlessly swap with each other.
- Once a square disperses in the forward walk, proposals that would completely re-form it are rejected. Consequently, the first complete square in reverse playback never splits apart again.
- Readiness is the actual first complete square, not a later identity-sorting step, guessed size timestamp, or end of the global Swapping segment.
- Each square starts its warning cover immediately after its last arriving movement, **before the trailing swap gap**. A group that never moved waits only for its own warning-appearance transitions to finish.
- **Warning Cover Duration** (default 0.8s) controls the simultaneous small-warning shrink, square-background fade, and large-warning growth. Zero makes the cover instantaneous. There is no post-formation delay control.

The first fix mistakenly preserved a delay from old saved merge clips. A regression test now loads those exact old values and verifies immediate onset without resetting storage. Another regression uses seed 5 / 10 steps / 0.1 probability, which previously let a square form and then split again. The generator now prevents that while retaining exact reversible histories.

## Other dials

- **Seed**: starting arrangement, default 209.
- **Dispersion Frames**: simulation-step count, 0–240, default 90. This does not set elapsed time.
- **Swap Probability**: eligible-cell proposal probability, default 0.62.
- **Swap Gap**: stationary fraction after movement within each equal-length step slot, default 0.25. Zero gives continuous movement.
- **Small Cluster Delay**: forward lock fraction for 2×2 groups; 3×3 groups wait half as long and 4×4 groups start immediately. Default 0.60. This makes smaller groups finish earlier in reverse.

At the tuned 2.3s Swapping duration, a rendered 30fps frame may cross multiple simulation steps. Each recorded step remains disjoint and adjacent; increase Swapping duration if every step must be visible separately.

## Rendering and export

`?time=<seconds>` samples current persisted editor timing. Remotion composition `MicroAnimation14` uses the same pure sampler and accepts controls plus `timing: {appearance, swapping}`. Browser localStorage is not automatically exported; pass tuned values as composition props.

The 1280×720 scene, deliberately cropped 18×12 grid, six cluster rectangles, inward borders, singleton, and twelve local SVG assets retain Figma geometry (`4763:6297`, `4763:5274`). The new Animation 15 variant reuses the renderer's optional stationary-dot layer; Animation 14's normal swapping renderer does not enable it.

## Verification

From `poc`:

- `pnpm exec tsx src/experiments/micro-14/appearance.test.ts`
- `pnpm exec tsx src/experiments/micro-14/cover.test.ts`
- `pnpm exec tsx src/experiments/micro-14/dispersion.test.ts`
- `pnpm exec tsx src/experiments/micro-14/sample.test.ts`
- `pnpm run typecheck`
- `pnpm exec vite build`

Tests cover seeded appearance, clip bounds, zero duration, exact reversal, no dot-dot swaps, no post-completion re-dispersion across 150 low-probability seeds, immediate covers with old saved timing, endpoints, geometry/assets, and deterministic seeking. The slow interpolation fixture is intentionally pinned independently of the user-tuned defaults.

Browser checks exercised randomized appearance and complementary dot/triangle scales, Appearance-track resize and reload persistence, removal of obsolete tracks, and immediate cover onset after injecting obsolete saved 10.8s merge values. Browser measurements—not a claimed human visual review—are the verification evidence.
