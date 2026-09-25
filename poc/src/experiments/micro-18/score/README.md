# Ultimate 3 scores

Soundtracks for Animation 18: original scores plus foley, rendered offline in pure TypeScript (no browser, no Web Audio).

```sh
pnpm ultimate3:score                                   # Tactile Glass -> out/ultimate3-score.wav
pnpm ultimate3:score --style nocturne                  # -> out/ultimate3-nocturne.wav (also: --style signal)
pnpm ultimate3:score --video out/u3-silent.mp4 --mp4 out/ultimate3.mp4   # + mux (video stream-copied, AAC 320k)
pnpm ultimate3:score --settings settings.json --stems  # authored settings; also write music/sfx/hall/room/delay stems
pnpm ultimate3:score:test
```

Rendering takes about 15 seconds. The output is a deterministic function of settings, the piano samples and the seed (`score.test.ts` asserts identical hashes across runs), and it is mastered to -14 LUFS integrated with true peak ≤ -1 dBTP.

## Styles

Each style is a `ScoreStyle` (`style.ts`) in its own folder: `ducks`, then `compose` (music bus), then `design` (foley bus), plus optional reverb/delay/EQ overrides. `render.ts` lists them in `SCORE_STYLES`.

### `tactile-glass` — playful, D major

- **Palette:** felt piano, detuned-saw pads, FM glass bells, muted synth plucks, soft electronic drums, and tactile foley (ticks, pops, thocks, key clicks, whooshes).
- **Arc:** the agent "motor" arpeggio, a bouncy-then-heavy Cost section, a drop on the Flow-1 title, pentatonic pops in Issues, and IV → V → I into the logo. The Laminar motif (D–E–F♯–A) resolves as the logo sting.

### `nocturne` — neo-classical piano, E♭ major

- **Palette:** Salamander piano, a synthesized string section and timpani. The machine only speaks in quiet sine beeps; foley is breath and felt.
- **Story in harmony:** the stream is a Bach-style prelude that breaks off onto A♭m when the agent fails. The cheap model is a thin toccata that trips on wrong notes and a tritone. The expensive one is heavy C minor. The budget drains down a lament bass to a G-major half cadence, and "Until now" pivots on that G into E♭ for Flow-1. The theme (G–B♭–E♭–D…) is spoken at the insights, sung in octaves at the drop, and its D resolves to E♭ on the logo.

### `signal` — electronic neo-classical, A major

- **Palette:** felt piano with delay over a 16th saw sequencer, sidechain-pumped pads, sub bass, soft four-on-the-floor, FM blips and sample-and-hold data chatter.
- **Story in texture:** the music breaks the way software does. It stutters and tape-stops at the failure, glitches out when the cheap model misses the issue, and slows to a halt as the budget drains. After "Until now" the sequencer reboots into the drop and never breaks again; on the logo it thins to one A.

## Pipeline

- `cues.ts` derives every picture event from the settings. It reuses the `sound.ts` window helpers and samples the Issues scene for per-triangle pop times and positions, so retiming a clip retimes the score.
- `<style>/composition.ts` holds the music. `<style>/design.ts` holds the foley plus the duck plan, which dips the music bus under key foley moments and runs before any music is emitted.
- `writing.ts` holds the piano-writing helpers: rolled chords, broken-chord figures over a `Progression`, and melodies in beats.
- `voices.ts` contains the synth/sample voices and the `Mix` buses and sends. `dsp.ts` provides the filters, FDN reverb, ping-pong delay, look-around limiter, BS.1770 loudness and master EQ.
- `render.ts` sums the dry buses and returns, applies the master EQ, normalises, limits, and adds the final fade.

The live `?experiment=micro-18` preview still uses the earlier Web Audio sound engine (`../sound.ts`, `../offline-audio.ts`, `pnpm ultimate3:audio`). This score is the soundtrack for rendered video.

## Credits

Piano: [Salamander Grand Piano](https://github.com/Tonejs/audio) by Alexander Holm, licensed [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). Sources and hashes are in `sound-sources/salamander-tonejs/source-manifest.json`. Every other sound is synthesized in `voices.ts`.
