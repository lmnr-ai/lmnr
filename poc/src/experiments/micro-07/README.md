# Micro Animation 07 — Straight Snail / Reasoning

A deterministic 18-second DialKit and Remotion scene derived from Micro 06.

## Route
- Existing blocks form one horizontal track. Both later repeats omit their four icon+word pairs (Read, Thinking, Write, Bash). The middle repeat's opening purple/blue pair is also removed; only the final purple chat icon remains before the sliding blue card. Geometry closes the gaps automatically. The first four stops and sliding cards remain unchanged.
- Invariant: word at the start, then icon/word alternation throughout the remaining horizontal and upward route. Removals always take a preceding icon and its following word together; a regression test checks every block.
- The final segment rises six 120px grid units, taking the agent above the viewport.
- Each block has a local reveal rectangle derived from route distance (`routeMask.ts`): left-to-right on the horizontal track, bottom-to-top on the upward leg (including square icons).
- On approach, the elbow reveals only to the agent center. At the turn a circular region is exposed underneath the loader; on ascent the right half opens bottom-to-top. This prevents premature yellow corner peeking while keeping the visited left half visible. The corner is fully revealed 60px into ascent.
- Clips live inside each header's lift transform. Fully revealed blocks stop using a reveal clip, so lifting does not intersect a shared route mask or clip neighboring cells. No stroke caps, joins, or widened corridors are involved.
- The final half-cell beyond the terminal agent center remains hidden (offscreen), rather than popping visible at completion.
- Camera follows the agent horizontally, then remains centered on the elbow during the rise.

## First four word-block stops
- `agentEnter`: 0.00–0.23s.
- `firstThinking`: 0.48–0.74s; stop at distance 300.
- `firstRead`: 1.63–2.14s; stop at distance 660.
- `secondThinking`: 2.41–2.93s; stop at distance 1140.
- `firstWrite`: 3.24–3.86s; stop at distance 1500.
- Each has an independent DialKit bar, eases to rest, and holds until the next clip. Square icons are traversed between stops, not counted as stops.
- Stops put the circle center at the word block's trailing edge (half the circle extends beyond it), preserving the original Thinking stop convention.
- `remainingTrack`: 3.92–6.67s (2.75s), from Write through the elbow to the final point. One continuous easing `[0.26,0.08,1,1]`; no separate `elbowRise` authoring bar. The elbow crossing time follows route distance.

## Reasoning sequence
- `bubbleEnter`: 6.28–6.63s. Figma `4730:12983`, positioned half a cell right and down from the elbow center so its top-left aligns to the grid intersection; top-left anchored scale and opacity.
- `cameraReturn`: 6.95–8.20s, elbow to the later horizontal blue Thinking center.
- `redThinkingLift`: 7.01–7.28s.
- `readLift`: 7.44–7.69s.
- `thinkingLift` (blue): 7.81–8.10s.
- Each independent lift bar moves its header up one grid unit and reveals its transparent paper simultaneously. Paper has a fixed viewport at the original block top. Its bottom starts aligned with the closed block's bottom; it descends 140px until its top aligns with the opened gap. A clip following the door edge hides paper behind the rising header. There is no separate paper-reveal bar.
- `highlight`: 8.40–9.50s. Two aligned text layers use an animated left-to-right `clip-path`; coral `#f47069`, highlighted text `#0e0f21`.

The overview handoff, world fade, spinner exit, whitening, zoom, hero dim, and blue wave are intentionally absent from this experiment.

## Determinism
Live authoring keeps DialKit `clip.current` bindings. Query-time previews and Remotion use the same pure `sampleSnail(time)` sampler.

## Checks
```sh
cd poc
pnpm typecheck
pnpm exec tsx src/experiments/micro-07/geometry.test.ts
pnpm exec tsx src/experiments/micro-07/routeMask.test.ts
# Requires the tuning server on port 3002 (override with PREVIEW_URL).
pnpm exec tsx src/experiments/micro-07/typography.browser.test.ts
```

Remotion must import Micro 07's stylesheet through `src/video/styles-entry.ts`.
Without it, paper inherits 16px system text instead of 24px SnailMono. The browser
regression compares preview text with an isolated document using the export
stylesheet entry, checks the font advance, and preserves Micro 06's label width.
