# Animation soundtrack study schema

Each file pushes one study into `window.ANIMATION_SOUNDTRACK_STUDIES`.

```js
{
  id: "animation-10",
  animation: "Animation 10",
  title: "…",
  duration: 12,
  visualSummary: "…",
  keyframes: [{ time: 2, image: "../poc/out/…png", label: "…" }],
  versions: [{
    id: "…",
    title: "…",
    direction: "piano-led | digital | hybrid",
    description: "…",
    key: "C major",
    tempo: 100,
    layers: [{
      name: "…",
      color: "gold | sky | coral | violet | mint",
      role: "…",
      events: [{ time: 0, duration: 1, kind: "piano", notes: [60], velocity: .5, label: "Title settles" }]
    }]
  }]
}
```

Supported event kinds:

- `piano`: `notes` (MIDI[]), `velocity`, optional `brightness`, `release`, `pan`
- `pad`: `notes`, `gain`, optional `wave`, `attack`, `release`, `pan`
- `pluck`: `note`, `velocity`, optional `tone`, `pan`
- `digital`: `note`, `velocity`, optional `toNote`, `wave`, `pan`
- `chime`: `note`, `velocity`, optional `pan`
- `puff`: optional `tone`, `gain`, `soft`, `pan`
- `tick`: optional `note`, `gain`, `pan`
- `whoosh`: optional `from`, `to`, `gain`, `pan`
- `pop`: `count`, optional `note`, `gain`; emits a stereo micro-pop for each simultaneous visual change
- `ratchet`: optional `steps`, `note`, `rise`, `gain`, `pan`; follows a continuous numeric count
- `fill`: optional `note`, `toNote`, `velocity`, `tone`, `gain`, `pan`; combines a tonal rise with filtered air
- `doors`: optional `from`, `to`, `gain`; mirrored mechanical sweeps for a two-sided closure
- `latch`: optional `note`, `gain`, `pan`; low stop plus a short high mechanical click

Every event includes a human-readable `label` describing the exact visual action it accompanies.

## Timing authority

Action timing comes from `timings.generated.js`. `poc/scripts/generate-soundtrack-timings.ts` generates that manifest directly from the animation timelines, geometry, deterministic samplers, and video defaults. Study files may choose timbre, pitch, gain, and labels, but must not duplicate action timestamps. Authored clips use their exact `at` and `duration`; deterministic warning, travel, sparkle, typing, and loop events use their exact source formulas.

Regenerate and verify after animation changes:

```sh
pnpm --dir poc soundtrack:timings
pnpm --dir poc soundtrack:timings:check
```

Composition rules:

- MIDI uses equal temperament: C4=60, A4=69.
- Keep a version in one declared key or a clearly stated closely related progression.
- Noise gestures should be quieter than tonal layers.
- Events must fit within the animation duration.
- Each animation gets at least three meaningfully different versions.
