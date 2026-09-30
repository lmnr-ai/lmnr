# Digital Lydian: a sound design after the digital reference (LAM-2315)

This is a candidate soundtrack for the editable-v10 cut (2129 frames, 70.967 s). It replaces the piano with the
language of [`../sound-design-digital-inspo/`](../sound-design-digital-inspo/README.md). The approved arabesque mix,
the narration, the settings and the animation are unchanged: nothing in `public/` is written, and the viewer's
default mix is untouched.

- A (current): `lam-2305/ultimate3-tighter-cadence-arabesque-voiceover.mp4`
- B (candidate, v6): `lam-2315/ultimate3-digital-lydian-voiceover-v6.mp4`, plus `lam-2315/ultimate3-digital-lydian-music-only-v6.mp4` with the bed alone
- v5, the same bed with the pitched pings: `lam-2315/ultimate3-digital-lydian-voiceover-v5.mp4`
- v4, the same score with the earlier sine palette: `lam-2315/ultimate3-digital-lydian-voiceover-v4-fix.mp4`
- v3, which ducks the whole bed under the voice: `lam-2315/ultimate3-digital-lydian-voiceover-v3.mp4`
- v2, which scores over the picture rather than to it: `lam-2315/ultimate3-digital-lydian-voiceover-v2.mp4`

## What makes the reference

I decoded the reference and split it with Demucs (`htdemucs`) into voice and music, then measured the music stem.

| Trait | Reference (music stem) | How it shows up |
|---|---|---|
| Sub-first | 43 % of energy under 120 Hz (9 % under 60 Hz), peaking at 104 Hz; 29 % in 250 Hz–4 kHz and 4 % above 4 kHz | An 808 on D1 that drops about two octaves into its note in ~50 ms. The low end carries the track; the mids stay open for the voice. |
| Harmony | Dmaj7♯11 ↔ E/D, F♯m, A | Bright but uncanny Lydian. The ♯11 (G♯) is the signature colour. |
| Gating | Blocks start and stop on a sample | Chord blocks are switched, not faded, and silence is the punctuation. The breakdown is about 1 s of near dead air before the groove. |
| Data | Square blips around 1 kHz, pitch zaps | Telemetry sounds fill the holes between blocks. |
| Rhythm | Half-time trap, about 152 BPM, 0.1 s 16th hats | The 808 lands on 1, the "a" of 2 and the "and" of 3, with a clap on 3 and 32nd hat rolls. |
| Space | Near mono, dry, loud | Almost no reverb; a short echo on the blips. |
| Arc | Blocks → dense trap → breakdown → groove → hard stop | |

## What it does on Ultimate 3

The code is `src/experiments/micro-18/score/digital/`: `instruments.ts` holds the palette, `composition.ts` the score, and `index.ts` the style and foley.

### v6: foreground details that stay out of the way

The client liked the bed and the arc but not the pings. v6 changes only the foreground layer; the bed, the groove, the
routes and the space are v5's. A sound-design expert compared v5's foreground with Glide's (PR #2466), whose details
read as polish rather than as events. Intelligibility was never the problem: v5's pings cost almost no speech
audibility. What they did was capture attention. The expert's causes, ranked:

- **The pings sat in the voice's band (about 35 %).** The median ping partial was 1.18 kHz, and 270 tonal onsets in
  1–4 kHz fell inside speech. Anything in the voice's presence band competes for the same attention as the words
  (informational masking), even when it's quiet enough not to mask them.
- **They were melodies (about 25 %).** 252 notes during speech formed runs of three or more. The ear tracks a pitch
  sequence as a second line and follows it. Above about 5 kHz, pitch salience is weak, so the same rhythm reads as texture.
- **They talked over the narrator (about 15 %).** There were 5.8 onsets/s in speech, which is more than in the gaps.
  Glide takes turns: its details fill the gaps between phrases and thin out under them.
