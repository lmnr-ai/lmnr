# Voiceover retime (Ultimate 3 + Arabesque Acoustic)

`retimed-settings.json` is Ultimate 3 retimed to `public/audio/voiceover/Signals-launch-09-27-03-17.m4a` (64.73 s). Import it in the editor or pass it to Remotion/score renders.
The VO is never time-stretched: phrases are cut in silences (plus three low-energy word boundaries) and placed at `placements.json` times.

```bash
npx tsx handoff/voiceover-retime/retime.ts            # regenerate settings + placements
npx remotion render src/video/index.ts MicroAnimation18 out/silent.mp4 --props='{"settings":...}' --muted
pnpm ultimate3:score --style arabesque-acoustic --split-arabesque --seed 107290 \
  --tuning handoff/voiceover-retime/tuning.json --settings handoff/voiceover-retime/retimed-settings.json --out out/score/arabesque-vo.wav
node handoff/voiceover-retime/build-vo.mjs 64.734     # out/vo-placed.wav
```

Mix used for the export: VO highpass 75 Hz, 2.5:1 compression, ~-15.7 LUFS; the `.playback.wav` bed (music + live thocks) at -5.5 dB, sidechain-ducked 3.5:1 by the VO; master ~-14.7 LUFS, -1 dBFS peak.
