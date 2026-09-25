# Ultimate 3 scores

Soundtracks for Animation 18: original scores plus foley, rendered offline in pure TypeScript (no browser, no Web Audio).

```sh
pnpm ultimate3:score                                   # Tactile Glass -> out/ultimate3-score.wav
pnpm ultimate3:score --style nocturne                  # -> out/ultimate3-nocturne.wav (also: signal, aria, arabesque, *-acoustic, nocturne-duet, nocturne-digital)
pnpm ultimate3:score --video out/u3-silent.mp4 --mp4 out/ultimate3.mp4   # + mux (video stream-copied, AAC 320k)
pnpm ultimate3:score --settings settings.json --stems  # authored settings; also write music/sfx/hall/room/delay stems
pnpm ultimate3:score:test
```

Rendering takes 15–40 seconds. The output is a deterministic function of settings, the samples and the seed (`score.test.ts` asserts identical hashes across runs), and it is mastered to -14 LUFS integrated with true peak ≤ -1 dBTP.

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

### `aria` — violin and string orchestra, D major

- **Palette:** VSCO-2 solo violin, violin section, celli and pizzicato, with timpani and Nocturne's beeps a semitone down. Sustains crossfade soft/loud layers by dynamic and loop their bodies, so a note holds as long as the picture needs.
- **Story in the bow:** the trace is the violin's moto perpetuo, bariolage against the open A, that breaks onto a borrowed G minor and sighs B♭ → A at the failure. The cheap model is high pizzicato that trips onto a tritone; the expensive one is heavy celli on every beat. The cost falls down a lament bass until one violin F♯ is left; it cuts for a breath and becomes the third of D for Flow-1, where the celli motor starts. The theme's C♯ waits until the logo.

### `arabesque` — impressionist solo piano, E major

- **Palette:** Salamander piano only, plus a sine sub and triplet delay echoes; Nocturne's beeps a semitone up.
- **Story in figuration:** the trace is a flowing triplet arabesque that melts into a whole-tone blur at the failure. The insights are low parallel chords (a sunken cathedral). The cheap model is shallow staccato up high; the powerful one massive bass octaves. The cost slows the arabesque (triplets → eighths → quarters → halves) until one B rings into the drop, where both hands sweep. The theme's D♯ waits until the logo.

### Acoustic cuts: `nocturne-acoustic`, `aria-acoustic`, `arabesque-acoustic`

The same three scores with no electronics:
- **No telemetry:** every beep and tick in the foley is played by the score's own instrument (piano, or pizzicato in Aria). The notes are snapped into the key, folded into the instrument's range, and thinned to at least 48 ms apart. The deliberate wrong note ("…fail to find crucial issues") keeps its pitch.
- **The budget drain:** instead of the gliding drain tone, each composition plays it as a line (`drainLine`) that falls through the lament chords and slows like a counter running out. In Nocturne it's high piano, in Aria the solo violin in spiccato into its lone F♯, and in Arabesque the slowing arabesque itself.
- **No synth music:** the stream's data beeps are gone, the run into the drop is piano (Aria: pizzicato), and Arabesque loses its sine sub.

### `nocturne-duet` — piano and violin

Nocturne's acoustic cut with the synthesized string section replaced by VSCO-2 celli, violin section and solo violin (picked by register). The solo violin sings every melody legato while the piano keeps the octave below, and it plays the budget drain in spiccato.

### `nocturne-digital` — all synthesized

The same Nocturne writing with every sound synthesized. The piano becomes an FM electric piano (`electricPiano()`, a generated bank passed through the style's `keys`, so the piano writing is unchanged), the strings stay synthesized, the timpani become a sub plus kick, and the electronic foley and telemetry beeps stay in.

## Foley

Whooshes are pink noise through a broad, gently resonant band-pass whose centre is soft-capped under 2.4 kHz, with a low "body" band and the hiss rolled off above 4.2 kHz. Narrow white-noise sweeps put most of their energy at 2–5 kHz, where hearing is most sensitive, and read as a whistle. Nocturne, Aria and Arabesque share one foley design (`nocturne/design.ts`, `designInKey`) transposed into each score's key.

## Pipeline

- `cues.ts` derives every picture event from the settings. It reuses the `sound.ts` window helpers and samples the Issues scene for per-triangle pop times and positions, so retiming a clip retimes the score.
- `<style>/composition.ts` holds the music. `<style>/design.ts` holds the foley plus the duck plan, which dips the music bus under key foley moments and runs before any music is emitted.
- `writing.ts` holds the piano-writing helpers: rolled chords, broken-chord figures over a `Progression`, and melodies in beats.
- `voices.ts` contains the synth/sample voices and the `Mix` buses and sends. `dsp.ts` provides the filters, FDN reverb, ping-pong delay, look-around limiter, BS.1770 loudness and master EQ.
- `render.ts` sums the dry buses and returns, applies the master EQ, normalises, limits, and adds the final fade.

The live `?experiment=micro-18` preview still uses the earlier Web Audio sound engine (`../sound.ts`, `../offline-audio.ts`, `pnpm ultimate3:audio`). This score is the soundtrack for rendered video.

## Credits

Piano: [Salamander Grand Piano](https://github.com/Tonejs/audio) by Alexander Holm, licensed [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). Sources and hashes are in `sound-sources/salamander-tonejs/source-manifest.json`. Strings: [VSCO-2 Community Edition](https://github.com/sgossner/VSCO-2-CE) by Sam Gossner and Simon Dalzell, [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/); trimmed and re-encoded in `sound-sources/vsco2-strings/` (see its `source-manifest.json`). Every other sound is synthesized in `voices.ts`.
