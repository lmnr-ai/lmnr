# Micro 09 — Cloud reveal

A deterministic six-second transition between Figma frames `4733:23727` and `4732:23137`.

- The 15×9, 100px grid remains fixed at `(-110,-90)`.
- All 15 colored markers use the exact SVG exports returned by Figma MCP.
- Two copies of Figma `image 219` animate independently between the exact start/end rectangles.
- Cloud movement uses one symmetric ease-in-out curve. `Cloud layout → finalYOffset` adds to both existing destination Y coordinates and blends in over the transition; it does not replace their coordinates. The grid itself never moves.
- The centered Figma text node `4739:24553` renders “Signals” in local JetBrains Mono Regular at 180px, layered above the grid and below the clouds.
- There are no sparkle phases or decay. A constant seeded clock drives every change. Given `triangleProbability = X`, a dot becomes a triangle with weight `X`, while a triangle becomes a dot with weight `1 − X`, producing an average X-density equilibrium.
- Triangle color changes use a separate constant probability throughout the animation.
- `Sparkle → clockFrequency` controls the number of sparkle ticks per second. `triangleProbability` seeds the first frame and controls ongoing target density. `stateChangeProbability` is the constant per-tick state-change opportunity. `colorChangeProbability` independently controls recoloring, and `seed` controls all randomness.
- `isolationWeight` favors cells with fewer edge-sharing triangle neighbors. A globally solved offset keeps the adjusted probabilities summing to the same `cellCount × triangleProbability`, so the spatial effect is zero-sum. `0` disables the bias.
- Remotion exposes the same inputs. Preview URLs may override them, for example `&seed=209&clockFrequency=10&triangleProbability=.11&stateChangeProbability=.1&colorChangeProbability=.2&isolationWeight=2`.
- The cloud texture is filtered with the same Paper Image Dithering approach as Micro 08: Bayer8 luminance quantization with the original unsnapped alpha. Both clouds share one texture and WebGL context; their premultiplied-alpha compositing preserves Figma layer order.
- Preview: `?experiment=micro-09`. Add `&time=0` or `&time=6` for deterministic endpoint inspection.

## Validation

```sh
cd poc
pnpm typecheck
pnpm exec tsx src/experiments/micro-09/geometry.test.ts
```
