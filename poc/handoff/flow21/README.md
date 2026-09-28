# Current Ultimate 3 — Animation 21 sound handoff

Published target: `sandbox/signals-launch-video` in `lmnr-ai/lmnr`.

## Cloud-only correction after the initial handoff

The earlier rollback removed only the last interpolation experiment, not the preceding frame-pinned rewrite. That rewrite is now also reverted to the pre-midnight `449f3d67` cloud behavior: native Ultimate2/Cost clouds plus Flow's world-attached cloud plane. Replacement cloud bars and X/Y extent controls are removed. Legacy `clouds` metadata in the settings snapshot is retained but ignored by rendering; native chapter cloud controls remain active.

Animation21, its timings, the shared camera, narration, chapter allocations, and the settings snapshot are unchanged. The Acoustic Chill bed has since been re-scored to this cut (see below). Do not restore the three-bar frame-cloud sampler from the initial publication.

## Open the current cut

- Editor: `?experiment=micro-18` (Ultimate 3, editable voiceover-v4).
- Standalone graph/engine: `?experiment=introducing-flow-1-2`.
- Historical original cut: `?experiment=micro-18&cut=original` (intentionally still Animation 13).
- Current defaults: `src/experiments/micro-18/voiceover-cut.ts`, `VOICEOVER_DEFAULTS`.
- Exact publication settings snapshot: [`default-settings.json`](default-settings.json), generated from those code defaults. It is not a new runtime persistence store.
- Remotion: use composition `MicroAnimation18` with `{settings: <this snapshot>}`. Its historical default props deliberately remain the original cut; do not render without current settings and assume that is the new version. `IntroducingFlow1-2` is the standalone composition.
- Existing local preview remains at port 5180; do not launch a conflicting server.

## What changed

The current v4 Flow chapter uses `flow.sourceVersion: 21` and **`flow.timing21`**. Preview, authoring, and export share the Animation 21 sampler, graph, captions, and camera. The six rising beads use one `beadsEntry` bar plus `flow.controls.beadStaggerSeconds` (0.11s default). `clip.current` is still the editable preview source; the production TODO remains in place.

The Flow dot stays at x=1150/y=270, peer values use the revised round axis scales, Sol stays gray, and the camera no longer pans between the two statistics poses. The shared Cost→Flow→Issues world remains continuous. A review-found custom-opening-camera snap was fixed and regression-tested.

Original-cut settings and explicit historical imports remain source13. Only the current unversioned v4 stored settings upgrade to source21; other chapters, narration edits, trim/entry settings, cloud settings, and appearance choices survive. Legacy `flow.timing` is retained for compatibility and is **not the new visual schedule**.

## Timing reference

Current composition: **2085 frames at 30fps**, 69.49133333333333s authored duration (69.5s frame-rounded).

- Flow chapter starts at **36.108s**, with a **1.2s** entry bridge.
- Flow native time zero is therefore **37.308s** global.
- Native cue → global cue: `chapter.start + flow.entrySlide.at + flow.entrySlide.duration + nativeTime`. Recompute from settings after retiming; do not bake these numbers into sound logic.

| Visual cue | Native timing | Current global timing |
|---|---|---|
| String enters | 2.77–3.52 | 40.078–40.828 |
| Bead group | 2.88–4.28 | 40.188–41.588 |
| Graph spreads | 5.41–6.95 | 42.718–44.258 |
| Both axes enter | 6.10–6.60 | 43.408–43.908 |
| Engine descent/string exit | 8.64–9.30 | 45.948–46.608 |
| Issues chapter starts | — | 48.608 |

Bead order: Opus, Sonnet, flow-1, Sol, Gemini, Luna. The standalone `beads.ts` derives per-bead motion from the single authored group clock. The separate `modelPoints` visibility envelope remains as requested; account for it when choosing audible cues.

## Sound: Acoustic Chill re-scored to Animation 21

`score/cues.ts` derives the Flow cues from `flow.timing21` when `sourceVersion` is 21: the six bead landings are the number drops, `ballEntry` is the count-up, `graphSpread` is the swap/glissando, `xAxisEntry` is the analysis count-up. `scripts/build-ultimate3-flow21-bed.mjs` renders the voice-free keyboard-bearing bed (`arabesque-acoustic-chill --split-arabesque`, seed 107290, -5.5 dB, 2085 frames) into `editable-v4/flow21-bed.wav`, and points `manifest.json` at it. The v4 `bed.wav` stays byte-for-byte, listed under `previousBeds`. The recorded narration still says “2% of the cost”, while the caption reads “20x more traces per dollar”.

Use `flow.timing21` and the shared sample helpers rather than the legacy `modelRows`, `barsGrow`, or `cameraToAnalysis` tracks. Inspect `voiceover-engine.ts`, `voiceover-schedule.ts`, `voiceover-phrases.ts`, and `scripts/export-ultimate3-editable-vo.ts` for the editable narration/audio path. Prepared source narration and bed files under `public/audio/voiceover/editable-v4/` are included byte-for-byte, along with historical v2/v4 media and manifests.

Upstream Phase/Tintinnabuli and all five keyboard models are retained alongside the local Acoustic Chill variant. The publication merge does not replace newer sound features with the older standalone versions. Preserve paused-inspection silence, single audio scheduling, existing master/mix controls, and source-media provenance.

## Verification

See [`VALIDATION.md`](VALIDATION.md) for exact publication checks and limitations. Historical `poc/HANDOFF.md` and `handoff/VALIDATION.md` describe the earlier transfer, not the current v4 timing.
