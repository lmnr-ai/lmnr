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

## v2: `openai-tactile` (the default bed)

Render: https://svwyososwvsgouxwfdlc.supabase.co/storage/v1/object/public/lmnr-coding-agent/lam-2320/ultimate3-openai-tactile-v2.mp4

v1 (`openai-pulse`, `?bed=openai`) and the piano bed (`?bed=piano`) are kept for comparison; v2 is `editable-v11-openai-tactile/`.

**Client feedback on v1.** It lacks the reference's deep, immersive, "touchable" feel. It needs satisfaction at "Introducing Flow-1…" and "Unlock the insights…", and an emotional throughline. The client guessed the bass was the cause, but asked for an expert view rather than trusting that guess.

**Expert diagnosis (measured against the reference, first 12.2 s).**
1. **Texture.** The reference's mids and highs are hits, not tones. The HPSS sustained share is 0.39 at 600 Hz–2 kHz, 0.11 at 2–6 kHz and 0.05 above 6 kHz; v1's sine keys and glass were 0.98 / 0.93 / 0.52.
2. **Space.** Every hit has early reflections right behind it, and the room tails fill the gaps. v1 had 25 dead spans; the reference has none.
3. **Bass.** The client was half right. The level was fine, but the reference's sub is re-struck every eighth, saturated with harmonics up to ~500 Hz (audible on small speakers), and marked by a low-mid thump on each onset.
4. **Payoffs.** v1's payoffs had no contrast: no build, no true silence, no bloom.
5. **Voice band.** v1 had too much sustained energy in the speech band.

**What v2 does (`score/README.md`, `openai-tactile`).**
- **Arc.** The major third (F) is withheld until Flow-1. The drain closes the top to 2 kHz and "Until now" reopens it. Both payoffs get a grain build, true silence, then the deepest hit and a bloom. At the logo, the sub hushes under "with Laminar" and is struck again with the chord after the name.
- **Mix.** Under every line, the music bus is carved 6 dB in the 300 Hz–3 kHz band, plus a −2.5 dB broadband duck. Other suck-outs dip only 10 dB, with a room-tone drone on the sfx bus so the gaps keep air.

**Measured (preview settings, final bed render).**
- **Bands vs the reference (dB re total):**

  | Band | v2 | Reference |
  |---|---|---|
  | 20–90 Hz | −0.8 | −1.0 |
  | 90–250 Hz | −8.7 | −8.5 |
  | 250–600 Hz | −14.2 | −12.4 |
  | 600 Hz–2 kHz | −22.2 | −21.9 |
  | 2–6 kHz | −24.7 | −26.0 |
  | 6–16 kHz | −28.3 | −31.4 |

- **Stereo.** L/R correlation, low to high band: 1.00 / .93 / .49 / .23 / .63 / .64 (reference .99 / .85 / .47 / .18 / .46 / .51). Side is −16.2 dB (reference −14).
- **Payoffs.** Flow-1 rises from −20 dB in its build to −9 dB on the hit, after −48 dB of silence. The logo goes from −24 to −8, after −47 dB. Other suck-outs sit 14–21 dB under their hit.
- **Narration.** Every line clears the bed by ≥ 4.5 LU (median 8.5) at bedDb −1. The narration mix goes over full scale on 25 samples (+0.65 dBFS), where voice peaks meet sub hits; see `AUDIO_EXPORT.md`.
- **Not reached.**
  - The sustained share in the mids and highs is still 0.8 (plucks, blooms, glass tails), against the reference's 0.1–0.4.
  - 18 % of 50 ms windows sit 25 dB under the loudest. This metric is inflated by the loud payoffs, but the breakdowns are still sparser than the reference.

**Notes for the next agent.**
- Measure, don't eyeball. The analysis used band level, L/R correlation, an HPSS sustained share and a dead-window percentage per band.
- **Solo stems.** `--gain 1 --layers <all 0 but one>` per layer shows which part owns a band. In v2 the "too bright" highs came from `lift` (independent stereo noise) and `glass`, not the grains.
- **Pure tones and correlation.** Per-ear phase offsets or detune on a sine make its L/R correlation ~0 and the image hollow. Cross-blend the ears instead.
- **Muting voices.** `sub`'s level never decays below `floor` (default .55). Pass a low `floor` or split the note when it must get quiet under a word.
- **Speech carve.** `carve` must run after every music voice is emitted; it stays linear, so the stems still sum.
- **Rebuilding the bed.** `node scripts/build-ultimate3-openai-bed.mjs <new-edition> <bedDb> <stemsDir> openai-tactile`. Pick bedDb from per-line narration margins (≥ 4.5 LU), not from the bed's loudness.
