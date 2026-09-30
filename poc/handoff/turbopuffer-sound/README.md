# LAM-2316 — "Glide": alternate sound design after the TurboPuffer reference

A separate, auditionable soundtrack candidate for Ultimate 3. Nothing approved is replaced:
the A/subtle editable-v11 narration, `editable-v11/bed.wav` (Arabesque), the authoring
settings, the picture, the pricing animation and the paper texture are all unchanged.
The default preview and default export still use Arabesque.

- Candidate video (Glide + approved narration): https://svwyososwvsgouxwfdlc.supabase.co/storage/v1/object/public/lmnr-coding-agent/lam-2316/ultimate3-glide-turbopuffer-voiceover.mp4
- A/B, approved Arabesque mix, same picture: https://svwyososwvsgouxwfdlc.supabase.co/storage/v1/object/public/lmnr-coding-agent/lam-2316/ultimate3-arabesque-approved-ab.mp4

## Audition

- **Preview:** `?experiment=micro-18` → panel *Ultimate 3 · Voiceover mix* → **Soundtrack**:
  `Arabesque (approved)` / `Glide · TurboPuffer ref`. Switching re-anchors playback at the playhead.
- **Export:** `pnpm exec tsx scripts/export-ultimate3-editable-vo.ts --settings handoff/pricing-timing-audio/preview-settings.json --out <path>.wav --bed glide`
  (omit `--bed` for Arabesque). It refuses a bed built for a different phrase manifest.
- **Rebuild the bed:** `pnpm exec tsx scripts/build-ultimate3-glide-bed.ts --out <new dir>`. It never overwrites.
  Re-run it after retiming the narration, because the ducking is baked in, keyed on the placed phrases.

## What the reference does (turbopuffer.m4a, 73.32 s)

The analysis is about character only; the reference's timeline was not mapped onto the 69.5 s cut.

- **Texture:** there is no struck melody. Wide, detuned G-major pads, a sub drone and muffled mid "thumps" do the work. Tiny high ticks and sparkle carry the "data".
- **Arc by filter:** one brightness curve tells the story. It opens airy (centroid 2–4 kHz), darkens into a sub drone plus a tritone bass for the problem, then lands on a warm low-passed Gmaj7 for the reveal. A bright shimmer riser follows, a drop-out, and only then a real groove.
- **Rhythm:** 89 BPM, syncopated, felt rather than heard until the payoff: a soft boom-bap in G.
- **Mix:** the bed sits about 7 dB under a centred voice. The bed is wide and its energy is mid-dominant, with the 1–4 kHz presence band about 10 dB down.

## How Glide maps that onto Ultimate 3 (`src/experiments/micro-18/score/glide/`)

| Picture | Sound |
|---|---|
| Trace / Ultimate 2 | Airy Gmaj9 → Em9 → Cmaj9 → Dsus pads. A glint stream pans L→R with the trace. The filter slams shut on the failure (4.2 kHz → 420 Hz), with a muffled thump. |
| Cost | The floor drops: sub drones A1 → F1 → E1 → B♭1 (the only foreign colour) under a dark, thin pad. A syncopated thump pulse runs on the 89 BPM grid, the cheap-LLM zips pan with their direction, and the depletion slows and sags. |
| "Until now" | Near silence, then a reversed breath. |
| Flow-1 reveal | A warm low-passed Gmaj7 (the reference's reveal voicing) with a soft impact. The filter opens with each number drop. |
| Pricing comparison | A few orange flutters for GPT, then a dense, wide blue shimmer for Flow-1. It is all at or above 4.7 kHz, so it never competes with the voice. |
| Engine / cover shut | Spinner ticks, then the cover slams the filter shut again. |
| Issues grid | The pad brightens into the grid (9 kHz), the circle grow is a shimmer riser, and the pops cascade as specks. The clusters "lock" as a soft electric-piano chord. |
| Conclusion | The drop-out, then the only real beat: swung boom-bap at ≈ 89 BPM, with the logo on beat 6. The kit drops out on the logo, so "with Laminar" rides a held chord. The logo itself is light (specks), not a stab. |

Rules that kept the speech clear:

- Pads sit an octave above the voice's body. Low-end detail is at or below 1 kHz (thumps, sub), and high detail is at or above 4.7 kHz (glints).
- The ducking is baked into the bed and keyed on the placed narration: -5 dB overall, plus a 6 dB dip of the bed's 2.2 kHz presence band.
- A voice-aware safety gain dips only the bed wherever bed + voice would pass -1.6 dBFS.

## Verification (preview-settings.json, seed 2316)

| | Glide | Arabesque (approved) |
|---|---|---|
| Integrated / true peak | -16.3 LUFS / **-1.3 dBTP** | -15.5 LUFS / +0.5 dBTP |
| Bed vs voice | -7 LU | — |
| Voice/bed SNR per phrase, median (min) | 9.1 dB (1.1) | 3.9 dB (-1.4) |
| 500 Hz–4 kHz speech-band SNR, median (min) | 7.6 dB (0.0) | 1.5 dB (-4.5) |
| Whisper small.en | full script, identical to Arabesque's transcript except GPT→"GBT" | full script |
| Length | 3,336,000 samples = 2085 frames | same |

- **Preview/export parity:** the preview plays `editable-v11-glide/bed.wav` plus the phrases at unity. `mixVoiceoverPcm` makes the same sum; the export matches the builder's own sum to 3e-8.
- **Video:** the MP4 muxes this export onto the unchanged silent Ultimate 3 render (2085 frames, 69.5 s) with AAC 320k.
