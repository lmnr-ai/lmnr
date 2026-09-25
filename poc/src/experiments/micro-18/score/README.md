# Ultimate 3 score — "Tactile Glass"

The final soundtrack for Animation 18: an original score plus foley, rendered offline in pure TypeScript (no browser, no Web Audio).

```sh
pnpm ultimate3:score                                   # -> out/ultimate3-score.wav
pnpm ultimate3:score --video out/u3-silent.mp4 --mp4 out/ultimate3.mp4   # + mux (video stream-copied, AAC 320k)
pnpm ultimate3:score --settings settings.json --stems  # authored settings; also write music/sfx/hall/room/delay stems
pnpm ultimate3:score:test
```

Rendering takes about 15 seconds. The output is a deterministic function of settings, the piano samples and the seed (`score.test.ts` asserts identical hashes across runs), and it is mastered to -14 LUFS integrated with true peak ≤ -1 dBTP.

## Style

- **Palette:** felt piano (Salamander), warm detuned-saw pads, FM glass bells, muted synth plucks, and soft electronic drums. Every UI event gets tactile foley: ticks, pops, thocks, key clicks, and airy whooshes.
- **Harmony:** D major / Lydian at 120 BPM. The four-note Laminar motif (D–E–F♯–A) is hinted at the Ultimate 2 zoom-out, sung at the Flow-1 drop and resolved as the logo sting.
- **Arc:**
  - Ultimate 2 is curious: the agent "motor" arpeggio, then it darkens at the failure.
  - Cost starts bouncy, turns into a heavy B-minor pulse and ends in a cold drain.
  - The Flow-1 title is the drop (30.518s). A I–vi–IV–V groove follows, stopping on the door slam.
  - Issues carries a lighter groove, with pentatonic pops pitched by each triangle's height and panned by its x position, then a Dmaj9 bell per cluster lock.
  - The conclusion builds IV → V into the logo's I.

## Pipeline

- `cues.ts` derives every picture event from the settings. It reuses the `sound.ts` window helpers and samples the Issues scene for per-triangle pop times and positions, so retiming a clip retimes the score.
- `composition.ts` holds the music. `design.ts` holds the foley plus `planDucks`, which dips the music bus under key foley moments and runs before any music is emitted.
- `voices.ts` contains the synth/sample voices and the `Mix` buses and sends. `dsp.ts` provides the filters, FDN reverb, ping-pong delay, look-around limiter, BS.1770 loudness and master EQ.
- `render.ts` sums the dry buses and returns, applies the master EQ, normalises, limits, and adds the final fade.

The live `?experiment=micro-18` preview still uses the earlier Web Audio sound engine (`../sound.ts`, `../offline-audio.ts`, `pnpm ultimate3:audio`). This score is the soundtrack for rendered video.

## Credits

Piano: [Salamander Grand Piano](https://github.com/Tonejs/audio) by Alexander Holm, licensed [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). Sources and hashes are in `sound-sources/salamander-tonejs/source-manifest.json`. Every other sound is synthesized in `voices.ts`.
