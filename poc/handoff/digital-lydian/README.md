# Digital Lydian: a sound design after the digital reference (LAM-2315)

This is a candidate soundtrack for the editable-v10 cut (2129 frames, 70.967 s). It replaces the piano with the
language of [`../sound-design-digital-inspo/`](../sound-design-digital-inspo/README.md). The approved arabesque mix,
the narration, the settings and the animation are unchanged: nothing in `public/` is written, and the viewer's
default mix is untouched.

- A (current): `lam-2305/ultimate3-tighter-cadence-arabesque-voiceover.mp4`
- B (candidate): `lam-2315/ultimate3-digital-lydian-voiceover.mp4`, plus `lam-2315/ultimate3-digital-lydian-music-only.mp4` with the bed alone

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

| Section | Music |
|---|---|
| Agent and trace stream | Gated Dmaj7♯11 blocks cut by the picture, with a hole every bar filled by Lydian data blips |
| Failure | Cut to dead air, a falling zap and one off-key G♮ blip |
| Backtrack and drawers | Blip runs down the scale, a blip and click per drawer, an 808 under the warning |
| Insights and zoom | Blocks over 8th hats, then 16ths and a riser into an 808 on the collapse |
| Cost | The half-time trap. Cheap-model legs are 32nd blip runs; the miss is a buffer stutter; the Bash window is a long 808; the budget tape-stops the whole track |
| "Until now" | A held sub and a high A, then 100 ms of silence |
| Flow-1 | The drop (808 and a wide stab), then the groove with stabs on the syncopations (I – II – iii – V). The bead landings climb the scale, the engine spins in blips, and the Signals door tape-stops into an 808 |
| Report prelude | Back to blocks and blips over 8th hats, a riser on the zoom-out, and a swelling block with a clap roll cut before the grid |
| Issue grid | The groove again, anchored on the grid. Every issue pop is a blip cascade, and the clusters lock on a stab |
| Conclusion and logo | The kit drops out and blocks switch on and off; the logo is one Dmaj7♯11 over a long 808 |
| Foley | Typing is data blips on D Lydian, one pitch per key. The window moves on zaps, shuts on a click, and the badges and send are blips and a rising zap |

Controls (all in `digital/`):

- `composition.ts`: the chord voicings (`I`, `II`, `iii`, `V`), the `LOOP`/`GROOVE` progressions and the `SCALE`. `trap()` options (`density`, `level`, `clap`, `stabs`, `grid`) and the per-section `level`/`cutoff`/`sub` of `chord()` set the balance.
- `instruments.ts`: the `sub808` pitch drop, fall, drive and decay, the `block` cutoff sweep, root, crush and buzz, and the blip level and length.
- `index.ts`: the room, delay and hall sends (`space`) and the master `eq`.
- Bed level under the voice: the third argument of the mix script (default -6.5 dB, the same as the approved bed).

## Reproduce

```sh
cd poc
# 1. Score (music + foley), mastered to -14 LUFS / -1.2 dBTP; about 8 s.
pnpm ultimate3:score --style digital-lydian --settings handoff/voiceover-tighter-cadence/default-settings.json \
  --seed 107290 --out /tmp/u3/digital.wav
# 2. Voiceover mix with the published chain (v10 phrases at their `at`, 15 ms fades, voice-keyed sidechain 3.5:1,
#    loudnorm -14.7), muxed over a silent render of the same settings.
node scripts/mix-ultimate3-candidate-vo.mjs /tmp/u3/digital.wav /tmp/u3/digital-vo.wav -6.5 \
  --video /tmp/u3/silent.mp4 --mp4 /tmp/u3/ultimate3-digital-lydian-voiceover.mp4
```

The same script run on `public/audio/voiceover/editable-v10/bed.wav` with a bed gain of `0` reproduces the A side's chain,
so the A/B below compares like with like.

## A/B and checks

| | A: arabesque (piano) | B: digital-lydian |
|---|---|---|
| Final mix | -14.9 LUFS, -1.0 dBTP | -15.0 LUFS, -1.0 dBTP (-0.8 dBFS after AAC) |
| Score master | | -14.0 LUFS, -1.2 dBTP, 2.2 dB peak limiting |
| Voice over bed, 300 Hz–4 kHz, median across phrases | +2.3 dB | +9.2 dB |
| Voice over bed, broadband, median | +5.3 dB | +2.3 dB (the sub) |
| faster-whisper `small.en` script recovery | 139/148 words | 142/148 words |
| Energy under 120 Hz / 250 Hz–4 kHz | | 84 % / 7 % (reference: 80 % / 10 %) |

- Audio and video are both 70.967 s; the WAV is padded and trimmed to the manifest's 3,406,400 samples.
- The score is deterministic for a given seed and settings, and the render counts every voice (for example 83 808 hits and 112 blocks).
- Not done: the split-arabesque viewer path. The editor's live preview still plays the arabesque bed, and a
  `digital-lydian` editable bed would need `build-ultimate3-issues4-vo.mjs` support before this could become the default.
