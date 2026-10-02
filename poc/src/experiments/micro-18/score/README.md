# Ultimate 3 scores

Soundtracks for Animation 18: original scores plus foley, rendered offline in pure TypeScript (no browser, no Web Audio).

```sh
pnpm ultimate3:score                                   # Tactile Glass -> out/ultimate3-score.wav
pnpm ultimate3:score --style nocturne                  # -> out/ultimate3-nocturne.wav (also: signal, aria, arabesque, *-acoustic, nocturne-duet, nocturne-digital, phase, tintinnabuli)
pnpm ultimate3:score --video out/u3-silent.mp4 --mp4 out/ultimate3.mp4   # + mux (video stream-copied, AAC 320k)
pnpm ultimate3:score --settings settings.json --stems  # authored settings; also write music/sfx/hall/room/delay stems
pnpm ultimate3:score --style nocturne-acoustic --keyboard spring  # type on another modelled keyboard (default thock)
pnpm ultimate3:score:test
pnpm -s ultimate3:score:test glide glide-minimal       # only these styles (about 2 min instead of 10+)
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

### `cursor-paper-v5` — v4 with a `laminar.sh` ending (LAM-2317)

v4 on a cut extended to 75.5 s, where `conclusion.url` adds a `laminar.sh` card 3 s after "With Laminar". `composeCursorV4(…, {urlCard: true})` lets the logo keys ring to the end of the film, and nothing new plays on the cut. The arc holds flat from the peak to 1.5 s before the end, then fades once to −20 dB. Build it with `--settings handoff/cursor-sound-design/v5/settings.json`: the builder's default settings are the pre-card cut.

### `cursor-paper-v4` — v3, staged to build like the reference (LAM-2317, October 2 cut)

`cursor/composition-v4.ts` reuses v3's instruments, `repeats` and `shelveLows`, and `arcCursorV4` replaces the arc:

- a quiet plateau with no sustained bass through Act 1 and Cost;
- a V → I step at the Flow-1 reveal, where the bass enters;
- a capped Issues;
- a conclusion that brightens through IV–V–I to a peak after the last word;
- a tonic that rings out over the logo hold (`swellKey`'s `decay`).

`cursor-paper-v3-oct2` is v3 with deeper ducks for the October 2 take. Both are built by `scripts/build-ultimate3-cursor-bed.ts`; see `handoff/cursor-sound-design/README.md`.

### `cursor-paper-v3` — swelled keys and tonal foley over v2's bed (LAM-2317 second review)

`cursor/composition-v3.ts` keeps v2's continuous bed, arc, ducks and glue. The changes come from forensics on the reference's music stem:

- **Re-articulation:** `swellKey` (in `cursor/tactile.ts`) is a near-sine that swells in over about 250 ms. `repeats` plays two or three of them, each repeating every ~0.84 s and staggered by 0.28 s, inside a near-static chord. This gives the reference's E♭ → A♭ → G cell, and it follows the story.
- **De-throbbed bed:** `bed(…, CHORUS)` uses unequal copies at 0/+7/−11 cents, offset per note, so notes never beat together. The bed plays 3 dB under the keys and fades between fewer harmonies.
- **Tonal foley:** `pop`, `thump` (with an optional double hit and a separate faint high click), `droplet`, `tick`, `click` and `dots`. They are pure sines on chord tones with no pitch drop, and they play dry.
- **Breath, not paper:** `breath` is grain-free pink noise through Q 0.5 filters under a bell envelope, in a `pillow` (low-pass) or `feather` (3–9 kHz) flavour. It is used five times; the music carries the other camera moves.

### `cursor-paper-v2` — the same palette as one continuous, arcing bed (LAM-2317 review)

`cursor/composition-v2.ts` re-scores `cursor-paper` in four ways:

- **One bed:** `bed`/`bassLine` in `cursor/bed.ts` keep one oscillator bank per note for the whole film and crossfade between keyframes, so shared notes never re-attack and there are no holes at the seams.
- **An arc:** `arcCursorV2` multiplies `musicGain`.
- **Fewer, louder hits.**
- **Master glue:** through the `ScoreStyle.master` hook, which runs before the EQ and normalisation.

Per-line extra ducks (`EXTRA_DUCK_DB`) are tuned to this cut's 23 phrases. Re-measure them if the narration moves. Note that deeper ducks are partly undone by the −14 LUFS normalisation, so retune the bed trim with them.

### `cursor-paper` — tape organ and paper knocks, A♭ major (LAM-2317)

This style comes from Cursor's "Software is changing" (`handoff/cursor-sound-design/`). It has no piano. The palette lives in `cursor/instruments.ts`:

- `tapePad`: a detuned additive organ with wow and flutter, a low-pass and a 0.54 Hz breath.
- `sub`: the bass.
- `knock`: paper knocks, from thumps to ticks.
- `mallet`: a soft wooden mallet.
- `ratchet`: a gliding tick run.
- `paper`: a grainy band-swept slide.

How it is scored:

- The first half has no bass.
- The bass enters at the Flow-1 reveal.
- After that the harmony moves only on camera moves: I, then IV (analysis), V (engine), vi/IV (report), V (zoom-out), I (clusters), and IV → V → I at the logo.

It is the only style that ducks from `cues.voice`, the placed narration:

- The music breathes about 3.6 dB under each phrase.
- The dry foley bus tucks 4 dB under words.
- Knocks, mallets and paper saturate softly instead of spiking the master.

It bakes its own paper-tap typing (guarded by `mix.typingEnabled`). Its beds are built by `scripts/build-ultimate3-cursor-bed.ts`, which ducks against the October 2 editable-v12 phrases (`editable-v12-cursor-*`). The `editable-v11-cursor*` beds keep the earlier take.

### `glide` — ambient synth after the TurboPuffer reference, G major

No piano. Wide detuned pads, a sub drone and muffled thumps carry the story, and one timeline filter (`Mix.sweep`) opens and slams shut with the picture. An 89 BPM grid (the logo lands on beat 6 of the conclusion) drives a felt thump pulse under Cost, then a boom-bap payoff that drops out on the logo. All detail sits at or above 4.7 kHz, or at or below 1 kHz. It is built as a voice-ducked editable-v11 bed by `scripts/build-ultimate3-glide-bed.ts`, and `ducks` is empty because the build script ducks against the real narration. See `handoff/turbopuffer-sound/README.md`.

### `glide-minimal` — Glide v1 with a resolved ending

This is `composeGlide`/`designGlide` with `minimal = true`, and it renders `glide` itself unchanged. The pads and keys under the voice are lighter and drier, and the kit is softer. Nothing new starts on the logo. Instead the answer lands on conclusion beat 8, just after "with Laminar": kick, G bass, Gmaj9 keys, pad and glints. Echoes follow on beats 10 and 12, and a sweep closes the music to 700 Hz by beat 15.5. The bed is built on `handoff/turbopuffer-sound/minimal-settings.json`, whose ending is 16 beats long.

### `glide-minimal-lift` — the minimal candidate with the payoff on the logo

`composeGlide`/`designGlide` with `ending = 'lift'`. Up to the conclusion it's glide-minimal. The groove turns V → I onto the logo, the kit stops on one hit with a bright air crash and a sub swell, and an open, high G rings out under "with Laminar". After the word, a smaller keys bloom answers. The lift branch keeps the same count and order of seeded calls as glide-minimal (the same kit loop, four pads), which is what keeps everything before it identical.

### `glide-minimal-linger` — the groove plays the film out, with soft air

`ending = 'linger'`. The conclusion groove keeps going through the logo, with kick and hats only under "with Laminar". It returns in full after the words and thins over the last bar to end on the film's last bar line (`composeLinger`). Every noise move in the film uses the soft palette in `glide/instruments.ts`: `breeze` (pink, low-Q, no band-pass) in place of `whoosh`/`marker`, `feather` in place of `air`, `blip` in place of `tick`, and `shimmer({soft})`. Those helpers are new, so the other styles' renders are unchanged.

### `glide-arc` — Glide 2, one continuous arc

The same palette, written as one piece on a single 89.5 BPM grid (`glide/arc.ts`, `arcGrid`), with the Flow-1 reveal on bar 0 and the logo on bar 14. The problem is an ostinato that stops at the failure and a pulse that tape-stops at the depletion. After "Until now", a motor starts on the reveal and gains a layer every few bars: the kit lands with Signals, there's a breakdown over the zoom-out, and the groove drops for the payoff. Pads are phase-coherent (`haze({coherent})`) and pumped from the reveal, and everything under 150 Hz is mono. Tonal layers go through two slow `Mix.sweep` curves, and the kit is emitted afterwards, so it stays unfiltered. Foley is snapped to the 16th grid. `arcLevels` is the bed's level curve against the voice, in dB with linear interpolation, applied by the bed builder (`--style glide-arc`), which also ducks more gently.

## Foley

Whooshes are pink noise through a broad, gently resonant band-pass whose centre is soft-capped under 2.4 kHz, with a low "body" band and the hiss rolled off above 4.2 kHz. Narrow white-noise sweeps put most of their energy at 2–5 kHz, where hearing is most sensitive, and read as a whistle. Nocturne, Aria and Arabesque share one foley design (`nocturne/design.ts`, `designInKey`) transposed into each score's key.

The agent window types on a modelled keyboard from `keyboards.ts`: `thock` (a lubed linear mechanical) by default, or `--keyboard laptop|clack|spring|membrane`. It replaced a low-profile click at ~22 Hz that read as a ratchet. Each keystroke is a contact tick, a bottom-out that rings the case modes over a desk thump, and a quieter key-up; the spacebar rings lower and its stabiliser rattles. Keys are typed as words and spaces with log-normal gaps at 10–13 keys/s, and each key keeps its own pitch offset.

## Pipeline

- `cues.ts` derives every picture event from the settings. It reuses the `sound.ts` window helpers and samples the Issues scene for per-triangle pop times and positions, so retiming a clip retimes the score.
- `<style>/composition.ts` holds the music. `<style>/design.ts` holds the foley plus the duck plan, which dips the music bus under key foley moments and runs before any music is emitted.
- `writing.ts` holds the piano-writing helpers: rolled chords, broken-chord figures over a `Progression`, and melodies in beats.
- `voices.ts` contains the synth/sample voices and the `Mix` buses and sends. `dsp.ts` provides the filters, FDN reverb, ping-pong delay, look-around limiter, BS.1770 loudness and master EQ.
- `render.ts` sums the dry buses and returns, applies the master EQ, normalises, limits, and adds the final fade.

The preserved original at `?experiment=micro-18&cut=original` uses an **Arabesque Acoustic typing-free bed + one live thock scheduler**, not the earlier full Web Audio effects engine. `pnpm ultimate3:score --style arabesque-acoustic --split-arabesque --tuning src/experiments/micro-18/score/arabesque/softness-8-tuning.json --out <new-path>.wav` writes that bed, a split-playback parity export, and frozen provenance. See `../AUDIO_EXPORT.md` for the exact gain/control contract and static-bed retiming limitation. Ordinary score renders bake shared thock PCM through their score buses; split playback keeps the keyboard dry and outside bed mastering. The `keyClick` API/tuner identifier remains for compatibility, but its old bright bandpass recipe is gone. No original WAV or frozen export is overwritten.

## Credits

Piano: [Salamander Grand Piano](https://github.com/Tonejs/audio) by Alexander Holm, licensed [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). Sources and hashes are in `sound-sources/salamander-tonejs/source-manifest.json`. Strings: [VSCO-2 Community Edition](https://github.com/sgossner/VSCO-2-CE) by Sam Gossner and Simon Dalzell, [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/); trimmed and re-encoded in `sound-sources/vsco2-strings/` (see its `source-manifest.json`). Every other sound is synthesized in `voices.ts`.
