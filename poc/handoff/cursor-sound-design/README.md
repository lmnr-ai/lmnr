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
- Analysis and the redesign: see **Result (LAM-2317)** below.

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

## Result v3 (LAM-2317 second review): `cursor-paper-v3`, the live bed

- **New mix:** https://svwyososwvsgouxwfdlc.supabase.co/storage/v1/object/public/lmnr-coding-agent/lam-2317/ultimate3-cursor-v3-voiceover.mp4
- **New bed only:** https://svwyososwvsgouxwfdlc.supabase.co/storage/v1/object/public/lmnr-coding-agent/lam-2317/ultimate3-cursor-v3-music-only.mp4
- v2 and v1 stay available as `?bed=cursor-v2` / `--bed cursor-v2` and `?bed=cursor` / `--bed cursor`.

### Feedback and diagnosis

The client said v2 lacked the reference's nuance. Their specific points were:

- the whooshes were grainy, "like sandpaper";
- the bed was one chord with no texture, while the reference has a gentle piano melody;
- the reference's tactile effects were missing.

A sound-design review analysed the reference's Demucs music stem in detail and ranked the causes as follows:

1. **No re-articulation.** The reference has no hammered piano: its "melody" is soft keys that swell in over about 255 ms and repeat about every 0.84 s each, offset by about 0.28 s. That makes about 3.7 notes/s inside a near-static chord, which changes only about 8 times. v2's movement came from a lockstep ±5-cent beat at about 2 Hz, 21 dB deep, which reads as one throbbing chord. More chord changes would not fix it.
2. **Sandpaper.** The problem is quantity more than grain: 13 midrange noise slides sat in the voice band. Noise at 1.5–6 kHz had a p95 of −20.8 dB against the reference's −25.5 dB, with twice as many hot frames. The reference has only two smooth swishes.
3. **The wrong anatomy for tactile hits.** The reference's pops and thumps are pure sines on chord tones, flat in pitch, 20–40 ms long, dry and centred, with any click as a separate faint high layer. v2's knocks dropped in pitch, had an off-key wood mode and a 1.3 kHz noise click, and went through an echo.

### What v3 changes

- **Melody:** `swellKey` in `cursor/tactile.ts` is a near-sine with soft upper partials and a +12-cent chorus copy. `repeats` plays two or three voices of it, following the story:
  - an E♭–A♭–G cell for the agent;
  - F at the upward turn;
  - a climb to C5 for "If only";
  - two sinking voices for Cost;
  - an A♭3 pulse through "Until now";
  - the full cell from Flow-1 on, with IV and V on the camera moves;
  - two voices under the dense analysis lines;
  - an IV→V acceleration into the logo.

  Accents land on the number drops, the cover lift and the logo.
- **Bed:** `bed(…, CHORUS)` uses copies at 0/+7/−11 cents, offset per note, so no two notes beat together. It plays 3 dB under the keys, on fewer harmonies, with a 120 Hz low shelf that dips under each thump. The E♭4 modulation now sits at 0.5–0.75 Hz, the reference's rate; v2 was at 1.75 Hz.
- **Tactile foley:**
  - `pop`: chord-tone sines for the agent, the stream pulse, labels and the triangle shower.
  - `thump`: 104–139 Hz sines with double hits for the failure and the bash.
  - `droplet`: falling sines for the cloud settling, the cheap passes and the clusters.
  - `tick`: drawers, typing and the spinner.
  - `click`: the "If only" ping-pong, and Flow-1 landing hard left.
  - `dots`: the budget running down.

  Hits are dry: no echo, room ≤ 0.06.
- **Breath:** `breath` replaces `paper`. It is grain-free pink noise through Q 0.5 filters under a bell envelope, in a `pillow` or `feather` flavour, and it is used only five times. Noise at 1.5–6 kHz now has a p95 of −34.9 dB, with 4.7 % of frames hot (reference: −25.5 dB, 12.8 %).

The expert checked the first v3 render: the key rate, swell and decay match the reference, and the ticks, clicks and droplets sit at its level. Their follow-up tweaks are in this render:

- the low shelf, plus thumps 5 dB hotter after the bash;
- keys 1.5 dB lower under the Flow-1 lines;
- louder stream pops;
- brighter key partials, with no added noise;
- a two-voice Cost section.

### Checks on the final MP4

| Check | Result |
|---|---|
| Loudness | −16.2 LUFS |
| Loudness range | 4.3 LU |
| Peak | −0.2 dBTP, no clipping |
| Video | h264, 2085 frames, 69.5 s |
| Audio | AAC, 69.5 s |
| Voice over bed, per line | min 5.7 LU, median 7.2 (v2: min 5.0, median 6.9) |

The remaining peaks come from the voice take itself, which peaks at −1.55 dBFS alone, under the no-limiter export. Speech-to-text was not re-run.

Reproduce v3:

```sh
node scripts/build-ultimate3-cursor-bed.mjs   # editable-v11-cursor-v3, cursor-paper-v3 at -9.2 dB; refuses to overwrite
npx tsx scripts/export-ultimate3-editable-vo.ts --settings handoff/cursor-sound-design/preview-settings.json --out /tmp/cursor-v3-vo.wav
```

