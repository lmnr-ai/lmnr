# DialKit timeline as an authoring layer for Remotion

## Verdict

Yes. This is feasible, and the repository already contains a working proof of the core architecture.

DialKit should be the interactive animation editor and transport. Remotion should be the offline frame renderer. They must share the same serializable animation definition and deterministic sampler.

Calling Remotion a “compiler” is a useful mental model, although technically it renders a React composition frame-by-frame and encodes those frames and audio into video.

## Recommended architecture

```text
animation defaults + tuned overrides
              │
       pure sampler(time)
          ┌───┴────┐
DialKit preview   Remotion render
 timeline.time    frame / fps
```

1. Define clips, sequences, property tracks, values, and curves in a shared module.
2. DialKit edits timing and values and provides playback/scrubbing.
3. The preview renders values sampled at `timeline.time`.
4. Save tuned overrides as JSON in the project—not only browser localStorage.
5. Remotion receives that JSON through input props or imports a checked-in artifact.
6. During rendering, sample at `frame / fps` and pass those values to the same scene component.

DialKit’s dock does not need to run inside Remotion.

## Why it works

DialKit documents clips with second-based `at` and `duration`, single transitions, sequences, and independent property tracks. Its returned state includes `time`, `playing`, `duration`, and transport methods. Timeline clips expose `current`, the value sampled at the playhead.

Remotion exposes the current frame through `useCurrentFrame()`. Therefore a render time is deterministically derived as `frame / fps`.

The local POC already shares a scene and sampler between these clocks:

- `poc/src/tune/App.tsx`: DialKit supplies `timeline.time`.
- `poc/src/video/TraceView.tsx`: Remotion supplies `frame / fps`.
- `poc/src/anim/timeline.ts`: shared timeline config and sampler.
- `poc/src/scene/TraceScene.tsx`: shared visual component.

The POC’s parity script reports identical deterministic samples across the two drivers.

## Important constraint: sample values; do not launch runtime animation

Bind rendered styles to sampled `current` values. Do not hand `animate` and `transition` to a wall-clock animation runtime during Remotion rendering.

DialKit explicitly warns that hiding the dock does not stop the timeline and that its sampled springs and Bézier curves are not guaranteed to match every frame of another animation runtime. Sharing DialKit’s own pure sampler on both paths avoids cross-runtime curve differences.

This relies on DialKit’s internal timeline helpers used by the POC (`parseTimelineConfig`, `computeStaticTimeline`, and `computeClipState`). If these are public exports but not stable documented APIs, pin the DialKit version and wrap them behind one local module.

## Timing and frame snapping

DialKit authors time in seconds; Remotion renders integer frames. At 30fps, normalize important boundaries with:

```text
frame = round(seconds × 30)
seconds = frame / 30
```

Use one shared integer frame for adjacent boundaries to avoid gaps or overlaps. A project-specific export step should validate and normalize the tuned data before rendering.

## Persistence and export

DialKit’s `persist: true` stores values, presets, and the active preset in browser localStorage under `dialkit:${id}`. This is convenient during tuning but insufficient as the production source of truth.

Add an explicit **Save animation JSON** action. Commit or otherwise preserve that JSON, then pass it to Remotion as input props or import it. This makes renders reproducible in CI and on another machine.

## What DialKit is good for

- Scrubbing and playback
- Moving clips and resizing durations
- Editing sequence boundaries
- Tuning spring and easing controls
- Editing independent properties with different delays and curves
- Presets and rapid visual iteration

## What still needs custom UI

- Audio waveform lanes
- Exact 30fps snapping and boundary validation
- Project-specific animation templates or constraints
- A durable JSON export/import workflow
- Asset management and audio mixing
- Render controls and progress

## Minimal implementation plan

1. Generalize the existing `poc/src/anim/timeline.ts` sampler into a stable animation engine module.
2. Build one real video scene with plain sampled props such as opacity, position, scale, blur, crop, and camera movement.
3. Render that scene in both the DialKit tuning app and Remotion composition.
4. Add JSON save/load with frame normalization and schema validation.
5. Pass saved JSON to Remotion through parameterized rendering.
6. Add parity tests at every frame or representative boundaries.
7. Pin DialKit and add an adapter test around any low-level timeline exports.

## Sources

- DialKit timeline guide: https://github.com/joshpuckett/dialkit/blob/main/docs/timeline.md
- DialKit API reference: https://github.com/joshpuckett/dialkit/blob/main/docs/reference.md
- Remotion parameterized rendering: https://www.remotion.dev/docs/parameterized-rendering
- Remotion `useCurrentFrame`: https://www.remotion.dev/docs/use-current-frame
- Remotion interpolation: https://www.remotion.dev/docs/interpolate
- Existing local proof: `poc/README.md`, `poc/src/anim/timeline.ts`, `poc/src/tune/App.tsx`, `poc/src/video/TraceView.tsx`
