# OpenAI-inspired Ultimate3 sound redesign

Branch: `sandbox/signals-openai-sound-design`.
Base: latest fetched `sandbox/signals-cursor-sound-design`, commit
`35dc9dd8a58a2e0aef75420ef10b135ac424ea3d`. This is the latest matching sandbox
sound-design branch, including the latest launch-video pricing integration.

## New reference

OpenAI's “Get ready” post:
https://x.com/OpenAI/status/2104651136699609518

Audio: **`openai-get-ready.m4a`**, alongside this README.
The original downloaded video and extracted M4A also remain in Downloads under
`openai-get-ready-2104651136699609518` filenames. See `audio-provenance.json`
for extraction method, metadata, and checksum.

This reference supersedes the Cursor/turbopuffer/digital inspiration for this
particular task. Previous references are retained, not deleted. No listening
analysis or new sound-design implementation has been performed in this handoff.

## Picture and narration contract

Use this folder's `preview-settings.json` as the `settings` prop for Remotion
`MicroAnimation18`, not the historical default props or paper-on snapshots.

- Latest Ultimate3 pricing / traces-per-dollar animation, comparison v2.
- Editable-v11 cadence and approved A/subtle narration.
- **Paper texture OFF**.
- 1280×720, 30fps, 2085 frames / 69.5s.

Preserve all picture timings, authored motion and narration. The reference is
not a replacement timeline: adapt its sound language to our video, rather than
stretching its soundtrack or changing the picture to fit it.

## Requested sound-design work

Listen closely and analyze rhythm, timbre, dynamics, envelopes, transitions,
use of silence, and synchronization with motion. Capture the essential style
and completely revamp Ultimate3's existing piano-based sound design, rather
than merely layering a few effects. Recreate the style using editable sound
layers, not by pasting the reference soundtrack wholesale.

Preserve the approved spoken narration and keep speech intelligible. Retain
original media and the old mix for comparison. Check peaks/clipping, duration,
transition alignment, and preview/export synchronization. Do not introduce
duplicate audio owners.

Read the integration/audio documentation before implementation:

- `../pricing-timing-audio/README.md` (timing/ownership context only; this new
  reference and paper-free settings supersede its inspiration and picture props).
- `../../src/experiments/micro-18/score/README.md`
- `../../src/experiments/micro-18/AUDIO_EXPORT.md`
- `../../src/experiments/micro-18/offline-audio.ts`
- `../../scripts/export-ultimate3-audio.ts`

Render the full new video, upload it to Supabase using configured project
access/conventions, and return a playable link. Never print or commit secrets.
If upload access is unavailable, report the blocker and provide the local render
instead of claiming an upload. Open a PR with the implementation and briefly
explain the key sound-design choices.
