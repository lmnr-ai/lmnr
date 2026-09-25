# DialKit + Remotion POC

Proves one claim: **DialKit's timeline core is a pure function of time, so the
same animation code drives both the DialKit dock and a Remotion render.**

The scene is the "un-tree everything" beat from `../trace-view-video.md`. The
span rows are real, taken from the trace this repo generates.

## Commands

```sh
pnpm tune       # Vite + DialKit dock at :5180 — scrub and tune
pnpm parity     # headless proof that both drivers agree
pnpm studio     # Remotion Studio
pnpm render     # -> out/trace-view.mp4
```

## Ultimate 3 sound-design handoff

The cloud-agent target is **Animation 18 — Ultimate 3**.

```sh
pnpm install --frozen-lockfile
pnpm tune
```

Open `http://localhost:5173/?experiment=micro-18`. The composition lives in
`src/experiments/micro-18/` and deliberately reuses sibling animation modules.
Its required runtime media is under `public/`. Generated renders, large sound
study exports, dependency folders, and MP4 files are intentionally excluded.
See `src/experiments/micro-18/README.md` and `AUDIO_EXPORT.md` before changing
sound scheduling or export behavior. The final video soundtrack is the offline
"Tactile Glass" score in `src/experiments/micro-18/score/` (`pnpm ultimate3:score`).

Rendering the video on Linux: `AUDIO_EXPORT.md`'s browser exporter hardcodes a Mac
Chrome path. Render silent video with Remotion's own Chrome instead:
`npx remotion render src/video/index.ts MicroAnimation18 out/u3-silent.mp4
--browser-executable <puppeteer chrome>` (see `~/.cache/puppeteer`), then mux with
`pnpm ultimate3:score --video out/u3-silent.mp4 --mp4 out/ultimate3.mp4`.

- Chapter starts after Ultimate 2 fall on x.518s (it runs 14.518s), not on the
  absolute 0.5s grid; score code anchors beats per chapter (`beats(chapter.start)`).
- Retiming clips in settings retimes the score (cues are derived, never hardcoded);
  pass the same `--settings` JSON used for the video render.
- `tsconfig` requires `types: ["node"]`, so `@types/node` must stay a direct devDependency.

## How it works

There is one animation definition and two clocks.

```
src/anim/timeline.ts     TIMELINE config + createSampler()  ← the only animation code
        │
        ├── src/tune/App.tsx     t = timeline.time      (DialKit transport)
        └── src/video/TraceView  t = frame / fps        (Remotion)
                │
                └── src/scene/TraceScene.tsx            ← one component, both paths
```

`createSampler()` calls three functions from DialKit's `dialkit/timeline`
subpath export:

| Function | Role |
| --- | --- |
| `parseTimelineConfig` | config -> clip model |
| `computeStaticTimeline` | resolves tuned values over defaults |
| `computeClipState(clip, t, t)` | **pure sample at time `t`** |

None of them touch React, a clock, or the DOM. `computeClipState` is the bridge.

## The one rule

Bind `clip.current`. Never bind `animate` + `transition`.

`animate` hands the curve to Motion's runtime, which uses a wall clock. That
breaks under render, where wall time does not advance with the frame counter.
`current` is a deterministic sample, so it renders correctly.

This also removes the spring-parity worry. DialKit warns that `current` may not
match Motion's runtime frame-for-frame. That does not apply here, because both
sides use `current` and therefore agree with each other.

## Tuning workflow

1. Run `pnpm tune`. Scrub the dock, drag clips, edit springs.
2. Values live in `DialStore` under panel id `trace-view`, and `persist: true`
   keeps them in `localStorage` between reloads.
3. Copy the values out of the panel and save them to `tuned.json`.
4. `pnpm parity` to confirm the two drivers still agree.
5. `pnpm render`.

`tuned.json` is `{}` today, which means the render uses the values authored in
`TIMELINE`. DialKit resolves overrides over config defaults, exactly as its own
React adapter does.

## Verified

- `pnpm parity` — 0 mismatches across drivers, 1 distinct result from 50
  independent samplers at the same `t`.
- `pnpm render` — 168 frames at 60fps, 364 kB MP4.
- Stills at frames 0 / 36 / 150 match the storyboard beat.

## Known rough edge

Mid-transition, collapsing DEFAULT rows clip their text vertically, so the beat
reads as "squeezing shut" rather than "fading away". Fix it by fading faster
than the height collapses — retime the `purge` clip in the dock. That is the
workflow this POC exists to enable.
