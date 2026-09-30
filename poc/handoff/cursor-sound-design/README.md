# Cursor-inspired Ultimate3 sound redesign

Branch: `sandbox/signals-cursor-sound-design`, based on the fetched tip of
`sandbox/signals-launch-video`: `9d7f4c72d6df9145c83c6ddca144b1ca870c4f2a`.

## Reference

- Cursor, “Software is changing”: https://x.com/cursor_ai/status/2026717494426173917
- Audio: `cursor-software-is-changing.m4a` in this folder.
- Duration: 54.634667s; AAC stereo, 48kHz; 885201 bytes.
- Downloaded from the public post using yt-dlp; extracted with FFmpeg AAC stream
  copy, without re-encoding, gain, normalization, pitch or speed changes.
- SHA-256: `41d58d0c2e482d07f90908967cf9d9eb46286a208931b6e7cbcb4bc58fa5047b`.
- No listening analysis or sound redesign has yet been performed for this handoff.

## Exact picture to use

Use this folder's `preview-settings.json` as the `settings` prop for Remotion
`MicroAnimation18`. It matches the latest exported Ultimate3 picture:

- 1280×720, 30fps, 2085 frames / 69.5s.
- New traces-per-dollar pricing animation, comparison v2.
- Latest editable-v11 cadence and approved A/subtle narration.
- **Paper texture OFF**, per the user's latest request. Older handoff settings
  have it on; use this snapshot instead.

The 54.63s reference and 69.5s Ultimate3 do not share a timeline. Adapt its sound
language to Ultimate3's actual motion and narration rather than stretching its
soundtrack across our video or changing the picture to fit it.

## Requested work

Analyze the reference's rhythm, timbres, envelopes, transitions, use of silence,
and relationship to motion. Capture its essence and completely revamp Ultimate3's
current piano-based sound design, rather than merely layering a few effects.
Create editable sound layers; preserve the approved spoken narration, visual
settings and timing. Retain original media and the old mix for comparison.

Read `../pricing-timing-audio/README.md` for the pricing/timing integration and
existing audio ownership. Its previous turbopuffer inspiration is superseded
for this task by the Cursor audio here; its paper-on settings are also superseded.
Read `../../src/experiments/micro-18/score/README.md` and
`../../src/experiments/micro-18/AUDIO_EXPORT.md` before changing playback/export.
Do not introduce duplicate audio owners. Keep preview and export synchronized.
Check intelligibility, peaks, clipping, duration, and final muxed audio/video.

Render the complete new video, upload it to Supabase using the project's
configured access and conventions, and return a playable link. Never commit or
print credentials. If upload access is unavailable, report the blocker and
provide the local render instead of claiming an upload. Open a PR with the
implementation and briefly explain the sound-design choices.
