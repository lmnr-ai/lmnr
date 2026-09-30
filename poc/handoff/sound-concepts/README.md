# LAM-2311 — alternate sound designs for Ultimate 3

These concepts replace the Arabesque piano bed and thocks entirely; the narration is unchanged. Rounds 1–3 were rendered on the voiceover-soak cut (`handoff/voiceover-soak/default-settings.json`, editable-v7 voice, 2315 frames) and mixed with a sidechain duck. `tempesta` v2 is rendered on the current quicker-trace cut (`handoff/voiceover-quicker-trace/default-settings.json`, editable-v9 voice, 2278 frames) with the bed at one constant level. Style notes are in [`score/README.md`](../../src/experiments/micro-18/score/README.md#tidepool-lumen-windup--rounded-digital-concepts-lam-2311).

| Concept | Character | Review MP4 (with voiceover) |
|---|---|---|
| `tidepool` | Kalimba, marimba and water; F major, 96 BPM; the stream blocks play the melody | [ultimate3-tidepool-voiceover-v1.mp4](https://svwyososwvsgouxwfdlc.supabase.co/storage/v1/object/public/lmnr-coding-agent/lam-2311/ultimate3-tidepool-voiceover-v1.mp4) |
| `lumen` | Sine-blip arpeggio, FM glass and a soft four-on-the-floor; A major, 120 BPM | [ultimate3-lumen-voiceover-v1.mp4](https://svwyososwvsgouxwfdlc.supabase.co/storage/v1/object/public/lmnr-coding-agent/lam-2311/ultimate3-lumen-voiceover-v1.mp4) |
| `windup` | Clockwork toy: escapement, music box, springs and ratchets; swung G major, 112 BPM | [ultimate3-windup-voiceover-v1.mp4](https://svwyososwvsgouxwfdlc.supabase.co/storage/v1/object/public/lmnr-coding-agent/lam-2311/ultimate3-windup-voiceover-v1.mp4) |
| `bluenote` | Round 2, jazz: swinging piano trio + vibes, big-band shout on Flow-1, Basie ending; F → A♭, 152 BPM | [ultimate3-bluenote-voiceover-v1.mp4](https://svwyososwvsgouxwfdlc.supabase.co/storage/v1/object/public/lmnr-coding-agent/lam-2311/ultimate3-bluenote-voiceover-v1.mp4) |
| `overdrive` | Round 2, maximal: trailer braams, taiko and celli, festival supersaw drops, fake-outs, key change on the logo; D minor → D major → E♭, 128 BPM | [ultimate3-overdrive-voiceover-v1.mp4](https://svwyososwvsgouxwfdlc.supabase.co/storage/v1/object/public/lmnr-coding-agent/lam-2311/ultimate3-overdrive-voiceover-v1.mp4) |
| `tempesta` | Round 3, classical: a virtuoso violin concerto at presto (Vivaldi "Summer" / Paganini), sampled solo violin over tremolo strings, hammered celli and timpani; G minor → G major, 144 BPM | v2 (editable-v9 cut, no ducking, no noise sources): [ultimate3-tempesta-v9-voiceover-v2.mp4](https://svwyososwvsgouxwfdlc.supabase.co/storage/v1/object/public/lmnr-coding-agent/lam-2311/ultimate3-tempesta-v9-voiceover-v2.mp4); v1: [ultimate3-tempesta-voiceover-v1.mp4](https://svwyososwvsgouxwfdlc.supabase.co/storage/v1/object/public/lmnr-coding-agent/lam-2311/ultimate3-tempesta-voiceover-v1.mp4) |

## Reproduce

```sh
cd poc && pnpm install --frozen-lockfile
# silent picture of the current cut (~6 min); add --browser-executable ~/.cache/puppeteer/chrome/linux-*/chrome-linux64/chrome on Linux
echo "{\"settings\": $(cat handoff/voiceover-quicker-trace/default-settings.json)}" > /tmp/props.json
npx remotion render src/video/index.ts MicroAnimation18 out/u3-v9-silent.mp4 --props=/tmp/props.json --muted
pnpm ultimate3:score --style tempesta --settings handoff/voiceover-quicker-trace/default-settings.json --out out/concepts/tempesta.wav
node scripts/mix-ultimate3-concept.mjs --bed out/concepts/tempesta.wav --out out/concepts/u3-tempesta-vo.mp4 --bed-db=-7
# rounds 1-2 as published: the voiceover-soak picture, editable-v7 and the duck (negative values need `=`)
S=handoff/voiceover-soak/default-settings.json
pnpm ultimate3:score --style overdrive --settings $S --out out/concepts/overdrive.wav
node scripts/mix-ultimate3-concept.mjs --bed out/concepts/overdrive.wav --out out/concepts/u3-overdrive-vo.mp4 --bed-db=-4 \
  --settings $S --voice editable-v7 --video out/u3-soak-silent.mp4 --duck
```

Each bed masters to -14.0 LUFS / -1.2 dBTP, with music and SFX stems within ~1 LU of each other on round 1 and ~1.7 LU (music louder) on round 2. At peak the limiter takes 2.6 dB of gain reduction on `bluenote` ~4 dB on `overdrive` (groove density, by design) and ~3.6 dB on `tempesta` v2 (its tutti hits). `tempesta`'s music stem sits ~8 LU above its SFX, because the orchestra plays most of the picture itself. The ducked voiceover mixes measure -14.8 to -15.0 LUFS / -0.8 to -1.0 dBFS, the same target as the published Arabesque voiceover cut. `tempesta` v2 measures -14.8 LUFS / -0.9 dBTP with a constant bed about 5 LU under the voice. Every cue is derived from settings, so a retime only needs a re-render.

## Limitations

- These are offline renders only. The live editor (`?experiment=micro-18`) still plays the Arabesque bed; none of the concepts is wired into playback or the Remotion composition.
- The balance was checked numerically (loudness curves, per-window peaks, NaN probe), not by listening. Treat level and taste as untested until someone reviews by ear.
