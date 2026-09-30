# LAM-2316 — "Glide": alternate sound design after the TurboPuffer reference

A separate, auditionable soundtrack candidate for Ultimate 3. Nothing approved is replaced:
the A/subtle editable-v11 narration, `editable-v11/bed.wav` (Arabesque), the authoring
settings, the picture, the pricing animation and the paper texture are all unchanged.
The default preview and default export still use Arabesque.

- Candidate video (Glide + approved narration): https://svwyososwvsgouxwfdlc.supabase.co/storage/v1/object/public/lmnr-coding-agent/lam-2316/ultimate3-glide-turbopuffer-voiceover.mp4
- A/B, approved Arabesque mix, same picture: https://svwyososwvsgouxwfdlc.supabase.co/storage/v1/object/public/lmnr-coding-agent/lam-2316/ultimate3-arabesque-approved-ab.mp4

## Glide 2 · continuous arc (`glide-arc`), the follow-up

Feedback on Glide: "85% there, lacking polish. Should the conclusion's beat start at *Introducing Flow-1*?"
A sound-design review of the Glide bed found these causes, ranked:

1. **No pulse for about 60 s.** Only the 4 s conclusion groove behaved like a score; everything else was pads plus reactions.
2. **The arc sagged at Signals.** 43–53 s was the quietest, darkest part of the film (-25 LUFS), right where the story peaks.
3. **The filter lurched.** It had 28 knots, 5 of them slams, and the chord changes were on cues rather than bar lines.
4. **Phasey, thin pads.** L/R correlation was 0.02–0.11 (2.5–2.9 dB lost in mono), with no 80–250 Hz body.
5. **Audible ducking:** a 350 ms release fluttered 1–4 dB between words.
6. **About 365 random foley events (5.3/s),** off the grid, including keys stabs in the speech band.
7. **The score limiter took 3 dB for nothing,** and the loudest moment sat under "with Laminar", on a weak IV → I with no button.

The verdict on the feedback: it's partly right. The groove shouldn't just be moved to Flow-1. The rhythm should be *born* there and build without a break into the payoff.

- Candidate video: https://svwyososwvsgouxwfdlc.supabase.co/storage/v1/object/public/lmnr-coding-agent/lam-2316/ultimate3-glide2-continuous-arc-voiceover.mp4
- Source: `src/experiments/micro-18/score/glide/arc.ts`, built with `--style glide-arc` into `editable-v11-glide-arc/`. Glide v1 is untouched and rebuilds byte-identically.

One 89.5 BPM grid (`arcGrid`) runs the whole film. The Flow-1 reveal is bar 0 and the logo is bar 14. Chords, filter moves and kit entries all fall on bar lines, and foley within 40 ms of a 16th snaps onto it.

| Story | Sound |
|---|---|
| Problem: trace, failure, insights | A soft pluck ostinato over coherent pads that stumbles and stops on the failure. A sub floor arrives with the insights. |
| Cost | A muffled boom-bap pulse in A → F → E → B♭, then the depletion tape-stops everything into true silence for "Until now". |
| Flow-1 reveal | V → I: a reversed breath, then warm G. From here the bass motor, shaker and pumped pads never stop. The ostinato returns on bar 1 and hats on bar 3. |
| Engine → Signals | A riser into one beat of stop-time on the cover shut, then the kit (kick, rim) lands on "Flow-1 powers Signals". |
| Zoom-out → grid | A breakdown bar (D pedal plus snare roll), then the drop on the grid, with 16th hats and a backbeat. |
| Payoff | A drop-out bar, then the full groove for "Unlock the insights…" over IV–V–I onto the logo. "with Laminar" rides a clean chord, followed by a two-note bell button. |

Mix changes:

- Pads share phase across the ears, and everything under 150 Hz is summed to mono.
- There are two slow filter curves, one for the problem and one for the solution; the kit stays unfiltered.
- The foley is thinned and kept above the voice (specks at D8 and up).
- The ducking is 3 dB overall plus 4 dB of presence dip, with a 0.9 s release, and pauses under 1 s are bridged.
- A linear per-section level curve (`arcLevels`) goes from -1.5 dB in the problem to +1 dB in the payoff, and -3 dB after the logo.
- The score renders at -20 LUFS, so no score limiting is needed.

| Bed loudness by section (LUFS) | trace | insights | cost | flow | signals | grid | payoff | tagline |
|---|---|---|---|---|---|---|---|---|
| Glide | -24.9 | -24.8 | -24.8 | -22.6 | -25.4 | -22.2 | -20.1 | -21.4 |
| Glide 2 | -29.3 | -27.6 | -28.5 | -24.2 | -23.8 | -21.8 | -20.0 | -28.0 |

| | Glide 2 |
|---|---|
| Integrated / true peak | -16.2 LUFS / **-1.3 dBTP**; score limiter 0 dB |
| Voice/bed SNR per phrase, median (min) | 7.7 dB (3.4) |
| 500 Hz–4 kHz speech-band SNR, median (min) | 8.1 dB (4.0, n21) |
| Beat autocorrelation at 89.6 BPM | 0.6 in Ultimate 2; 0.77–0.88 from Cost to the payoff |
| Bed L/R correlation | 0.66–0.90 (low end 0.96–1.0) |
| Whisper small.en | full script ("GBT6" as before) |
| Export vs builder sum | 3e-8 |

## Audition

- **Preview:** `?experiment=micro-18` → panel *Ultimate 3 · Voiceover mix* → **Soundtrack**:
  `Arabesque (approved)` / `Glide · TurboPuffer ref` / `Glide 2 · continuous arc`. Switching re-anchors playback at the playhead.
- **Export:** `pnpm exec tsx scripts/export-ultimate3-editable-vo.ts --settings handoff/pricing-timing-audio/preview-settings.json --out <path>.wav --bed glide` (or `--bed glide-arc`)
  (omit `--bed` for Arabesque). It refuses a bed built for a different phrase manifest.
- **Rebuild the bed:** `pnpm exec tsx scripts/build-ultimate3-glide-bed.ts [--style glide-arc] --out <new dir>`. It never overwrites.
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
