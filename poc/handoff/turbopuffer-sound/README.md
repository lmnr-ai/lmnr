# LAM-2316 — "Glide": alternate sound design after the TurboPuffer reference

A separate, auditionable soundtrack candidate for Ultimate 3. Nothing approved is replaced:
the A/subtle editable-v11 narration, `editable-v11/bed.wav` (Arabesque), the authoring
settings, the picture, the pricing animation and the paper texture are all unchanged.
The default preview and default export still use Arabesque.

- Candidate video (Glide + approved narration): https://svwyososwvsgouxwfdlc.supabase.co/storage/v1/object/public/lmnr-coding-agent/lam-2316/ultimate3-glide-turbopuffer-voiceover.mp4
- A/B, approved Arabesque mix, same picture: https://svwyososwvsgouxwfdlc.supabase.co/storage/v1/object/public/lmnr-coding-agent/lam-2316/ultimate3-arabesque-approved-ab.mp4

## Glide · minimal (linger) (`glide-minimal-linger`), the groove plays out

Feedback on the lift: the music that starts at "Unlock the insights…" stops as soon as the logo appears. It should carry on to the end so the rhythm lingers. Separately, several whoosh, cloud and zoom sounds were grainy, "like pouring sand or sandpaper", where they should feel like a gentle breeze, a pillow or a feather.

The review confirmed both:

1. **The groove did stop on the logo.** Its last hat was at beat 5.5, so there was no rhythm for the last 5.4 s. Bed loudness per bar ran -21.0 / -20.0 / -22.4 / -33.9 LUFS, ending in a ring-out about 20 dB down.
2. **The grain was band-passed white noise.** The 25 whooshes put their energy in 1–4 kHz, where the ear is most sensitive, and in their windows they supplied 70–100% of the score's 1–4 kHz.
3. **The `air` layers were flat white hiss.** The opening bed, bashExpand, gridShrink, the shimmers and the lift's logo riser and crash were 80–84% energy above 4 kHz.
4. **Grain showers.** Clicky counter ticks, the zoom's glint stream and shimmers of up to 70 grains a second land on the cloud and zoom moments.

The design:

- **Ending:** the groove runs four bars and ends on the bar line at 73.73 s.
  - **Bar A:** the lift's build into the logo.
  - **Bar B (logo, "with Laminar"):** a kick, bass and the open G, with a feather bloom instead of a hiss crash. The kick and hats keep going, with no snare and nothing in 500 Hz–4 kHz under the words.
  - **Bar C:** the full groove returns over Em9 → Cmaj9 at ×0.66, with a ghost fill.
  - **Bar D:** Gmaj9 lands on the downbeat with the last kick and one soft backbeat. The hats thin and fade, the last at 73.06 s, and the chord, sub and echoes decay by level.
- **Sound effects** (whole film, this style only; `glide/instruments.ts`):
  - `breeze` replaces every `whoosh` and `marker`: pink noise through a low-Q low-pass that rides the sweep, capped around 1.2 kHz, with a faint top, a 140 Hz floor and a raised-cosine swell. It has no band-pass and no resonance.
  - `feather` replaces the `air` hiss with lighter pink noise.
  - `blip` replaces the counter `tick`s with a pure tone and no noise click.
  - Shimmers (`soft`) and the zoom stream keep half their specks, which decay longer.

| | lift | linger |
|---|---|---|
| Integrated / true peak | -16.4 LUFS / -1.18 dBTP | same |
| Speech-band SNR: n21 / n22 / n23 / "with" onset | 4.0 / 7.3 / 8.0 / 6.7 dB | 4.0 / 7.7 / 7.2 / 6.3 dB |
| Bed per bar A / B / C / D (LUFS) | -21.0 / -20.0 / -22.4 / -33.9 | -20.7 / -20.7 / -17.8 / -21.9 |
| Hats in bars C–D | none | 9–35 dB onsets in every bar |
| Whooshes: 2–4 kHz share / centroid | 1–13% / 296–1252 Hz | 0–2% / 275–586 Hz |
| Whoosh level change, 1–2 / 2–4 / 4–8 kHz (median) | — | -4.2 / -8.8 / -11.8 dB, at about equal loudness |
| Logo riser, share above 4 kHz | 84% | 0.1% |
| Worst bed safety dip | -13.6 dB | -13.8 dB |
| Whisper | "…With Laminar." | "…With Laminar." |

