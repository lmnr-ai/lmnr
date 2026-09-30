# Ultimate 3 scores

Soundtracks for Animation 18: original scores plus foley, rendered offline in pure TypeScript (no browser, no Web Audio).

```sh
pnpm ultimate3:score                                   # Tactile Glass -> out/ultimate3-score.wav
pnpm ultimate3:score --style nocturne                  # -> out/ultimate3-nocturne.wav (also: signal, aria, arabesque, *-acoustic, nocturne-duet, nocturne-digital, phase, tintinnabuli)
pnpm ultimate3:score --video out/u3-silent.mp4 --mp4 out/ultimate3.mp4   # + mux (video stream-copied, AAC 320k)
pnpm ultimate3:score --settings settings.json --stems  # authored settings; also write music/sfx/hall/room/delay stems
pnpm ultimate3:score --style nocturne-acoustic --keyboard spring  # type on another modelled keyboard (default thock)
pnpm ultimate3:score:test
```

Rendering takes 15–40 seconds. The output is a deterministic function of settings, the samples and the seed (`score.test.ts` asserts identical hashes across runs), and it is mastered to -14 LUFS integrated with true peak ≤ -1 dBTP.

## Arabesque Acoustic effect tuner

```sh
pnpm arabesque:tuner
# open http://localhost:5181
```

The tuner renders the exact offline voices used by `arabesque-acoustic`. Audition piano UI cues, movement air, the Thinking puff, closures, low impacts, or typing in isolation; adjust their sound; then render and play the complete mastered track with those edits. Settings persist in the browser and can be downloaded as JSON.

Use downloaded settings in a final render:

```sh
pnpm ultimate3:score --style arabesque-acoustic --tuning arabesque-acoustic-tuning.json
```

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

`arabesque-acoustic-chill` keeps Arabesque Acoustic from Flow-1 on. Before it, one quiet eighth-note bed (E – A – G♯m – A, Bsus into the drop) runs unbroken, and events are soft in-key piano touches on top. There are no warning ducks. It works with `--split-arabesque`.

On the Animation 21 cut (`flow.sourceVersion: 21`), the Flow cues come from `flow.timing21`: the bead landings, the string entry, the graph spread and the axis entry replace the legacy number rows and bars. The editable VO bed is `scripts/build-ultimate3-flow21-bed.mjs`.

All Arabesque styles bridge the Issues analysis prelude (`cues.issues.prelude`: bash descent, zoom out, circle grow) with a triplet arabesque walking I – IV – V into the issue grid. On source22 the cues read its own report prelude (`timing22`), and the bridge touches the bubble, the label rows and the typed explanation.

### `nocturne-duet` — piano and violin

Nocturne's acoustic cut with the synthesized string section replaced by VSCO-2 celli, violin section and solo violin (picked by register). The solo violin sings every melody legato while the piano keeps the octave below, and it plays the budget drain in spiccato.

### `nocturne-digital` — all synthesized

