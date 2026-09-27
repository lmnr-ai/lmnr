# Animation 18 — Ultimate 3: implementation plan

Status: planned; implementation assigned to a GPT Sol worker after plan approval.

## Goal

Combine five CHAPTERS in this order: Animation 17 Ultimate 2 → Animation 16 Cost of a trace → Animation 13 Introducing Flow-1 → Animation 15 Issue clusters 2 → new Conclusion. One main timeline has exactly one segment per chapter; each chapter has its own granular timeline. Keep the original experiments unchanged.

New editor: `?experiment=micro-18`; composition `MicroAnimation18`, 1280×720 at 30fps. Continue using the existing preview at http://localhost:5180.

## Verified source facts

- `micro-17`: shared `Micro17Scene`, `sampleMicro17`, serializable timing/controls; 22s default. Subtitles have just been removed, including their tracks. Keep them absent.
- `micro-16`: shared `Micro16Scene` and `sampleMicro16`; 17s baseline with endpoint-aware duration and final hold. Preserve independent smoke fade/shrink/minimum scale and frozen budget ending.
- `introducing-flow-1`: shared `IntroducingFlow1Scene`, 13.3s. `geometry.ts` computes camera translation from independent vertical sections (870px, 240px, 1080px); clouds are outside its inner world transform. Existing `cloudReveal` drives `cloudProgress`; `cloudExit` separately drives `900 * progress` vertical exit. The current static sampler only accepts time, so Ultimate 3 needs a small local adapter for edited timing/easing, not a renderer copy.
- `micro-15`: CURRENT source is 6s, not the historical 16.5s. `agent-window.ts` currently enters at 2.83/.47 and exits at 5.34/.38. Reuse the current source defaults. Account for actual clip endpoints plus appearance/travel readiness under retiming; do not blindly rely on its 6s helper.
- Installed DialKit exposes `useDialTimeline`, `DialTimeline`, public `TimelineStore` transport methods, and public DialStore/controller update methods. `DialTimeline` has no per-timeline ID/filter prop. Do not invent unsupported props or edit node_modules.
- Figma node `4786:16868`: 1280×720, background #1A1A1A. White logo group is x=513.5367431640625, y=338.0462646484375, width=252.92657470703125, height=43.907466888427734. Exact local SVG retrieved to `/tmp/ultimate3-reference/conclusion-logo.svg` from the desktop asset server. Use the SVG, not recreated typography or a full-frame screenshot. Node metadata and generated design context were retrieved; screenshot viewing is unavailable to the parent model. The advertised guidance resource was unavailable; follow existing React/CSS conventions, no Tailwind.

## 1. Chapter manifest and clock

Create a small typed manifest and pure composition sampler in `poc/src/experiments/micro-18/`. Each chapter owns its ID, label, native local duration, normalized timing, visual controls, and adapter. Avoid a generic nested video-editor framework.

- The main schedule is five contiguous chapter segments in the requested fixed order. Starts are derived cumulatively; no accidental overlaps or blank gaps.
- Global seconds map to chapter-local seconds by subtraction. **Do not silently time-stretch chapters.** Moving granular clips changes actual chapter events, not playback rate.
- A main segment's duration is the chapter's total allocation. Increasing it adds a terminal hold; shortening cannot clip required local content. Minimum allocation includes the resolved local endpoint and any required hold. Extending granular content grows the segment and ripples later chapter starts. Show the effective duration in the timeline rather than allowing displayed and rendered spans to diverge.
- Main starts/order are sequence-derived. If DialKit exposes free dragging, normalize/synchronize the real displayed values with the contiguous schedule and explain the fixed-order/ripple contract in the UI; do not silently render unrelated positions.
- Select boundaries with half-open intervals: the boundary belongs to the incoming chapter. Clamp final seeking to the final conclusion pose. Support zero-duration optional transition clips without division by zero; normalize NaN/infinity/negative persisted values.
- The selected chapter view owns one active transport. Main playback samples local chapter state using the same normalized data. Granular playback/seek maps back to global time. Switching views pauses the old transport and preserves the frame; never run six competing autoplay clocks or create seek feedback loops.
- Main view shows exactly five chapter segments, not every internal clip. Each chapter has an explicit selectable detail view and native-second timeline. A single visible DialTimeline dock with Main/Chapter navigation is sufficient; simultaneous stacked docks are not required. Keep a compact global chapter strip/navigation visible in chapter mode.
- Use live DialKit authoring bindings. Preserve `clip.current` semantics where existing chapter adapters use them (17 and Flow); use the same timing-driven samplers for 15/16 as their current editors. Editor and export must share resolved timing/easing/state. Guard against stale frames when main/local transports synchronize.