- Bar C, right after "with Laminar", is about 3 dB louder in the bed than the bars around it because the duck releases after the last word. In the mix it is -17.5 LUFS, under the voiced bars and the film average, so it reads as the music taking over.
- Candidate video: https://svwyososwvsgouxwfdlc.supabase.co/storage/v1/object/public/lmnr-coding-agent/lam-2316/ultimate3-glide-minimal-linger-voiceover.mp4. It uses the same picture and settings as glide-minimal: `--settings handoff/turbopuffer-sound/minimal-settings.json --bed glide-minimal-linger`, rebuilt with `--style glide-minimal-linger`.
- glide, glide-minimal and glide-minimal-lift still rebuild byte-identically. The soft voices are new helpers, and every swap is gated on `ending === 'linger'`.

## Glide · minimal (lift) (`glide-minimal-lift`), the ending revised

Feedback on Glide · minimal: the drums build momentum and the excitement is finally satisfied at "Unlock the insights…", but "it still gets muffled at 'with Laminar'". A second review measured the ending. It found these causes, ranked:

1. **The ending deflated on the brand line.** The mix drops 4.6 LU from n22 to n23. Part of that is the take itself: "with Laminar" is the quietest and dullest phrase, -19.6 LUFS against -14.1 for n22, peaking at -4.7 dBFS, with 8.6 dB less 2–4 kHz. The bed made it worse. It fell 2.2 LU, and its 500 Hz–4 kHz body fell 5.7 dB, because the kit stopped, the pad darkened to Cmaj9 at .5 through 1.8 kHz, and the keys dropped out. Nothing was low-passed under the words.
2. **The payoff landed after the words.** The bed peaked at 68.55 s, 0.5 s after "Laminar", and the brand line sat on IV (C), only resolving to G afterwards.
3. **The conclusion was dark.** The groove's 2–8 kHz band sat 29 dB under its total level (earlier sections: 19 dB; the reference's music: 12–17 dB).
4. **The rest closed to 700 Hz,** so the logo hold also ended muffled.

The design is to land the payoff on the logo:

- The groove is unchanged in pattern. The hats are ×1.5 and swell through the last bar, and the groove pad is .7 through a 4.2 kHz filter. The keys are ×.75, which lifts n22's speech-band SNR from 5.6 to 7.3 dB.
- The harmony goes G → Em9 → **Dsus (V) in the gap after "agent traces"** → **G (I) on the logo**.
- On the logo, the kit stops on one hit (kick .9). A G2 bass and G1 sub swell in, a reversed-air riser leads into it, and a long bright air "crash" sits around 9 kHz. The chord is G voiced open and high (B5–D7), out of the octave where the bed masks the voice. "With Laminar" rides that crest.
- After the word, one soft keys bloom with glints answers on beat 8, deliberately smaller than the logo hit, followed by a high echo on beat 11.
- The chord rings to beat 10 and releases over 3.2 s, so it decays by level. A gentle close to 3.5 kHz starts only at beat 14.
- The builder levels this bed on the film before the conclusion only (`matchUntil`), so everything before 62.93 s is glide-minimal's bed to within -84 dBFS.

| | Glide · minimal | lift |
|---|---|---|
| Integrated / true peak | -16.4 LUFS / -1.18 dBTP | same |
| n22 / n23 / onset of "with": speech-band SNR | 5.6 / 6.2 / 3.9 dB | **7.3 / 8.0 / 6.7 dB** |
| Bed under n23 vs n22 | -2.2 LU | **+0.9 LU**; 4–16 kHz +8.3 dB |
| Loudest bed moment in the ending | 68.55 s, after the words | **67.05 s, on the logo** |
| Bed level at 70 / 72 / 73.5 s | — | -23.6 / -35.3 / -47.9 |
| Worst bed safety dip | -14.8 dB | -13.6 dB (the downbeat under "Unlock", unchanged) |
| Whisper | "…With Laminar." | "…With Laminar." |

- Candidate video: https://svwyososwvsgouxwfdlc.supabase.co/storage/v1/object/public/lmnr-coding-agent/lam-2316/ultimate3-glide-minimal-lift-voiceover.mp4. The picture is the same as glide-minimal's.
- Same settings as glide-minimal: `--settings handoff/turbopuffer-sound/minimal-settings.json --bed glide-minimal-lift`, rebuilt with `--style glide-minimal-lift`.
- **Not done (the biggest remaining lever):** about +3 dB of clip gain on n23. The review's prototype narrowed the n22 → n23 drop from 3.8 to 1.8 LU (n23 SNR 11 dB). It changes the approved narration's level and needs per-phrase gain in both `mixVoiceoverPcm` and the live preview, so it's left for a decision.

## Glide · minimal (`glide-minimal`), the minimal candidate

