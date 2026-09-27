# Soundtrack studies for Animations 10, 13, and 15

## Goal

Create complete hopeful, cheerful soundtracks that follow each animation’s authored timing. Each animation receives three distinct directions: piano-led, digital, and hybrid.

The previous generic soundscapes felt less harmonious because they treated visual events as isolated effects. These studies instead establish a key first, use notes from that tonal family, reserve noise for subordinate movement, and let major visual sections drive chord changes.

## Shared composition rules

- MIDI notes use equal temperament (`C4 = 60`, `A4 = 69`).
- Each version declares a key or mode and stays within it or a closely related progression.
- Piano and pads carry harmony; digital tones and plucks describe motion.
- Puffs and whooshes remain quieter than tonal layers.
- Repeated visual motion is summarized musically rather than sonifying every frame.
- Every score spans the animation’s complete authored duration.

Implementation: `soundscape-prototype/audio-engine.js` and `soundscape-prototype/studies/SCHEMA.md`.

## Animation 10 — continuous agent relay

**Duration:** 12 seconds.

The animation is a continuous loop rather than a sequence of cuts. A colored Write/Read/Thinking/Bash ribbon and grid move toward a cloud-topped agent. The cloud emits a shrinking puff every `0.7s`; the complete stream pattern repeats every `2.857s`; the spinner rotates every `0.526s`.

Primary sources:

- `poc/src/experiments/micro-10/Scene.tsx`
- `poc/src/experiments/micro-10/geometry.ts`
- `poc/src/experiments/micro-10/timeline.ts`
- `poc/src/experiments/micro-10/DitherPhoto.tsx`
- `poc/src/video/MicroAnimation10.tsx`

Reference frames:

- `poc/out/soundtrack-research/animation-10-early.png`
- `poc/out/soundtrack-research/animation-10-middle.png`
- `poc/out/soundtrack-research/animation-10-late.png`

Directions:

1. **Bright Workbench — G major, piano-led.** Broad piano changes every three seconds; plucks acknowledge selected stream boundaries; one chime marks each complete stream cycle.
2. **Pixel Conveyor — D major, digital.** Sine/triangle packets describe the repeating tool stream over a stable tonal bed. Sparse low ticks suggest grid travel without turning it into percussion.
3. **Cloud Garden Relay — A major, hybrid.** Pads and sparse piano provide continuity while rounded plucks follow the exact `0.7s` cloud-puff cadence.

Study data: `soundscape-prototype/studies/animation-10.js`.

## Animation 13 — Flow-1 journey

**Duration:** 13.3 seconds.

This animation moves through one continuous world: cloud-framed title, benchmark percentages, trace analysis, engine activation, and final cover. Its sound should therefore feel like one developing thought rather than several unrelated scenes.

Important authored cues:

- `0.45–1.35`: cloud reveal
- `2.11–3.71`: zoom, descent, dot exit, and cloud exit
- `3.28–3.99`: benchmark heading, rows, percentages, and count
- `6.10–7.43`: analysis transition, six-row count, and bars
- `8.64–9.30`: camera descent to engine
- `9.20–10.56`: activation, lines, cover descent, and tint
- `10.56–13.30`: resolved hold

Primary sources:

- `poc/src/experiments/introducing-flow-1/README.md`
- `poc/src/experiments/introducing-flow-1/timeline.ts`
- `poc/src/experiments/introducing-flow-1/Scene.tsx`
- `poc/src/experiments/introducing-flow-1/geometry.ts`
- `poc/src/experiments/introducing-flow-1/sample.ts`
- `poc/src/video/Root.tsx`

Reference frames:

- `poc/out/soundtrack-research/animation-13-early.png`
- `poc/out/soundtrack-research/animation-13-middle.png`
- `poc/out/soundtrack-research/animation-13-late.png`

Directions:

