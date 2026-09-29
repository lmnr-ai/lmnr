# LAM-2311 — alternate sound designs for Ultimate 3

These concepts replace the Arabesque piano bed and thocks entirely; the editable-v7 narration is unchanged. The picture is the voiceover-soak cut: `handoff/voiceover-soak/default-settings.json`, 77.158 s, 2315 frames. Style notes are in [`score/README.md`](../../src/experiments/micro-18/score/README.md#tidepool-lumen-windup--rounded-digital-concepts-lam-2311).

| Concept | Character | Review MP4 (with voiceover) |
|---|---|---|
| `tidepool` | Kalimba, marimba and water; F major, 96 BPM; the stream blocks play the melody | [ultimate3-tidepool-voiceover-v1.mp4](https://svwyososwvsgouxwfdlc.supabase.co/storage/v1/object/public/lmnr-coding-agent/lam-2311/ultimate3-tidepool-voiceover-v1.mp4) |
| `lumen` | Sine-blip arpeggio, FM glass and a soft four-on-the-floor; A major, 120 BPM | [ultimate3-lumen-voiceover-v1.mp4](https://svwyososwvsgouxwfdlc.supabase.co/storage/v1/object/public/lmnr-coding-agent/lam-2311/ultimate3-lumen-voiceover-v1.mp4) |
| `windup` | Clockwork toy: escapement, music box, springs and ratchets; swung G major, 112 BPM | [ultimate3-windup-voiceover-v1.mp4](https://svwyososwvsgouxwfdlc.supabase.co/storage/v1/object/public/lmnr-coding-agent/lam-2311/ultimate3-windup-voiceover-v1.mp4) |
| `bluenote` | Round 2, jazz: swinging piano trio + vibes, big-band shout on Flow-1, Basie ending; F → A♭, 152 BPM | [ultimate3-bluenote-voiceover-v1.mp4](https://svwyososwvsgouxwfdlc.supabase.co/storage/v1/object/public/lmnr-coding-agent/lam-2311/ultimate3-bluenote-voiceover-v1.mp4) |
| `overdrive` | Round 2, maximal: trailer braams, taiko and celli, festival supersaw drops, fake-outs, key change on the logo; D minor → D major → E♭, 128 BPM | [ultimate3-overdrive-voiceover-v1.mp4](https://svwyososwvsgouxwfdlc.supabase.co/storage/v1/object/public/lmnr-coding-agent/lam-2311/ultimate3-overdrive-voiceover-v1.mp4) |

## Reproduce

```sh
cd poc && pnpm install --frozen-lockfile
# silent picture (1 CPU sandbox: --concurrency=1, ~5 min)
echo "{\"settings\": $(cat handoff/voiceover-soak/default-settings.json)}" > /tmp/props.json
npx remotion render src/video/index.ts MicroAnimation18 out/u3-soak-silent.mp4 --props=/tmp/props.json --muted --concurrency=1
for s in tidepool lumen windup bluenote; do
  pnpm ultimate3:score --style $s --settings handoff/voiceover-soak/default-settings.json --out out/concepts/$s.wav
  node scripts/mix-ultimate3-concept.mjs --bed out/concepts/$s.wav --out out/concepts/u3-$s-vo.mp4
done
# overdrive rides louder under the voice; negative values need `=`
pnpm ultimate3:score --style overdrive --settings handoff/voiceover-soak/default-settings.json --out out/concepts/overdrive.wav
node scripts/mix-ultimate3-concept.mjs --bed out/concepts/overdrive.wav --out out/concepts/u3-overdrive-vo.mp4 --bed-db=-4
```

Each bed masters to -14.0 LUFS / -1.2 dBTP, with music and SFX stems within ~1 LU of each other. At peak the limiter takes 2.6 dB of gain reduction on `bluenote` and ~4 dB on `overdrive` (groove density, by design). The voiceover mixes measure -14.8 to -15.0 LUFS / -0.8 to -1.0 dBFS, the same chain and target as the published Arabesque voiceover cut. Every cue is derived from settings, so a retime only needs a re-render.

## Limitations

- These are offline renders only. The live editor (`?experiment=micro-18`) still plays the Arabesque bed; none of the concepts is wired into playback or the Remotion composition.
- The balance was checked numerically (loudness curves, per-window peaks, NaN probe), not by listening. Treat level and taste as untested until someone reviews by ear.
