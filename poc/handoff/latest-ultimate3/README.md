# Latest Ultimate3 — synchronized local visuals and timing

This handoff synchronizes the current `signals-launch-video` checkout to
`sandbox/signals-launch-video`, including its uncommitted changes after checkpoint
`b2786e6c20b3c72f45c6f6d4649fe230dadb4571` and earlier local changes missing from
upstream `d0fa154f2`. See [source-manifest.json](source-manifest.json) for exact
transferred paths and SHA-256 hashes.

## Included changes

- Main-timeline **Ultimate2 Cloud Enter** alias, preserving actual DialKit
  `clip.current`, existing detail controls, and the production migration TODO.
- Tuned cloud entry at **12.49s**, duration **6.17s**, with offscreen clearance
  that leaves its settled pose unchanged. Opening allocation is **22.41s**.
- Two progressively smaller gray dot rows above Flow's original field.
- Zoom-aware, lattice-aligned **Cost → Flow** placement: viewport world centers
  align rather than merely matching camera translation, removing sideways drift.
- The five benchmark peers appear first; **flow-1**, its dot and **73.0** reveal
  last on narration phrase `n12` (currently **41.75s**, “Surpassing GPT-6 Sol”).
- **Flow → Issues** maintains the shared grid and a trace reaching both edges:
  source22 entry surfaces are transparent/unclipped, with real block
  continuations while the entry camera is wider than the native artboard.
  Native clipping resumes at arrival. Historical source20 behavior is preserved.
- Source22's blue agent starts **720px farther left**, preventing the waiting
  agent from peeking into the shared view. Its landing and timing are unchanged.
- “Any structure you define” explanation words reveal in **1.2s**, not 2.4s;
  narration placement and surrounding action timings stay unchanged.
- Regression tests for camera alignment, reveal order, cloud authoring,
  offscreen clearance, trace/grid coverage, typing speed, and historical behavior.

## Exact current cut

- Editor: `?experiment=micro-18`; historical route remains `&cut=original`.
- [settings.json](settings.json): exact editor settings used for the latest MP4.
  Apply via the editor's Settings JSON if an old/custom local preset is active.
  Existing custom state is deliberately not globally overwritten by migrations.
- [render-props.json](render-props.json): same settings wrapped for Remotion
  `MicroAnimation18`. This intentionally has no `audioSrc`; it renders picture.
- Chapter starts: **0 / 22.41 / 36.11 / 51.302 / 70.61s**.
- Authored end: **77.16s**; export: **2315 frames / 77.166667s**, 1280×720 at 30fps.
- [last-render-ffprobe.json](last-render-ffprobe.json): verified H.264/AAC metadata
  from the completed local export. The MP4 remains in the user's Downloads as
  `ultimate3.mp4`; it is not duplicated in Git.
- To regenerate its audio, use `scripts/export-ultimate3-editable-vo.ts` with this
  same settings JSON and a new output WAV, then mux it with the picture render.
  Existing score sources/prepared voice assets are unchanged and already present.

## Approved replacement VO — next task

**[voiceover-subtle-a/README.md](../voiceover-subtle-a/README.md)** documents the
user-approved `public/audio/voiceover/voice_A_subtle.wav` and its hashes/loudness.
It is a different recording and is **not yet integrated**. Current playback and
the completed MP4 still use the previous, aligned recording. Do not drop the
70.101333s speech-only WAV onto the 77.166667s movie as a replacement soundtrack:
transcribe/split/align its phrases and retain the score/foley pipeline.

Preserve historical media, full Issues postlude, standalone previews, custom
settings, and deterministic seeking. No canceled global-cloud renderer, new
audio owner, or wall-clock animation engine is introduced by this transfer.

## Verification

See [VALIDATION.md](VALIDATION.md) for receiving-checkout checks and preservation.
