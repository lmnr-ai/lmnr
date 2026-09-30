# Digital Lydian: a sound design after the digital reference (LAM-2315)

This is a candidate soundtrack for the editable-v10 cut (2129 frames, 70.967 s). It replaces the piano with the
language of [`../sound-design-digital-inspo/`](../sound-design-digital-inspo/README.md). The approved arabesque mix,
the narration, the settings and the animation are unchanged: nothing in `public/` is written, and the viewer's
default mix is untouched.

- A (current): `lam-2305/ultimate3-tighter-cadence-arabesque-voiceover.mp4`
- B (candidate, v4): `lam-2315/ultimate3-digital-lydian-voiceover-v4-final.mp4`, plus `lam-2315/ultimate3-digital-lydian-music-only-v4.mp4` with the bed alone
- v3, which ducks the whole bed under the voice: `lam-2315/ultimate3-digital-lydian-voiceover-v3.mp4`
- v2, which scores over the picture rather than to it: `lam-2315/ultimate3-digital-lydian-voiceover-v2.mp4`

## What makes the reference

I decoded the reference and split it with Demucs (`htdemucs`) into voice and music, then measured the music stem.

| Trait | Reference (music stem) | How it shows up |
|---|---|---|
| Sub-first | 80 % of energy under 120 Hz (46 % under 60 Hz) | An 808 on D1 that drops about two octaves into its note in ~50 ms. The low end carries the track; the mids stay open for the voice. |
| Harmony | Dmaj7♯11 ↔ E/D, F♯m, A | Bright but uncanny Lydian. The ♯11 (G♯) is the signature colour. |
| Gating | Blocks start and stop on a sample | Chord blocks are switched, not faded, and silence is the punctuation. The breakdown is about 1 s of near dead air before the groove. |
| Data | Square blips around 1 kHz, pitch zaps | Telemetry sounds fill the holes between blocks. |
| Rhythm | Half-time trap, about 152 BPM, 0.1 s 16th hats | The 808 lands on 1, the "a" of 2 and the "and" of 3, with a clap on 3 and 32nd hat rolls. |
| Space | Near mono, dry, loud | Almost no reverb; a short echo on the blips. |
| Arc | Blocks → dense trap → breakdown → groove → hard stop | |

## What it does on Ultimate 3

The code is `src/experiments/micro-18/score/digital/`: `instruments.ts` holds the palette, `composition.ts` the score, and `index.ts` the style and foley.

### v4: the voice without the dimming, tactile objects, and a withheld tonic

v4 follows a music-production critique of v3. It found three causes:

- **The dimming.** v3's full-band sidechain took a median 13.6 dB off the whole bed under the voice, 23 times. The score also thinned itself for the voice, so the sub, which is 80 % of the energy, pumped with every phrase.
- **The whines.** Long zaps and glides with no envelope, at 0.6–2.4 kHz. Some were semitone dyads, and there was sample-hold aliasing on top.
- **No arc.** The first half already had the tonic, the full motif and the width, so the drop had nothing new to give.

What changed:

- **Mix (`--chain carve`).**
  - The bed is static at -7.5 dB.
  - A fixed EQ cuts 3 dB at 380 Hz and 2 dB at 2.8 kHz.
  - A 2:1 duck acts on 250 Hz–5 kHz only. The 808 and the hats never move.
  - The voice is lightly compressed, brightened and de-essed.
  - The loudness pass has two stages, the second one linear.
  - The score itself no longer reacts to the voice.
- **Tactile palette.**
  - Every blip is a tap: a 3.5 kHz transient, a body that drops an octave in 6 ms, and a square tone closing to 1.2 kHz.
  - Taps vary by ±1.5 dB and ±3 ms; hero hits don't.
  - Every non-sub zap is a flick of at most 90 ms, low-passed at 3 kHz.
  - The glides are gone. The swarm walks the scale on 16th taps instead.
  - Camera moves are pink-noise pushes that grab on their first frame and land with a 55 → 45 Hz thump.
  - The warning is a major 7th (A5 under G♯6), not a semitone.
  - Log ticks clack, and accents rise in pitch.
  - The budget meter is a train of taps that speeds up and rises as it fills, then slows, falls and darkens as it drains.
- **The withheld tonic.** Before "Introducing Flow-1":
  - no bass note is D (the stream sits on F♯);
  - the chords stop under 1.2 kHz and are held at 80 %;
  - the motif never completes;
  - the groove has no clap and no 16th hats;
  - every pan is centre.

  The drop delivers all of it at once: an 808 D1, a wide octave stab, the clap and the full motif. The first half sits 4–5 dB under the drop.
- **The triumph.**
  - The ending climbs over D: I → E/D → F♯m/D → A/D, into an A/D swell and a riser with a hat roll, under a rain of taps that thickens with the zoom.
  - The logo lands dark and narrow.
  - After "Laminar", a second 808 blooms Dmaj9♯11 across four octaves, wide. The motif resolves A → D, and three D7 echoes follow.

### v3 and earlier

v3 is scored to the motion, following two passes of review from a sound-design critic:

- **Camera moves:** each one is a `sweep` shaped to its speed curve. The sweep is split (body plus air) under the voice and gated on the frame the move lands. Ease-out moves land at 70 % of their span; short moves peak early and start a frame early, with a click on the first frame.
- **One sound per object:**
  - The blue agent is a droplet with a fifth; the purple agent is a detuned droplet.
  - Each span type has its own blip: Thinking 85, Read 88, Write 81.
  - The warning is a G♯/A dyad, and the clouds and smoke are crushed haze.
  - The budget is a held square: its pitch is the fill, and it crushes as the budget drains.
  - The window is a zap plus a latch (a low zap, a click and a D7 tick).
- **Five tier-A hits:** Bash, the drop, the door, the grid and the logo. Each comes out of dead air and has the only 808 on its downbeat; the groove anchored on it leaves bar 1's downbeat to the hit.
- **The groove is earned.** It runs only in Cost (from Bash), in Flow-1 and on the issue grid. It drops out during big moves (`mute`), leaves only the 808 during medium moves (`bare`), and thins to quarter hats while the picture holds (`still`). (v3 also thinned the stabs under the voice; v4 doesn't.)
- **Harmony follows the picture.** The Flow-1 chords change on the analysis move (V) and the "20×" settle (I). The issue grid is stretched 4 % so its third bar line lands on I at the clusters' lock.

| Section | Motion → sound |
|---|---|
| Agent and trace stream | The agent's droplet; the pill's block opens its filter as it grows; each span switches the chord on its snap frame |
| Failure → drawers | A falling zap into dead air, and one off-key G♮. The upward turn is a rising zap, with F♯m on its settle. The backtrack is a panned sweep, and each drawer glides into its note and latches |
| Warning → collapse | The scan stops 60 ms before the warning. G♯ø opens with the insights move, the zoom opens the filter over a riser, and the collapse is an 808 with a shatter of soft warnings on G♯ |
| Cost | The cloud parts on haze; a thin, dark trap; each leg is a panned sweep and blip run; three warnings fall off and the buffer stutters |
| Powerful LLMs | The biggest sweep in the film ends 100 ms before Bash. The purple agent drops down the log, and the budget meter fills, holds and drains while the score tape-stops |
| "Until now" → Flow-1 | A held breath, a sweep into 310 ms of dead air, then the drop: an 808, an octave stab and the motif E6–G♯6–A6. Flow-1's bead falls on a rising zap into the motif |
| Engine and door | The engine sweep, the module on the motif, an accelerating spinner, converging cover zaps, a reversed block into the shut, and a heartbeat on A |
| Report prelude | The blue agent hops down the log, the labels read true/false/critical, and the collapse is sucked in by a reversed 808 zap. Circle-grow pops sound as the circle passes each triangle |
| Issue grid | The grid hit, then six cluster voices glide from scattered pitches onto Dmaj7♯11, each arriving on its cluster's lock |
| Conclusion and logo | The chord climbs I → iii → V → E/D with a sparse shimmer following the zoom's speed, and an E/D swell holds I back. The logo is I with the whole motif flicked in before "with"; the motif resolves A → D after "Laminar" |
| Foley | Typing is data blips on D Lydian, one pitch per key. The window moves on sweeps and zaps and shuts on a latch; the badges are the blue agent's droplet; the send is a rising zap over a hat roll |

Controls (all in `digital/`):

- `composition.ts`:
  - The chord voicings: `I`, `Iwant` (the first half's I on F♯), `II`, `iii`, `V`, `vi`, `iv0` and `Isharp`, plus `onD()`, which puts D under a chord.
  - `STREAM` (the span-snap fractions), `SCALE` and `MOTIF`.
  - The `trap()` options: `level`, `clap`, `stabs`, `hats`, `q`, `mute`, `bare`, `still` and `hits`.
  - The per-section `level`, `cutoff`, `sub` and `pulse` of `chord()`. Before the drop, `chord()` caps the cutoff at 1.2 kHz and holds the level at 80 %, and `wide()` returns centre.
  - `OBJ`, `ECHO` and `TEXTURE` are the routes for the object sounds.
- `instruments.ts`:
  - `sub808`: pitch drop, fall, drive and decay.
  - `block`: cutoff sweep, root, crush, swell and pulse.
  - `blip`: `length`, `bright`, `body` and `exact`.
  - `sweep`: speed curve, split, grab and land.
  - Also `riser` (with a hat roll), `droplet`, `warn`, `tick`, `haze` and `meter`.
- `index.ts`: the room, delay and hall sends (`space`) and the master `eq`.
- Mix script:
  - `--chain approved` is the default: the published full-band duck with the bed at -6.5 dB.
  - `--chain carve` is v4's mix, with the bed at -7.5 dB. The third argument overrides the bed level.

## Reproduce

```sh
cd poc
# 1. Score (music + foley), mastered to -14 LUFS / -1.2 dBTP; about 8 s.
pnpm ultimate3:score --style digital-lydian --settings handoff/voiceover-tighter-cadence/default-settings.json \
  --seed 107290 --out /tmp/u3v4/digital.wav
# 2. Voiceover mix with the carve chain (v10 phrases at their `at`, 15 ms fades, static -7.5 dB bed with an EQ carve,
#    a 2:1 duck on 250 Hz–5 kHz only, two-pass linear loudnorm -14.7), muxed over a silent render of the same settings.
node scripts/mix-ultimate3-candidate-vo.mjs /tmp/u3v4/digital.wav /tmp/u3v4/digital-vo.wav --chain carve \
  --video /tmp/u3/silent.mp4 --mp4 /tmp/u3v4/ultimate3-digital-lydian-voiceover-v4.mp4
# 3. Music only: the score over the same silent render.
ffmpeg -i /tmp/u3/silent.mp4 -i /tmp/u3v4/digital.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 320k -shortest \
  /tmp/u3v4/ultimate3-digital-lydian-music-only-v4.mp4
```

The same script run on `public/audio/voiceover/editable-v10/bed.wav` with a bed gain of `0` (and the default
`--chain approved`) reproduces the A side's chain, so the A/B below compares like with like. v2 and v3 used the approved chain
at -6.5 dB.

## A/B and checks

| | A: arabesque (piano) | digital v2 | digital v3 | B: digital v4 |
|---|---|---|---|---|
| Final mix | -14.9 LUFS, -1.0 dBTP | -15.0 LUFS, -1.0 dBTP | -14.8 LUFS, -1.0 dBTP | -14.6 LUFS, -1.0 dBFS peak |
| Score master | | -14.0 LUFS, -1.2 dBTP, 2.4 dB limiting | -14.0 LUFS, -1.2 dBTP, 2.9 dB limiting | -14.0 LUFS, -1.2 dBTP, 2.8 dB limiting |
| Bed gain reduction under the voice, median (p95) | full band | full band | full band, 13.6 dB | 250 Hz–5 kHz only, 2.3 dB (4.2 dB); none elsewhere |
| Voice over bed, 300 Hz–4 kHz, median (worst phrase) | +2.3 dB (-4.2) | +9.2 dB (+1.4) | +8.0 dB (+0.9) | +8.2 dB (+1.9) |
| Voice over bed, broadband, median | +5.3 dB | +2.3 dB | +3.1 dB | +1.6 dB (K-weighted), with no duck |
| faster-whisper `small.en` script recovery | 139/148 words | 142/148 words | 141/149 words | 144/149 words |
| Energy under 120 Hz / 250 Hz–4 kHz | | 83 % / 7 % | 81 % / 9 % | 85 % / 7 % (reference: 80 % / 10 %) |
| First half (0–19.7 s) vs drop, LUFS | | | -18.0 / -13.7 vs -12.2 | -19.5 / -15.2 vs -10.8 |
| Climb vs logo, LUFS | | | -13.5 vs -12.7 | -13.1 vs -11.7 |
| Sustained tones over 120 ms in the SFX stem | | | 5, including 0.55 s glides | 9, all repeated taps (longest 0.29 s) |
| Audio onsets (of which over a static picture) | | 301 (28 %) | 178 (26 %) | 226 (21 %) |
| Picture onsets with sound within 67 ms (median offset) | | 50 % (68 ms) | 48 % (74 ms) | 59 % (46 ms) |
| Onsets that jump ≥ 3 dB in 300 Hz–10 kHz (median jump) | | 10 % (-0.6 dB) | 34 % (+1.3 dB) | 28 % (+0.8 dB) |
| Motion energy vs 300 Hz–10 kHz loudness, correlation | | 0.04 | 0.19 | 0.14 |

The motion measures come from frame differences of the silent render against onset and band-loudness curves of the score. The onset hit rate is a strict proxy and barely moves: v3 has about 40 % fewer onsets, so a larger share of its sounds are placed on the picture's events. The reaction measures show the change. A v3 onset is a real event: a third of them jump at least 3 dB, against a tenth in v2, and the sound's loudness now follows how much the picture moves.
v4's taps and pushes land closer to the picture (59 % within 67 ms). Its jump rate and correlation fall back a little, though. The first half is deliberately quieter and narrower, and several hits now land on the dead air that follows a cut rather than on the cut itself.

Mixing notes (hard-won):

- On a sub-heavy bed, any full-band duck is heard as the music dimming. The ear follows the 808, and the 808 is where the gain reduction lands. Carve the voice's band and duck only that.
- Single-pass `loudnorm` is dynamic and adds its own slow pumping. Measure first, then apply with `linear=true`. The measurement JSON goes to stderr, after the ffmpeg log.
- With the carve, -5 dB left the voice level with the bed (K-weighted median -0.9 dB). At -7.5 dB it matches v3's intelligibility without a full-band duck.

- Audio and video are both 70.967 s; the WAV is padded and trimmed to the manifest's 3,406,400 samples.
- The score is deterministic for a given seed and settings (`pnpm ultimate3:score:test`).
- Not done: the split-arabesque viewer path. The editor's live preview still plays the arabesque bed, and a
  `digital-lydian` editable bed would need `build-ultimate3-issues4-vo.mjs` support before this could become the default.