1. **Clear Horizon — D major, piano-led.** Felt-like piano treats the title, benchmark, analysis, engine, and cover as phrases in one progression. Six restrained notes represent six analysis rows.
2. **Signal Garden — C Lydian, digital.** Clean sine and triangle packets make the data feel alive. The raised fourth adds brightness without sounding childish or arcade-like.
3. **Built to Flow — A major, hybrid.** Piano supplies confidence, plucks make count changes legible, and a single digital lift marks activation.

Study data: `soundscape-prototype/studies/animation-13.js`.

## Animation 15 — warnings into work

**Duration:** 7 seconds.

The opening is organization, not alarm: 47 warnings appear, travel smoothly, and resolve into six stable clusters. The second half introduces an agent window, prompt, send action, CLI command, SQL query, predicate, inline warning, reading hold, and exit.

Important authored cues:

- `0.00–1.19`: warning appearance
- `1.15–3.80`: randomized travel starts and direct flights
- `3.80–4.48`: six clusters merge and settle
- `4.26–4.73`: agent window enters while cluster resolution finishes
- `4.27–5.09`: prompt, issue text, badge, and warning form
- `5.08–5.26`: message sends
- `5.26–5.92`: command and SQL lines type
- `5.92–6.62`: completed reading hold
- `6.62–7.00`: window exits

Primary sources:

- `poc/src/experiments/micro-15/README.md`
- `poc/src/experiments/micro-15/timeline.ts`
- `poc/src/experiments/micro-15/agent-window.ts`
- `poc/src/experiments/micro-15/AgentWindow.tsx`
- `poc/src/experiments/micro-15/sample.ts`
- `poc/src/experiments/micro-15/travel.ts`
- `poc/src/experiments/micro-14/geometry.ts`
- `poc/src/experiments/micro-14/Scene.tsx`

Reference frames:

- `poc/out/soundtrack-research/animation-15-early.png`
- `poc/out/soundtrack-research/animation-15-middle.png`
- `poc/out/soundtrack-research/animation-15-late.png`

Directions:

1. **Gathered Resolve — D major, piano-led.** Scattered piano voicings gather into consonance. Typing is represented at phrase level rather than with a click per character.
2. **Signal Lattice — A Mixolydian, digital.** Spatial packets map distributed travel and convergence; one motif represents each semantic text line.
3. **Capable Hands — E major / C-sharp minor, hybrid.** Warm piano owns intention and resolution, clean plucks own data movement, and the investigation briefly shades into the relative minor.

Study data: `soundscape-prototype/studies/animation-15.js`.

## Source-derived synchronization pass

The soundtrack timing manifest is generated directly from the DialKit timelines, deterministic samplers, geometry constants, and exported video defaults by `poc/scripts/generate-soundtrack-timings.ts`. Study files no longer own action timestamps.

- Animation 10 derives every ribbon entrance/exit, all 17 cloud emissions, grid periods, and spinner landmarks from `STREAM_SEGMENTS`, geometry defaults, and the 12-second source clock.
- Animation 13 uses the exact authored `at` and `duration` for every DialKit clip. It also derives all 11 visible sparkle ticks (165 dot state changes) and continuing engine/cover loop wraps from source formulas.
- Animation 15 derives all 47 individual warning appearances, all 47 individual travel starts, 18 cluster transition clips, and every literal typing-character boundary from the deterministic source functions.
- Continuous motion effects span the full authored clip duration rather than using manually estimated windows.
- Every action cue has a human-readable label shown live in the explorer.

Cue totals by version:

- Animation 10: **80 / 76 / 76**
- Animation 13: **71 / 65 / 65**
- Animation 15: **268 / 262 / 262**

## Validation

- `soundscape-prototype/tests/source-timing-parity.test.js` fails whenever the generated manifest differs from the current animation source.
- `soundscape-prototype/tests/source-derived-events.test.js` verifies all nine versions consume those generated timings.
- All study and application files pass `node --check`.
- All event kinds are supported by the synthesis engine.
- Every event has a label and ends within its animation duration.
- All nine soundtrack versions schedule successfully in Chrome without runtime exceptions.
- The live cue display and timeline contain the expected event count for every version.
- Each study’s three reference images load at `1280×720`.
