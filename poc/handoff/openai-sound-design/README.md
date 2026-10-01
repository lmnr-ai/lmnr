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

## Result (LAM-2320)

Render: https://svwyososwvsgouxwfdlc.supabase.co/storage/v1/object/public/lmnr-coding-agent/lam-2320/ultimate3-openai-pulse.mp4
Old mix for comparison: https://svwyososwvsgouxwfdlc.supabase.co/storage/v1/object/public/lmnr-coding-agent/lam-2320/ultimate3-piano-ab.mp4

Both use the same silent render (these settings, paper off, 2085 frames) and the same editable-v11 phrases; only the bed differs.

**Reference analysis.** −14.6 LUFS, LRA 5.1, C♯ major pentatonic.
- A pure sine sub (G♯1, sagging ~51→47 Hz) swells in over ~40–60 ms, holds flat and is gated off into ~0.4 s of near-silence every 2 s (120 BPM bars).
- Soft mid plucks walk 16ths over it. Glassy highs and sparse crisp ticks sit on a ~−50 dB air floor.
- Form: intro without sub (0–1.2 s) → pressure bars → breakdown without sub (6.2–8 s) → denser build with ticks and a 4.8 kHz whistle → suck-out (9.2–10 s) → a final C♯1 (35 Hz) hold under a C♯5/A♯4/F4/C♯6 shimmer.

**Adaptation (style `openai-pulse`, see `score/README.md`).** That form is laid onto our picture cues rather than stretched:
- The sub pulses through the trace stream, Cost and the Issues prelude.
- Breakdowns sit under the drawers, the pricing comparison and "Until now".
- Builds halve the pulse toward the warning zoom, the engine, the issue grid and the logo.
- Each downbeat is preceded by a suck-out: failure, collapse, Cost, Powerful LLMs, Flow-1, engine, cover shut, issue grid, logo.
- The sub withholds the tonic C♯ until Flow-1 and lands its longest, lowest C♯ on the logo.
- Picture events are answered with glass and ticks (beads, drawers, cluster locks, the 47 pops as one cascade, cheap-agent passes as tick flicks).

**Mix.**
- **Narration margin.** The bed sits 7.4 LU (median) under the narration, ≥ 4.8 LU on every line; the Arabesque bed gave 4.7 / 0.3.
- **Peaks.** The bed peaks at −8.5 dBFS. The mix is 69.5 s / 3,336,000 samples; see `AUDIO_EXPORT.md` for the narration-peak overs.
- **Silence.** It is 25–35 dB down inside every suck-out.

Reproduce: `node scripts/build-ultimate3-openai-bed.mjs` (new edition name), then `npx tsx scripts/export-ultimate3-editable-vo.ts --settings handoff/openai-sound-design/preview-settings.json --out <new>.wav [--bed piano]`, then mux onto the silent render with `-c:v copy -c:a aac -b:a 320k`.