## 2. Scene reuse and transitions

### Chapter 1 — Ultimate 2

Reuse Animation 17's complete current playback, no subtitles. Keep its no-early-zoom behavior, upward turn, garage doors, warning-centered zoom, stationary cloud ending. Default duration 22s. Transition to Cost of a trace is a direct chapter boundary; do not invent an extra transition not requested.

### Chapter 2 — Cost of a trace

Reuse Animation 16 exactly with independent granular tracks and controls. Default duration 17s. Its final frame becomes the outgoing surface of the next chapter's slide.

### Chapter 3 — Introducing Flow-1

Add a granular `entrySlide` clip, provisionally 1.2s with Flow's existing smooth easing [.45,0,.55,1]. This is tunable, unlike an unexplained hard-coded delay.

- Place the frozen Cost final scene above Flow's opening scene in a shared outer stage: outgoing at y=0, incoming at y=720. Translate the stage upward by 720 * entrySlide.progress. This is a camera moving downward, not a crossfade, black interstitial, downward-moving incoming panel, or detached title animation.
- Both panels have exact 1280×720 clipped bounds and an opaque #1A1A1A base. Check the intermediate seam for gaps and overflow.
- Incoming Flow uses its true beginning, with title/dots and all internal component tracks still at their start, but **cloudReveal is already complete from its first visible pixel**. Keep current cloudYOffset=37. Override this only in the Ultimate 3 adapter and omit the now-obsolete reveal track from this chapter's editor. Retain Flow's later independent cloudExit.
- During entry, the Flow opening is held. After entrySlide completes, start Flow local playback at 0. No reset/pop at the join. Delay Flow's other tracks and independent loop clocks by the resolved entry endpoint consistently in editor/export.
- The original Flow scene's screen-pinned clouds should stay pinned within the incoming chapter panel, not the entire Ultimate 3 viewport during the outer slide.
- Reuse `IntroducingFlow1Scene` and its independent internal camera/component behavior. A local sampler adapter should resolve edited easing/zero-duration clips into `FlowPlayback`, including loop timing; it must not use the default-only static sampler when exporting edited timings.
- Default chapter span 1.2 + 13.3 = 14.5s.

### Chapter 4 — Issue clusters 2

This chapter owns a 0.5s lead-in placeholder, on the plain background with centered literal text `TODO: transition`. No outgoing Flow content behind it. At the exact end, hard cut to Animation 15 local time 0 and play its current full 6s default. Preserve cluster flights, cover color, prompt/send/transcript/window behavior. Default chapter span 6.5s. Lead-in is a granular track, not a sixth main chapter.

### Chapter 5 — Conclusion

Exactly two default stages, independently visible/tunable in its chapter timeline:

1. 1s plain #1A1A1A frame with centered literal text `TODO: ` (including colon; retain the string).
2. 1s Figma end card: the exact white logo asset centered at the measured 252.9266×43.9075 bounds on #1A1A1A. No animation, subtitle, grid, added CTA, or fade was requested.

Hold the logo for far-future seeks; export still ends after the requested second. Default conclusion duration 2s.

With present source defaults and the provisional 1.2s slide, total duration is **62s / 1860 frames**: 22 + 17 + 14.5 + 6.5 + 2. Compute this from data, never bake offsets into render branches.

## 3. Persistence and authoring UX

- Dedicated `micro-animation-18-*` persistence IDs for main/chapter timelines and visual controls. Never write the existing animations' IDs or clear their storage.
- Source defaults seed new settings. Retain existing valid Ultimate 3 edits when adding/normalizing keys; malformed storage falls back safely. No automatic silent import from arbitrary standalone browser presets.
- Include a serialized settings export/import (or copy/apply JSON) for the whole composition: schedule allocations, every chapter's timing/easing, and visual controls. Remotion props consume the same format; browser-only storage is not export authority.
- Preserve all existing useful visual controls: 17 motion/cloud/warning; 16 motion/spinner/smoke; Flow cloud offset/dot scale/cover direction/color; 15 appearance/travel duration. Chapter panels must not confuse controls belonging to different chapters.
- Keep the exact existing production handoff comment immediately above new useDialTimeline calls:
  `// TODO(production): DialKit's clip.current values are the scrubbable authoring preview.`
  `// Replace them with equivalent real Motion animations using the tuned timeline`
  `// timings and transitions, then remove useDialTimeline and <DialTimeline />.`
