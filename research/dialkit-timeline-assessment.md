# DialKit timeline assessment for audio-aligned Remotion slides

## Verdict

DialKit is useful as the **timing editor**, but not as the complete audio-editing interface. Its timeline edits clips in seconds and supports scrubbing, moving clips, resizing clip edges, sequence boundaries, persistence, and copy/export. It does **not document an audio track, waveform lane, frame snapping, or Remotion integration**. Keep audio playback and the waveform in a small host UI, synchronize that player with DialKit through `time`, `playing`, `seek()`, `play()`, and `pause()`, and translate finalized seconds to Remotion frames.

The repository already contains a relevant proof of concept under `poc/`: it shares a pure timeline sampler between a DialKit tuning app and Remotion. That architecture should be reused, while replacing the demo animation clips with image-change clips.

## What fits

- Every clip has `at` and optional `duration`, both in seconds.
- Timing-only clips may contain only `at` and `duration`; this fits still-image intervals.
- A sequence exposes draggable boundaries between steps; this fits segments such as A → B → C where internal switch points must be tuned.
- The dock supports play/pause, replay, ruler/playhead scrubbing, moving clips, resizing edges, zooming, and panning.
- The returned controller exposes `time`, `playing`, `duration`, `play()`, `pause()`, `replay()`, and `seek(seconds)`.
- `persist: true` retains edits and presets. The dock's Copy action exports tuned timing/config instructions.

## Gaps

- The official timeline guide does not expose an audio or waveform track.
- Time is represented in seconds, not integer video frames. For 30fps output, convert with `Math.round(seconds * 30)` and ensure adjacent cuts share the same rounded boundary.
- DialKit's Copy output is designed as a production handoff instruction, not necessarily the exact mapping JSON schema required here.
- DialKit warns that its sampled curves may differ from another animation runtime. For still-image cuts this is irrelevant; for animation, use the same pure sampler in both preview and Remotion, as the existing POC does.

## Recommended shape

1. Convert the supplied mapping into one DialKit timeline group per transcript segment.
2. Single-image segments become one timing marker/clip.
3. Multi-image segments become sequence clips with one step per image; initialize step durations evenly, then manually drag boundaries.
4. Build a lightweight preview above the dock containing the current 960×540 image, `<audio>`, and waveform.
5. Synchronize both directions:
   - DialKit time changes seek the audio.
   - Audio playback advances/seeks the DialKit timeline.
   - Avoid two competing clocks; designate audio as master while playing and DialKit as master while scrubbing.
6. Add a project-specific Export JSON button that writes exact image intervals `{image,start,end,startFrame,endFrame}`. Do not depend solely on DialKit Copy.
7. Feed that exported data to Remotion. Render time is `useCurrentFrame() / fps`; select the image interval containing that time.

## Existing local proof

`poc/README.md` documents a shared timeline configuration and pure sampler:

- DialKit tuning uses `timeline.time`.
- Remotion uses `frame / fps`.
- Both render through the same scene component.
- `computeClipState` samples deterministic state at an explicit time.

This validates the key integration pattern, though the POC currently targets an animation rather than audio-aligned still slides.

## Sources

- DialKit timeline guide: https://github.com/joshpuckett/dialkit/blob/main/docs/timeline.md
- DialKit homepage and timeline overview: https://www.dialkit.dev/
- DialKit API reference: https://github.com/joshpuckett/dialkit/blob/main/docs/reference.md
- Local integration proof: `poc/README.md`, `poc/src/anim/timeline.ts`, `poc/src/tune/App.tsx`, `poc/src/video/TraceView.tsx`
