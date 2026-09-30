# Digital sound-design reference — agent handoff

## Task

Use `sound-design-digital-inspo.m4a` in this folder as the sonic reference for
an experimental Ultimate3 sound-design pass. The user wants an agent to try to
recreate its sound. Listen to and analyze the reference first; no listening-based
sound description or recreation has been performed in this handoff.

Work on `sandbox/signals-sound-design-digital-inspo`, branched from the latest
`sandbox/signals-launch-video` at `cd06412238be1c4f96973d50c9d26531d166b9a3`.

## Reference

- Original: `/Users/kolbeyang/Downloads/sound-design-digital-inspo.mp4` (unchanged).
- Extracted Downloads copy: `/Users/kolbeyang/Downloads/sound-design-digital-inspo.m4a`.
- Portable committed copy: [`sound-design-digital-inspo.m4a`](sound-design-digital-inspo.m4a).
- Audio only: AAC, 44.1 kHz, stereo, 66.107211 seconds, 1,069,921 bytes.
- Extracted with FFmpeg audio stream copy: no transcoding, gain changes,
  normalization, trimming, speed changes, or pitch changes.
- M4A SHA-256: `5be08291f7782a0adade26e751a9bb60b9ef80731b14db18bb04d1f3423ab025`.
- Source and extracted AAC payload SHA-256 both match:
  `9c4843d890c877f78b5b4f644619d74b97fc96013e9115b435e36c45df5b36df`.

## Current video baseline

The branch includes **editable-v10**, the approved A/subtle narration and tighter
cadence: 2129 frames at 30fps (70.96 seconds before frame rounding), chapter starts
0 / 19.66 / 29.91 / 45.102 / 64.41 seconds.

Read these before changing audio:

- `poc/handoff/voiceover-tighter-cadence/README.md`
- `poc/src/experiments/micro-18/score/README.md`
- `poc/src/experiments/micro-18/AUDIO_EXPORT.md`
- `poc/src/experiments/micro-18/voiceover-cut.ts`
- `poc/src/experiments/micro-18/voiceover-phrases.ts`
- `poc/src/experiments/micro-18/offline-audio.ts`
- `poc/scripts/export-ultimate3-audio.ts`

The paper-texture toggle from the separate `signals-launch-video` working
checkout is not included here; this branch intentionally starts from upstream.

## Suggested next-agent deliverable

1. Identify the reference's main sound layers and representative timestamps:
   timbre, transients, envelopes, pitch motion, rhythm, space, and dynamics.
2. Recreate representative sounds as editable synthesis/processing, then adapt
   them to Ultimate3's actual visual beats. The reference and video differ in
   duration; do not assume their timestamps line up.
3. Provide an auditionable candidate plus a brief description of the controls
   and an A/B comparison against the current soundtrack.
4. Keep this reference and all historical/source audio untouched. Preserve the
   approved narration, timing, animation, saved authoring settings, and existing
   default mix until the user selects a replacement. Do not add a second
   simultaneous audio owner or reintroduce removed engine/drone loops.
5. Keep outputs clearly separate from the approved mix; document reproducible
   rendering commands and verify clipping, narration intelligibility, and
   preview/export timing before proposing integration.

This commit adds only the reference and handoff; it does not change playback.