## Result v2 (LAM-2317 review): `cursor-paper-v2`

- **New mix:** https://svwyososwvsgouxwfdlc.supabase.co/storage/v1/object/public/lmnr-coding-agent/lam-2317/ultimate3-cursor-v2-voiceover.mp4
- **New bed only:** https://svwyososwvsgouxwfdlc.supabase.co/storage/v1/object/public/lmnr-coding-agent/lam-2317/ultimate3-cursor-v2-music-only.mp4

The client said v1 was "85 % there" but lacked polish. A sound-design review measured v1 against the reference and found these causes, ranked:

1. The bed was 22 separate pad chunks, which left holes at the chord changes (−11 dB at 38 s).
2. The section loudness spread was only 3.3 LU, so the music had no arc.
3. There were 249 small hits (3.6 per second): mickey-mousing with no punctuation.
4. The ending was cut off and heavy in the bass.
5. There was no glue on the master.
6. Six lines sat only 3.7 to 4.5 LU over the bed.

v2 fixes them as follows:

- **One undercurrent:** `cursor/bed.ts` holds one oscillator bank per note for the whole film. Chord changes are equal-power crossfades of only the notes that move, with E♭4 as a pedal. `bassLine` does the same for the bass, which still waits for Flow-1.
- **Arc:** `arcCursorV2` in `cursor/index.ts` multiplies the music bus by the story's gain curve:
  - Act 1 is small (−4.5 dB);
  - Cost climbs;
  - "Until now" is about 10 dB down;
  - Flow-1 opens up;
  - a long swell builds into the clusters;
  - an IV → V crescendo leads into the logo bloom;
  - the bed then decays fully (−45 dB) before the cut.

  The bed loudness of each section, after the trim, is:

  | Section | LUFS |
  |---|---|
  | Act 1 | −26.7 |
  | Cost | −23.8 |
  | "Until now" | −31.7 |
  | Flow-1 | −22.6 |
  | Swell | −21.4 |
  | Logo | −25.1 |
  | Tail | −36.5 |
- **Punctuation:** `cursor/composition-v2.ts` keeps only the story beats and plays them about 3.5 dB louder:
  - the agent, the pulse, the failure, the A♮ warning, the collapse, the bash, the depletion run-down;
  - the reveal, Flow-1's own bead, the cover shut, the native thump;
  - eight pops, six cluster locks and the logo.

  Tick runs are humanized (`ratchet({human: true})`). Every hit gets a little of the bed's hall.
- **Glue:** a new `ScoreStyle.master` hook runs `glueCursorV2`:
  - asymmetric tape saturation;
  - a slow 2:1 compressor that only holds peaks;
  - a mono low end below 120 Hz;
  - a faint tape-hiss floor.

  The hall return goes from 1.6 to 2.2.
- **Intelligibility:** `EXTRA_DUCK_DB` sets an extra duck for each line, and the bed trim is −9.2 dB (v1: −7.8). Every line clears the bed by at least 5.0 LU, with a median of 6.9; v1's minimum was 3.7.

Checks on the final MP4:

| Check | Result |
|---|---|
| Loudness | −16.2 LUFS |
| Peak | −0.2 dBTP, no samples at full scale |
| Video | h264, 2085 frames, 69.5 s |
| Audio | AAC, 69.5 s |
| Seams | the only drop above 3 dB in 100 ms is the designed fall into "Until now" |

Speech-to-text was not re-run for v2. The voice/bed margins it tracks improved on every line that was crowded in v1.

Reproduce v2:

```sh
node scripts/build-ultimate3-cursor-bed.mjs editable-v11-cursor-v2 cursor-sound-design cursor-paper-v2 -9.2   # v2; refuses to overwrite
npx tsx scripts/export-ultimate3-editable-vo.ts --settings handoff/cursor-sound-design/preview-settings.json --bed cursor-v2 --out /tmp/cursor-v2-vo.wav
```

Then mux the WAV onto the same silent picture, as below.

## Result v1 (LAM-2317)

Renders (preview-settings.json, 2085 frames / 69.5 s):

- **New mix:** https://svwyososwvsgouxwfdlc.supabase.co/storage/v1/object/public/lmnr-coding-agent/lam-2317/ultimate3-cursor-voiceover.mp4
- **Old piano mix, same picture (A/B):** https://svwyososwvsgouxwfdlc.supabase.co/storage/v1/object/public/lmnr-coding-agent/lam-2317/ultimate3-piano-voiceover-ab.mp4
- **New bed only:** https://svwyososwvsgouxwfdlc.supabase.co/storage/v1/object/public/lmnr-coding-agent/lam-2317/ultimate3-cursor-music-only.mp4

### What the reference does

Measured on a Demucs music stem of the M4A, plus Whisper, the picture and onset/motion alignment.

**Texture**

- One warm, sustained bed: 92 % harmonic, 8 % percussive.
- 46 % of the energy sits at 250–500 Hz and under 0.4 % above 2 kHz.
- It is fairly narrow (side −6 dB).
- It breathes at about 0.54 Hz.

