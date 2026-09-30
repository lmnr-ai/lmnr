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

## Result (LAM-2317)

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
node scripts/build-ultimate3-cursor-bed.mjs                  # new dir only; refuses to overwrite
npx tsx scripts/export-ultimate3-editable-vo.ts --settings handoff/cursor-sound-design/preview-settings.json --out /tmp/cursor-vo.wav
npx tsx scripts/export-ultimate3-editable-vo.ts --settings handoff/cursor-sound-design/preview-settings.json --bed piano --out /tmp/piano-vo.wav
npx remotion render src/video/index.ts MicroAnimation18 /tmp/silent.mp4 --props=<{"settings": preview-settings.json}> --muted
ffmpeg -i /tmp/silent.mp4 -i /tmp/cursor-vo.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 320k -movflags +faststart out.mp4
```

For editable stems, run `pnpm ultimate3:score --style cursor-paper --settings handoff/cursor-sound-design/preview-settings.json --seed 107290 --stems --out <new>.wav`. It writes music, sfx, hall, room and delay; every cue is one line in `cursor/composition.ts`.

In the editor, the new bed is live. Append `?bed=piano` for the old one.