- **Level, centre pan, timbre and crest (the remaining 25 %).** The foreground sat 9.5 LU under the voice, and 54 %
  of the onsets were dead centre, on top of the voice. Taps, bells, zaps and blips changed timbre from hit to hit, so
  each one was a new event (novelty capture). Some notes were a semitone off the chord.

Glide's glint is a sine plus a short octave partial with a 1.5 ms attack at around 7 kHz. It is off-centre, one timbre
throughout, and fills the gaps. v6 adopts the principles, not the sound:

- **`glint` (`instruments.ts`)** replaces every pitched ping. It is a sine plus a 0.3 octave partial, with a 1.5 ms
  raised-cosine attack and a 60 ms decay. `hi()` (`composition.ts`) folds every ping onto E8–D9, holds the tonic D back
  before the drop, and moves any class that is a semitone off the sounding chord to the nearest scale tone.
- **Turn-taking.** `ping`, `bead`, `flick`, `alarm` and `shard` play the full gesture in the gaps. In speech they turn
  into sparser glints: streams, pops, cluster travel and logo rain are thinned by a golden-ratio `keep()`, and meters,
  spinners and scans run at half rate. Motif echoes are dry just before a phrase, so they don't land on its first word.
- **Off-centre.** Before the drop the specks alternate at ±0.12 (the returns are still mono); after it they sit at
  ±0.25–0.45.