The same Nocturne writing with every sound synthesized. The piano becomes an FM electric piano (`electricPiano()`, a generated bank passed through the style's `keys`, so the piano writing is unchanged), the strings stay synthesized, the timpani become a sub plus kick, and the electronic foley and telemetry beeps stay in.

### `phase` — two pianos, after Reich

G major, all acoustic, in a drier studio. Two pianos play one twelve-note pentatonic pattern in sixteenths: the run and the trace it leaves. When the agent fails, the second piano drifts out of phase and locks a note ahead, so a new resultant pattern appears. Bowed eighths from the section breathe under the insights. The cheap model plays the pattern an octave up with holes where the Es and As were; the powerful one plays it at half speed, two octaves down, over heavy celli. The budget erodes the pattern one pitch per lament chord until only B, the third of G, is left for Flow-1. The pianos ratchet a step as the bars grow and spin apart as the engine boots. In Issues they start half a cycle apart and phase back into unison on the cluster lock. The drift is a smooth offset in pattern steps (`drift`), and both pianos count steps from beat 0, so any offset stays in the same phase grid.

### `tintinnabuli` — scale and triad, after Pärt

F major and D minor (one seven-note set), in a stone-church reverb. Every line pairs an M-voice walking the scale with a T-voice ringing the nearest note of one triad (`walk`, `ring`). Struck low piano octaves are the bells that mark each turn. The film opens with Spiegel-style rising triads under the violin's additive phrases, which close in on A. The budget drains as a descending canon (Cantus): solo a step a beat, section every two, celli every four, resting on an A–E fifth. The drop is an ascending mensuration canon in F on the same principle. The composition's piano rings every other issue pop on a triad note, while the foley's pizzicato takes the rest in the scale, so the pops are M and T voices too.

### `lofi-rhodes`, `city-pop`, `minimal-techno` — steady-bed genres

Each is one unbroken loop from the first trace to Flow-1, with every event answered by a small in-key lick on top, then a brighter loop from the drop. All three use `steadyDucks` (Nocturne's ducks without the warning stops) and let the composition play the issue pops through `cascade`, since all 47 pops land in one frame and would otherwise stack into one hit.

- `lofi-rhodes`: F major, with an FM Rhodes bank (`lofi/instruments.ts`, passed as `keys`) over a swung half-time kit. It goes through `mix.sweep` (a time-varying low-pass, closed before Flow-1 and behind the door), `mix.wow` (tape wow and flutter) and a vinyl bed.
- `city-pop`: D major pivoting on B13sus up to E at Flow-1, with Karplus-Strong guitar, synth bass and brass-synth (`city-pop/instruments.ts`). The foley follows the key change through `Playing.shift`.
- `minimal-techno`: F♯ minor into A major, on a 16th click-track with a sub, a glass pad and FM bells cycling every three 16ths. Kick on the half notes before Flow-1, four-on-the-floor after it. The foley rings bells through a `Player` and snaps to the 16th grid with `Playing.quantize`.

### `sunlit-synth`, `highlife`, `stomp-glock` — upbeat genres

Same skeleton as the steady-bed genres, with more energy: a groove from the first trace that builds in tiers (it thins at the depletion and builds for two bars into Flow-1), then the full band from the drop. The energy comes from 16th motion, percussion and the top end, not level. Keep sustained parts out of the voice's 300 Hz–3 kHz band (these three put 20–30 % of their energy there, against 30–40 % for the steady-bed genres). Keep the logo hit soft under "with Laminar": a loud stab there masks the brand name in speech-to-text.

- `sunlit-synth`: F major chillwave. A 16th `pluck` arp through the dotted-eighth delay whose filter opens toward Flow-1, a pumping `pad`, staccato eighth synth bass, and a pluck-plus-sine-glass lead.
- `highlife`: G major. Interlocking Karplus-Strong guitars (a high single-note line over offbeat chanks), a 3-3-4-2-4 FM bell and synthesized congas, plus horns harmonised a diatonic third below. The cues are answered on a balafon (`highlife/instruments.ts`).
- `stomp-glock`: C major indie-folk. Stomps, double handclaps and tambourine (`stomp/instruments.ts`), sampled pizz chugging in eighths (`strings: true`), a dry piano pulse, and a glockenspiel carrying every tune.

`designAcoustic` takes `'piano' | 'pizz' | Player`, plus an optional `(cues) => Playing` for pitch shift and time quantize. `loopBars` counts bars back from an anchor (the drop or the logo), so the bar before it is always the loop's cadence.

## Foley

Whooshes are pink noise through a broad, gently resonant band-pass whose centre is soft-capped under 2.4 kHz, with a low "body" band and the hiss rolled off above 4.2 kHz. Narrow white-noise sweeps put most of their energy at 2–5 kHz, where hearing is most sensitive, and read as a whistle. Nocturne, Aria and Arabesque share one foley design (`nocturne/design.ts`, `designInKey`) transposed into each score's key.

The agent window types on a modelled keyboard from `keyboards.ts`: `thock` (a lubed linear mechanical) by default, or `--keyboard laptop|clack|spring|membrane`. It replaced a low-profile click at ~22 Hz that read as a ratchet. Each keystroke is a contact tick, a bottom-out that rings the case modes over a desk thump, and a quieter key-up; the spacebar rings lower and its stabiliser rattles. Keys are typed as words and spaces with log-normal gaps at 10–13 keys/s, and each key keeps its own pitch offset.

## Pipeline

- `cues.ts` derives every picture event from the settings. It reuses the `sound.ts` window helpers and samples the Issues scene for per-triangle pop times and positions, so retiming a clip retimes the score.
- `<style>/composition.ts` holds the music. `<style>/design.ts` holds the foley plus the duck plan, which dips the music bus under key foley moments and runs before any music is emitted.
- `writing.ts` holds the piano-writing helpers: rolled chords, broken-chord figures over a `Progression`, and melodies in beats.
- `voices.ts` contains the synth/sample voices and the `Mix` buses and sends. `dsp.ts` provides the filters, FDN reverb, ping-pong delay, look-around limiter, BS.1770 loudness and master EQ.
- `render.ts` sums the dry buses and returns, applies the master EQ, normalises, limits, and adds the final fade.

### `digital-lydian` — 808 trap, D Lydian (LAM-2315)

After the digital reference in `handoff/sound-design-digital-inspo/`; analysis and A/B are in `handoff/digital-lydian/README.md`. Everything is synthesized in `digital/instruments.ts`, near mono and dry, with no fades: sounds are switched on and off (2 ms on, 4 ms off) and silence is the punctuation.

- **Palette:** a driven, pitch-dropping 808 carrying most of the energy, gated detuned-saw chord blocks with a buzzing root, square data blips, pitch zaps, speed-shaped noise sweeps, droplets, crushed haze, 16th hats with 32nd rolls, and a tight clap.
- **Scored to the motion:** every camera move is a sweep gated on the frame it lands, and every object has one sound. Five tier-A hits (Bash, the drop, the door, the grid, the logo) each come out of dead air. The groove runs only in Cost, Flow-1 and the issue grid; it mutes, goes bare or thins with the picture (`trap()`'s `mute`, `bare`, `still`) and thins under the voice.
- **Arc:** curiosity (bright, sparse blocks on the stream), then pressure (Cost: the minor side, a thin trap, a tape stop through the depletion), then release (the Flow-1 drop and the motif E6–G♯6–A6), then order (the swarm's six voices glide onto Dmaj7♯11 at the clusters' lock), then the logo, where the motif resolves to D after "with Laminar".
- The voice sits over the sub, not in it: ~81 % of the energy is under 120 Hz and ~9 % in 250 Hz–4 kHz. Object sounds are quieter and dry under the narration.

The preserved original at `?experiment=micro-18&cut=original` uses an **Arabesque Acoustic typing-free bed + one live thock scheduler**, not the earlier full Web Audio effects engine. `pnpm ultimate3:score --style arabesque-acoustic --split-arabesque --tuning src/experiments/micro-18/score/arabesque/softness-8-tuning.json --out <new-path>.wav` writes that bed, a split-playback parity export, and frozen provenance. See `../AUDIO_EXPORT.md` for the exact gain/control contract and static-bed retiming limitation. Ordinary score renders bake shared thock PCM through their score buses; split playback keeps the keyboard dry and outside bed mastering. The `keyClick` API/tuner identifier remains for compatibility, but its old bright bandpass recipe is gone. No original WAV or frozen export is overwritten.

## Credits

Piano: [Salamander Grand Piano](https://github.com/Tonejs/audio) by Alexander Holm, licensed [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). Sources and hashes are in `sound-sources/salamander-tonejs/source-manifest.json`. Strings: [VSCO-2 Community Edition](https://github.com/sgossner/VSCO-2-CE) by Sam Gossner and Simon Dalzell, [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/); trimmed and re-encoded in `sound-sources/vsco2-strings/` (see its `source-manifest.json`). Every other sound is synthesized in `voices.ts`.