The feedback on Glide v1 was: "lacking polish". It suggested the music arrives at the very end and then cuts out after "with Laminar", and asked to keep the music in and hold the logo. Glide 2 stays as the more musical candidate.

A sound-design review agreed about the cut-off and found more behind the feeling, ranked:

1. **The ending was truncated, not resolved.** A fresh Gmaj9 pad and G2 bass started at 68.33 s, just as the duck released. Then the 0.35 s end fade chopped it at 69.15 s. Stopping the drums under "with Laminar" was right, but nothing answered it.
2. **The music arrived as one late block,** and the score limiter took 3 dB off the kit.
3. **The bed swelled to -14.7 LUFS between n22 and n23,** the loudest moment of the film. On top of that, the beat-5.5 keys' delay echoes landed on "with La-": n23's speech-band SNR was 3.5 dB.
4. **The voice was masked in the middle.** n12 (0.0 dB), n13 and n21 sat under 4 dB because of the Flow-1 keys and pads. The safety stage also punched holes in the bed: 3.2 s of dips deeper than 3 dB, the worst at -68 dB.

What changed. All of it lives in `composeGlide`/`designGlide` with `minimal = true`, and v1 rebuilds byte-identically.

- **The picture:** `minimal-settings.json` is `preview-settings.json` with `paperTexture: false` and a 6.75 s logo hold (`conclusion.logo.duration`, allocation 10.8). That makes 2212 frames (73.73 s), and the end lands exactly on conclusion beat 16.
- **The ending:** the duck now holds through the conclusion's pauses (`bridge` 1.3 s from the conclusion start), so the bed no longer swells between phrases. The beat-5.5 keys are gone.
  The answer lands on beat 8, 0.27 s after "Laminar": a soft kick, G bass, full Gmaj9 keys, pad, sub and four glints. Echoes follow on beats 10 and 12, and the low-pass then closes to 700 Hz by 73.39 s. The music keeps going under the logo and comes to rest; it doesn't stop.
- **Under the voice:** the Flow and Issues pads and the Flow-1 keys are lighter, and the Flow-1 keys are dry. The kit is at 0.55. The score renders at -20 LUFS, so it needs no limiting, and the ceiling is -1.25 dBFS.

| | Glide v1 | Glide · minimal |
|---|---|---|
| Integrated / peak | -16.3 LUFS / -1.3 dBTP | -16.4 LUFS / -1.2 dBFS sample, -1.18 dBTP; score limiter 0 dB |
| Speech-band SNR, median (min) | 7.6 dB (0.0) | 7.3 dB (4.0, n21); n12 4.7, n22 5.6, n23 6.2 |
| Worst bed safety dip | -68 dB | -14.8 dB |
| Ending | chord chopped at 69.15 s | answer at about -15.8 LUFS momentary (68.5 s), decaying to -45 by 73.5 s |
| Whisper small.en | full script | full script, ending "…millions of agent traces. With Laminar." |

- Candidate video: https://svwyososwvsgouxwfdlc.supabase.co/storage/v1/object/public/lmnr-coding-agent/lam-2316/ultimate3-glide-minimal-voiceover.mp4
- **Preview:** apply `handoff/turbopuffer-sound/minimal-settings.json` through **Settings JSON**, then pick *Glide · minimal* under **Soundtrack**.
- **Export:** `--settings handoff/turbopuffer-sound/minimal-settings.json --bed glide-minimal`. The export matches the builder's sum to 6e-8.
- **Rebuild:** `--style glide-minimal`, which defaults to that settings file.
- **Tests:** `pnpm -s ultimate3:score:test glide glide-minimal glide-arc` checks only the listed styles, in about 2 minutes. This change is audio-only, so the video tests were skipped.

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
  `Arabesque (approved)` / `Glide · TurboPuffer ref` / `Glide · minimal` / `Glide · minimal (lift)` / `Glide · minimal (linger)` / `Glide 2 · continuous arc`. Switching re-anchors playback at the playhead.
- **Export:** `pnpm exec tsx scripts/export-ultimate3-editable-vo.ts --settings handoff/pricing-timing-audio/preview-settings.json --out <path>.wav --bed glide` (or `--bed glide-arc`; `glide-minimal` uses `handoff/turbopuffer-sound/minimal-settings.json`)
  (omit `--bed` for Arabesque). It refuses a bed built for a different phrase manifest.
- **Rebuild the bed:** `pnpm exec tsx scripts/build-ultimate3-glide-bed.ts [--style glide-minimal|glide-arc] --out <new dir>`. It never overwrites.
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