**Harmony**

- A♭ major.
- A high E♭–G–A♭ cluster holds the first half with no bass.
- The bass arrives on "What if" (~26 s), then walks long I–IV–V–I pedals.

**Rhythm**

- Short (20–80 ms) paper-cutout knocks, thumps and ticks sit near 1.3 kHz.
- Pulses appear only while things move: a 0.42 s ping-pong, and a 65 ms tick ratchet as the computers multiply.
- Silences are used as punctuation, and it ends on a long fade.

**Motion**

- Loosely tied, not mickey-moused.
- 54 % of hits fall within 84 ms of a motion peak (39 % would by chance).

**Voice**

- The narrator sits about 6.5 dB over the music.
- The music swells about 2 dB in the gaps.

### What changed

The piano score is replaced end to end by the `cursor-paper` style (`src/experiments/micro-18/score/cursor/`). There is no piano and there are no samples.

**The bed**

- A tape-organ bed in A♭ with wow/flutter and a slow breath.
- The low-pass stays under about 1.8 kHz.
- The measured band balance is close to the reference: 28 / 16 / 40 / 11 % in 60–120 / 120–250 / 250–500 / 500–1 kHz.

**Act 1 (agent, failure, traces)**

- The high cluster plays alone.
- A dry knock pulse runs on the 120 BPM grid during the stream and stops dead at the failure, where the tape sags a quarter-tone.
- Mallets rise on the drawers.
- An A♮ against the bed is the film's only wrong note, on the warning.
- A tick ratchet runs over "thousands of traces".
- A low thump lands on the collapse.

**Cost**

- A borrowed D♭ minor.
- Directional tick flicks for the cheap passes.
- The heaviest thump on the bash.
- A falling mallet walk.
- The budget counter speeds up, then the tape slows a whole tone and the ticks run down through the depletion.
- Near-silence for "Until now".

**Flow-1 (the reference's "What if" moment)**

- The bass enters here for the first time.
- After that, harmony changes only with camera moves: IV on the pricing move, with a wide ratchet over the traces-per-dollar grid; V into the engine; a deep knock as the cover shuts.
- The benchmark beads are pentatonic mallets. Flow-1 lands highest, on a low knock.

**Issues**

- vi → IV under the report.
- V on the zoom-out, with a rising ratchet into the grid.
- I on landing, with a thin mallet cascade for the triangles and one chord tone per cluster lock.
- The agent window gets paper slides and a shut knock, paper-tap typing, and mallet badges.

**Conclusion**

- IV → V, then a reversed swell into a soft A♭maj9 bloom on the logo.
- There is no stab, so "with Laminar" stays clear.

**Voice-first mix**

- The music breathes −3.6 dB under each phrase (before mastering).
- Foley tucks 4 dB under words.
- Hits saturate rather than spike.
- A dry small room, a short dark hall and a quiet echo.
- The bed trim is −7.8 dB, against the piano's −6.5 dB.

### Checks (exported WAV and final MP4)

| | Cursor (new) | Piano (old) |
|---|---|---|
| Integrated (MP4) | −16.0 LUFS | −15.6 LUFS |
| True / sample peak (MP4) | −0.0 dBTP / −0.07 dBFS, 0 samples at full scale | +0.5 dBTP, 12 samples over full scale |
| Voice over bed during speech | +6.5 LU | +4.3 LU |
| Bed in gaps vs under speech | +1.8 LU | −1.1 LU |
| Whisper small.en word recovery per phrase (voice alone: 94.6 %) | 95.3 % | 93.9 % |
| Video / audio | h264 2085 frames 69.5 s / AAC 69.5 s | same |

- The remaining Whisper misses are names ("GPT-6 Sol", "Flow-1", "LLMs") that it also misses on the voice alone.
- The picture is the unchanged silent render with `preview-settings.json`; it was not re-timed.

### Reproduce

```sh
node scripts/build-ultimate3-cursor-bed.mjs editable-v11-cursor cursor-sound-design cursor-paper -7.8   # v1; refuses to overwrite
npx tsx scripts/export-ultimate3-editable-vo.ts --settings handoff/cursor-sound-design/preview-settings.json --out /tmp/cursor-vo.wav
npx tsx scripts/export-ultimate3-editable-vo.ts --settings handoff/cursor-sound-design/preview-settings.json --bed piano --out /tmp/piano-vo.wav
npx remotion render src/video/index.ts MicroAnimation18 /tmp/silent.mp4 --props=<{"settings": preview-settings.json}> --muted
ffmpeg -i /tmp/silent.mp4 -i /tmp/cursor-vo.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 320k -movflags +faststart out.mp4
```

For editable stems, run `pnpm ultimate3:score --style cursor-paper --settings handoff/cursor-sound-design/preview-settings.json --seed 107290 --stems --out <new>.wav`. It writes music, sfx, hall, room and delay; every cue is one line in `cursor/composition.ts`.

In the editor, v2 is live. Append `?bed=cursor` for v1 or `?bed=piano` for the piano bed.