- Mount/resize-aware preview reservation with at least 6px dock clearance, using Animation 17's MutationObserver/ResizeObserver approach. Keep fixed 1280×720 authored geometry uniformly scaled within available space.
- Finite nonnegative `?time=` provides paused deterministic whole-composition inspection. Document whether it uses explicit serialized props or defaults; don't let invisible live clocks affect it.

## 4. Scope and handoff

Implementation model: explicitly pin GPT Sol (`azure-foundry/gpt-5.6-sol`), no unrequested higher-cost fallback. Use one worker/writer; parent owns planning, final scope review and acceptance. A fresh bounded read-only review follows substantial implementation, using the same requested model to control costs; corrections stay serialized. No nested delegation.

Allowed writes:
- New `poc/src/experiments/micro-18/**` and `poc/public/micro-18/**`.
- New `poc/src/video/MicroAnimation18.tsx`.
- Minimal additive registrations in `ExperimentPicker.tsx`, `tune/main.tsx`, `video/Root.tsx`, `video/styles-entry.ts`.
- This plan and chapter README/tests as needed.

Read-only reuse of existing animation modules; adapter-first. Ask the parent before changing existing scenes/samplers, even for optional props. No edits to sound-synth/soundboard/song-studio or unrelated work. No commits, staging, reset, stash, installs, browser downloads, or server starts/restarts. The existing checkout is deliberately dirty: prior Animation 17 files/registrations and sound-synth work must survive. Baseline HEAD during planning: ee9c85542df8143d17a29cb81dddb6e76514a580.

## 5. Validation / acceptance

1. Pure tests for five-chapter schedule, exact defaults/boundaries, ripple/minimum duration, zero-duration clips, negative/invalid time, reverse/random seeks, final hold, retiming/easing and saved-settings normalization. Assert placeholder and logo default durations in frames (15, 30, 30).
2. Scene/state parity against the original chapter samplers away from deliberate transitions. Flow adapter tests specifically prove cloudReveal=1 at first visibility and no jump from entry to native playback; retimed loop clocks must follow edited starts/durations.
3. Browser tests using agent-browser with installed `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` and existing port 5180. Verify main has five segments; all five detail views exist; tune representative clips in each and verify visible state changes, transport handover, persisted reload, whole-config round trip, no autoplay conflict, timeline resizing and fixed geometry. Restore/clear only test-owned Ultimate 3 settings, never original settings.
4. Transition browser geometry: at progress 0/.5/1 the outgoing/incoming offsets are (0,720), (-360,360), (-720,0); cover no-gap seam; clouds' chapter-local position stays resting throughout entry. Hard-cut and conclusion exact-frame checks.
5. `pnpm --dir poc run typecheck`, `pnpm --dir poc exec vite build`, focused tests and unchanged chapter regressions. Existing bundle-size warnings can be reported, not hidden.
6. Remotion stills with installed Chrome and `--gl=angle`: each chapter, start/middle/end of the downward slide, TODO lead-in, first Issue frame, both conclusion cards. Compare representative editor/export frames; verify sampled final pose holds on far-future browser seek. Store artifacts under `/tmp/ultimate3-verification/`.
7. Parent checks additive diff and protected-source preservation. Report numeric/pixel evidence honestly; no implied human full-motion approval.

## Milestones

1. Typed chapter manifest, normalized settings and pure clock/sampling adapters with tests.
2. Shared scene composition, downward transition, placeholders and exact Figma logo card.
3. Main/detail editor, persistence/JSON handoff, visual controls and additive Remotion registration.
4. Browser/still verification, bounded independent review, focused corrections and parent acceptance.

## Risks and explicit choices

- Master/local drift: one authority at a time, frame-preserving view switch, shared settings and deterministic tests.
- Retiming truncates later content: endpoint-aware duration floor and ripple; no implicit time stretching.
- Flow clouds replay their old entrance: local cloudReveal override to completed, later exit untouched.
- Existing animation sources or saved edits change: namespaced new adapter layer and diff/storage checks.
- GPU/asset readiness: reuse barriers; image decode and local SVG readiness for stills; preserve explicit scene stacking contexts.
- Provisional art direction: only slide duration (1.2s) and unrequested 17→16 transition (direct boundary) are defaults for review. All requested placeholder timings remain exact at defaults.