- **Tick, droplet and typing.** `tick` moved to 5.9 kHz, the droplet's snap moved to 9 kHz, and its rise is 0.5 semitone
  (a 9-semitone bend swept into the voice's band). Typing is `thock`, a 700 Hz noise knock under a 180 Hz body. The
  window and send zaps are glints.

The expert's 15 checks on the split foreground (`split.mts`) against the narration:

| Check | v5 | v6 | Target |
|---|---|---|---|
| Foreground vs voice in 1–4 kHz, speech only | -7.3 dB | -26.3 dB | ≤ -24 |
| Median onset partial | 1.18 kHz | 6.6 kHz | ≥ 4.5 kHz |
| Tonal in-band onsets in speech / notes in melodic runs | 270 / 252 | 0 / 0 | ≤ 30 / ≤ 24 |
| Onsets per second in speech; gap density / speech density | 5.8; 0.76 | 3.6; 1.14 | ≤ 4; ≥ 1.1 |
| Foreground loudness vs voice | -9.5 LU | -14.3 LU | -20 to -14 |
| Onsets dead centre | 54 % | 16 % | ≤ 35 % |
| Spectral distance between consecutive onsets | 11.7 dB | 5.1 dB | ≤ 9 |
| Speech audibility lost to the foreground, p95 | 0.325 | 0.04 | guard |
| Checks passed | 2/15 | 13/15 | |

Two checks still fail, and they're a judgement call:

- **Foreground share in 1–4 kHz: 18.5 % against 12 %.** This is the hero motif and the warning, which play in the gaps.
  Glide's own foreground, bell included, measures 14.3 %.
- **Semitone clashes: 16.7 % against 12 %.** Few tonal onsets are left, and the flagged ones are the ♯11 motif and
  warning (on purpose) plus chroma false positives. A small time shift flips it to passing.

### v5: sound design polish

v5 follows a sound-design critique of v4, which the client heard as 85 % there but "amateur" in the individual
effects. The critic measured the palette against the reference and agreed only in part. The effects were the biggest
single cause, but not the only one, and repetition wasn't one of them (the reference repeats more). Its causes, ranked:

- **A test-tone palette (about 35 %).** The median SFX event had 2 partials; the whole mix had 19 spectral peaks against the reference's 42.
- **A dry vacuum (about 25 %).** The room return sat 40 dB under the music, so nothing shared a space.
- **Tonal balance (about 20 %).** 63 % of the energy was under 60 Hz, 7 % in 250 Hz–4 kHz and 0.4 % above 4 kHz.
  The 808 had no audible 2nd harmonic, and the blocks had nothing above 2 kHz.
- **Static synthesis (about 12 %).** Nothing drifted, and the `crush` sample-hold on the blocks added 17 dB of alias hash above 4 kHz.
- **The kit (about 8 %).** A mono clap and identical hats.

What changed (`instruments.ts` unless noted):

- **Taps (`blip`):** a 0.35 ms click, then a 2-operator FM tone that chirps 7 semitones down into its note in ~3 ms.
  Its index and a key-tracked low-pass close together, so the spectrum falls 1.3–1.4 octaves across the hit. There are two
  short upper partials, a biased saturator and a small body. Non-hero taps vary their FM index and chirp as well as level and time.
- **Blocks:** three drifting saws per tone. The cutoff bites open on the gate and settles in 25 ms, and a unity-gain
  saturator replaces `crush` (`drive`). After the drop, the saws spread ±0.35 (`width`). `chord()` caps the cutoff at 2 kHz
  before the drop, and at 2.4 kHz under the voice.
- **808:** biased saturation puts the 2nd harmonic 12 dB under the fundamental, so it reads on laptop speakers. The groove 808 rings longer.
- **Kit:** an 808-style hat (six square partials into a band-pass at about 10 kHz, with a varying decay and accents). The
  clap is four band-passed bursts with a decorrelated stereo tail.
- **Small voices:** `tick` is a struck resonator with three modes, `pure` a chirped bell with inharmonic partials, and
  `droplet` has a second partial. The flick is FM and saturated, darker than before.
- **Space (`index.ts`):**
  - A short, bright room (0.35 s) on the object, kit and texture routes.
  - The returns are summed to mono until the drop (`space.monoUntil`), so the first half gains depth without giving away width.
  - The master EQ tilts down 5.5 dB under 90 Hz and up 4 dB above 4.5 kHz.
- **Tried and dropped:** a music-bus glue compressor and parallel master saturation. The compressor worked against the
  track's own average, so it flattened the arc: the logo fell below the climb. The saturation measured as a no-op.

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
  - The per-section `level`, `cutoff`, `sub` and `pulse` of `chord()`. Before the drop, `chord()` caps the cutoff at 2 kHz and holds the level at 65 %, and `wide()` returns centre. Under the voice it caps it at 2.4 kHz.
  - `OBJ`, `ECHO` and `TEXTURE` are the routes for the object sounds.
- `instruments.ts`:
  - `sub808`: pitch drop, fall, drive and decay.
  - `block`: cutoff sweep, root, drive, width, swell and pulse.
  - `blip`: `length`, `bright` (the FM index and the opening of the low-pass), `body` and `exact`.
  - `sweep`: speed curve, split, grab and land.
  - Also `riser` (with a hat roll), `droplet`, `warn`, `tick`, `haze` and `meter`.
- `index.ts`: the room, delay and hall sends and returns (`space`, including `monoUntil`) and the master `eq`.
- Mix script:
  - `--chain approved` is the default: the published full-band duck with the bed at -6.5 dB.
  - `--chain carve` is v4's mix, with the bed at -7.5 dB. The third argument overrides the bed level.

## Reproduce

```sh
cd poc
# 1. Score (music + foley), mastered to -14 LUFS / -1.2 dBTP; about 11 s.
pnpm ultimate3:score --style digital-lydian --settings handoff/voiceover-tighter-cadence/default-settings.json \
  --seed 107290 --out /tmp/u3v4/digital.wav
# 2. Voiceover mix with the carve chain (v10 phrases at their `at`, 15 ms fades, static -7.5 dB bed with an EQ carve,
#    a 2:1 duck on 250 Hz–5 kHz only, two-pass linear loudnorm -14.7), muxed over a silent render of the same settings.
node scripts/mix-ultimate3-candidate-vo.mjs /tmp/u3v4/digital.wav /tmp/u3v4/digital-vo.wav --chain carve \
  --video /tmp/u3/silent.mp4 --mp4 /tmp/u3v4/ultimate3-digital-lydian-voiceover-v6.mp4
# 3. Music only: the score over the same silent render.
ffmpeg -i /tmp/u3/silent.mp4 -i /tmp/u3v4/digital.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 320k -shortest \
  /tmp/u3v4/ultimate3-digital-lydian-music-only-v6.mp4
```

The same script run on `public/audio/voiceover/editable-v10/bed.wav` with a bed gain of `0` (and the default
`--chain approved`) reproduces the A side's chain, so the A/B below compares like with like. v2 and v3 used the approved chain
at -6.5 dB.

## A/B and checks

| | A: arabesque (piano) | digital v2 | digital v3 | digital v4 | digital v5 | B: digital v6 |
|---|---|---|---|---|---|---|
| Final mix | -14.9 LUFS, -1.0 dBTP | -15.0 LUFS, -1.0 dBTP | -14.8 LUFS, -1.0 dBTP | -14.6 LUFS, -1.0 dBFS peak | -14.7 LUFS, -1.0 dBFS peak | -14.7 LUFS, -1.0 dBFS peak |
| Score master | | -14.0 LUFS, -1.2 dBTP, 2.4 dB limiting | -14.0 LUFS, -1.2 dBTP, 2.9 dB limiting | -14.0 LUFS, -1.2 dBTP, 2.8 dB limiting | -14.1 LUFS, -1.2 dBTP, 7.5 dB peak limiting (over 1 dB 4.3 % of the time) | -14.1 LUFS, -1.2 dBTP, 7.7 dB peak limiting |
| Bed gain reduction under the voice, median (p95) | full band | full band | full band, 13.6 dB | 250 Hz–5 kHz only, 2.3 dB (4.2 dB); none elsewhere | same chain as v4 | same chain as v4 |
| Voice over bed, 300 Hz–4 kHz, median (worst phrase) | +2.3 dB (-4.2) | +9.2 dB (+1.4) | +8.0 dB (+0.9) | +8.2 dB (+1.9) | +8.1 dB (+3.3) on a -9 dB carve model (v4 on the same model: +9.7, +3.4); worst 250 ms window -15.9 dB (v4: -20.1) | +10.8 dB (+6.3) on the same model; worst 250 ms window -16.4 dB |
| Voice over bed, broadband, median | +5.3 dB | +2.3 dB | +3.1 dB | +1.6 dB (K-weighted), with no duck | | |
| faster-whisper `small.en` script recovery | 139/148 words | 142/148 words | 141/149 words | 144/149 words | 145/149 words | 144/149 words |
| Energy under 120 Hz / 250 Hz–4 kHz | | 83 % / 7 % | 81 % / 9 % | 85 % / 7 % | 72 % / 11 % (reference: 43 % / 29 %) | |
| First half (0–19.7 s) vs drop, LUFS | | | -18.0 / -13.7 vs -12.2 | -19.5 / -15.2 vs -10.8 | -19.8 / -15.9 vs -11.6 | -21.1 / -16.0 vs -11.5 |
| Climb vs logo, LUFS | | | -13.5 vs -12.7 | -13.1 vs -11.7 | -14.5 vs -12.9 | -14.7 vs -12.2 |
| Sustained tones over 120 ms in the SFX stem | | | 5, including 0.55 s glides | 9, all repeated taps (longest 0.29 s) | | |
| Audio onsets (of which over a static picture) | | 301 (28 %) | 178 (26 %) | 226 (21 %) | | |
| Picture onsets with sound within 67 ms (median offset) | | 50 % (68 ms) | 48 % (74 ms) | 59 % (46 ms) | | |
| Onsets that jump ≥ 3 dB in 300 Hz–10 kHz (median jump) | | 10 % (-0.6 dB) | 34 % (+1.3 dB) | 28 % (+0.8 dB) | | |
| Motion energy vs 300 Hz–10 kHz loudness, correlation | | 0.04 | 0.19 | 0.14 | | |

The motion measures come from frame differences of the silent render against onset and band-loudness curves of the score. The onset hit rate is a strict proxy and barely moves: v3 has about 40 % fewer onsets, so a larger share of its sounds are placed on the picture's events. The reaction measures show the change. A v3 onset is a real event: a third of them jump at least 3 dB, against a tenth in v2, and the sound's loudness now follows how much the picture moves.
v4's taps and pushes land closer to the picture (59 % within 67 ms). Its jump rate and correlation fall back a little, though. The first half is deliberately quieter and narrower, and several hits now land on the dead air that follows a cut rather than on the cut itself.

v5 was checked against the critic's 39 acceptance measures (isolated voices plus the master). v4 passes 4 of them and
v5 passes 36. Three still miss:
- The mids are 11 % of the energy against a 12 % floor.
- The median per-onset side/mid is -29 dB against -27 dB. This one is by design: the first half is mono.
- The 400 ms crest factor is 10.96 dB against an 11 dB floor.

The motion rows weren't re-measured, because v5 keeps v4's event timing. Measured with the critic's figures, the
reference's energy peaks at 104 Hz and only 43 % of it sits under 120 Hz. The 80 % that earlier versions of this README
gave was mis-measured.

Mixing notes (hard-won):

- On a sub-heavy bed, any full-band duck is heard as the music dimming. The ear follows the 808, and the 808 is where the gain reduction lands. Carve the voice's band and duck only that.
- Single-pass `loudnorm` is dynamic and adds its own slow pumping. Measure first, then apply with `linear=true`. The measurement JSON goes to stderr, after the ffmpeg log.
- With the carve, -5 dB left the voice level with the bed (K-weighted median -0.9 dB). At -7.5 dB it matches v3's intelligibility without a full-band duck.
- `Mix.emit` ignores `route.pan` for stereo buffers (when `left !== right`), so a stereo voice applies `panGains` itself.
- `--stems` writes the reverb and echo stems before their return gain (`space.returns`). Add `20·log10(return)` before comparing them with the music stem.
- `Svf.bp` peaks at a gain of Q. When you raise a resonator's Q for a longer ring, scale its gain by the ratio of the old Q to the new one.
- Compressing the music bus against the track's own average RMS flattens the arc: the loudest sections take the most gain reduction. On this score it cost the drop and the logo about 1.2 dB each.
- A foreground detail in the voice's 1–4 kHz band grabs attention even when it costs no intelligibility. Speech-audibility
  measures pass while the listener still hears "pings". Measure the foreground's share of that band during speech, and its onset rate.
- The checker's split (`split.mts`) counts a kind as foreground by its `mix.count()` name, so the 808's sub zaps count as `subZap`, not `zap`.
- Echoes on a gap's motif spill onto the next phrase's first word. Keep them dry when a phrase starts within the echo.
- A droplet's pitch bend sweeps through every band between its start and its note: a 9-semitone rise from 7 kHz passes 3–4 kHz.
- In v5 the pings carried much of the room and echo energy and the mids. Without them, the critic's v5 checks now miss
  the room return (20–21 dB under the music against 14–20), the echo return (33 dB against 16–24), the mids (7.8 %
  against 12 %) and energy under 60 Hz (46.3 % against 45 %). That leaves 33/39, against v5's 36. Raising the block and
  kit sends moved these numbers only slightly, and it changed the bed, so v6 leaves them as they were.
- In the master, sub-heavy moments (the drop, the logo) are limited by peak. Raising their 808 mostly feeds the limiter; take energy out of the sections around them instead.

- Audio and video are both 70.967 s; the WAV is padded and trimmed to the manifest's 3,406,400 samples.
- The score is deterministic for a given seed and settings (`pnpm ultimate3:score:test`).
- Not done: the split-arabesque viewer path. The editor's live preview still plays the arabesque bed, and a
  `digital-lydian` editable bed would need `build-ultimate3-issues4-vo.mjs` support before this could become the default.
