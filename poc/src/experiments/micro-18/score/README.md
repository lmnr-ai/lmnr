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

### `tidepool`, `lumen`, `windup` — rounded-digital concepts (LAM-2311)

Three sound designs written from scratch for the voiceover cut. They share nothing with the piano/foley family above. Instead they use `rounded.ts`: sine-only modal resonators (marimba, kalimba, glass, music box, wood, vibe), blips, bubbles, springs, noise glides, breathing sine pads, a Karplus-Strong string, and harmony helpers (`chordAt`/`toneOf`). With those helpers every pitched SFX lands on a tone of the chord under it. Each concept puts SFX in three tiers: tier 1 is the failure, the warnings, the Flow-1 reveal and the logo. Tier 2 covers camera moves, entries, drawers, bash, budget, cover and window. Tier 3 covers stream blocks, beads, typing, labels and issue pops. Each concept also ducks its music bus under every narration phrase (`voiceBed`, from `cues.voice`) and plays a short motif in each pause of at least ~1 s.

- `tidepool`: F major, 96 BPM. The bed is kalimba, marimba and water: there is no beat before Flow-1, so the agent's stream blocks play the melody as kalimba droplets. A marimba pulse enters with the cheap models, and the budget drips away in slowing, falling bubbles. Flow-1 lands a brushed, half-time groove with a string bass and a kalimba arpeggio. The C–F–G–A vibe motif resolves on the logo.
- `lumen`: A major, 120 BPM. Light and data: a 16th-note sine-blip arpeggio is the agent thinking from the first frame. It stutters and stops at the failure, returns with the insights, and detunes downward as the budget dims. Flow-1 blooms into a soft four-on-the-floor with FM glass and a sine bass. Motion is tuned air with a sine sliding between chord tones, and the answer motif is a 1–5–3 bell call.
- `windup`: G major, swung 112 BPM. A clockwork toy: a tick-tock escapement, a music box, and a walking plucked bass. Every camera move turns an eased ratchet, arrivals are springs and closes are wooden clunks. At the budget depletion the whole music bus winds down (`mix.tapeStop`). A key winds up into Flow-1, which releases into an I–vi–IV–V toy-band groove with a music-box tune.

### `bluenote`, `overdrive` — jazz and maximal concepts (LAM-2311, round 2)

Reviewers found the three concepts above too calm, so round 2 goes the other way. Both styles reuse the `rounded.ts` harmony helpers, and every cue is guarded for settings without the source22 prelude.

- `bluenote` (`bluenote/`): a swinging jazz date at 152 BPM (swing ratio .64). A piano trio with vibes plays in F: ride and hat, brushes or sticks, a walking upright (Karplus-Strong plus a thump), and Charleston piano comping on rootless voicings. The failure is a stabbed Gb13 and a stop-time over a bass pedal. Cost turns to D minor with drum bombs, and the budget dies on a sad plunger trombone. "Until now." is a snare roll and tom fill into a big-band shout chorus in A♭ for Flow-1. Voice gaps get bebop licks (vibes before the drop, trumpet after), and the logo is a Basie ending: two plinks, a soft chord, then the full-band button after "with Laminar". The foley is the band too: cymbal swells and vibes runs on moves, and a muted-trumpet "wah-wah" on warnings. `bluenote/instruments.ts` has synthesized cymbals (808-style metal plus noise), toms, the upright and a horn section with scoop, fall, rip and plunger-wah controls.
- `overdrive` (`overdrive/`, needs the VSCO string banks): a 128 BPM trailer/festival hybrid that never sits still. It opens on a braam, then D-minor driving celli (sampled spiccato 16ths), four-on-the-floor and a pumped supersaw pad. The failure stutters into a slam (braam, taiko, impact, timpani, double crash) and silence. The insights build to a fake-out tape-stop, and "powerful" is a slam into a taiko/braam section. The budget tape-stops, and "Until now." is an accelerating snare roll into a D-major festival drop with a lead hook in the voice gaps. Issues builds and drops again, and the conclusion builds into a semitone key change (E♭) for the biggest hit, with a second slam after "with Laminar". The SFX are big whooshes with sub hits on every move, laser zaps on blocks, and klaxons on warnings. Its limiter peaks at ~4 dB of gain reduction from the groove density, by design. It is mixed with `--bed-db=-4`.

### `tempesta` — classical violin concept (LAM-2311, round 3)

- `tempesta` (`tempesta/`, needs the VSCO string banks): a virtuoso violin concerto at presto, 144 BPM, in the manner of Vivaldi's "Summer" storm and a Paganini caprice. Everything is the sampled orchestra: the solo violin (`violin`), the violin section, celli, pizzicato and timpani, plus orchestral gran cassa (`taiko`). Nothing is noise-based: no cymbals, whooshes or impacts, whose filtered noise turned to grain in the hall. `drive()` layers a solo 16th figure (`storm` descending scales, `arp`, `bariolage`, `repeat`, `double` stops), violin tremolo in 16ths or 32nds, celli chugging in 8ths or 16ths, and timpani patterns. The film opens on a G-minor tutti. The failure is a diminished-seventh tutti and a scream up to B♭6. The insights climb a circle-of-fifths sequence into a Neapolitan A♭ hit on "If only". "Powerful" brings the full orchestra with double stops, and the budget drains through the violin alone (`drainLine`). "Until now." is a trill over a timpani roll, one beat of silence, and a G-major tutti drop. The cover shuts on a deceptive E♭, Issues moves to E minor and climbs back to G, and the logo is a cadenza run into the final hammer strokes. The foley is the orchestra too: violin swoops with a timpani arrival on camera moves, timpani and a celli stroke on landings, pizzicato in the key on blocks and pops, sforzando stabs on warnings, and high spiccato for typing. `tutti()` caps the string and drum level past forte (bigger hits get longer and add a high violin octave instead), which keeps the limiter at ~3.6 dB. The orchestra never ducks, neither under the voice nor for the warning stabs (`tempestaDucks` is empty). It is mixed at a constant `--bed-db=-7`.

### `primavera` — spring violin concept (LAM-2311, round 4)

- `primavera` (`primavera/`, needs the VSCO string banks) answers the tempesta feedback ("red, fire, raging"; the violin "very loud in your face") with spring and hope on top, calm and intellectual underneath. It is an allegro chamber concerto at 120 BPM in E major, rising to A major for Flow-1 (E7 pivot at the flow entry), in the manner of Vivaldi's "Spring" over a Bach continuo. The solo violin stays on its soft sample layer (dynamics ~.35–.55, level ~.6, bright ~.5) and sits deeper in the hall. Beneath it the celli walk in eighths, the violin section sustains soft chords, and pizzicato plays on the off-beats. `drive()` figures are `prelude` (Bach broken chords), `melody` (bowed two-bar `MOTIFS`, with an optional `canon` in the section a bar later, an octave down), `birds` (chirps) and `flow` (turning 16th runs). Cadences use `arrival()` (warm bowed chord, soft timpani only at size ≥ 1) and `rise()` (swell plus run), with no taiko and no tutti hits. The insights walk a circle of fifths, "If only" lands on a ♭VI Cmaj7, the budget drains through the violin alone, and "Until now." is a trill over E7, a breath, then the A major bloom. The cover shuts on Fmaj7 and the logo is a plagal D → A amen. The foley is soft: violin scales on camera moves, pizzicato on blocks and pops (the 47 radial pops are kept at .1 so the cluster doesn't hit the limiter), bowed accents on warnings, and a timpani plus celli landing. The master EQ trims the top (`highShelf: [7000, -1]`). The limiter peaks at ~2.9 dB and it is mixed at a constant `--bed-db=-6` with no ducking.

### `primavera-ambient` — ambient spring bed (LAM-2311, round 5)

- `primavera-ambient` (`primavera/ambient.ts`) answers "too active… stealing from the voiceover". It keeps primavera's greens and yellows but makes the bed ambient. `ambientPlan` uses the same keys (E major, then A major from the flow-entry E7 pivot) with add9 and major-seventh voicings that change every two bars. Each chord is a soft violin-section pad (attack 1.6 s, cross-fading into the next), over a celli drone on the root, with a faint high violin on every other chord. Sparse high pizzicato droplets fall on about a third of the off-beats; which off-beats is a fixed hash, and timing and velocity go through `humanize` so the seed test still sees variation. The solo violin only plays in the gaps of 0.9 s or more between voice phrases (from `cues.voice`), as 2–4 note phrases, so the melody never overlaps the narration while the level stays constant. Pizzicato arpeggios mark "Until now." and the logo. The foley is a few soft plucks (dyads on warnings, three-note lifts on camera moves, a quarter of the radial pops). Plucks ride routes with `gain: .55`: in a quiet sustained bed, their transients (not the pads) would otherwise drive the limiter (5.1 dB before, 2.1 dB after). It is mixed at `--bed-db=-10`, about 7 LU under the voice. `primavera` at -6 was only about 3 LU under.

### `primavera-dawn` — tension, then resolution (LAM-2311, round 6)

- `primavera-dawn` (`primavera/dawn.ts`) answers "the tension was never resolved at 'Introducing Flow-1'". Up to the budget running out it is exactly primavera-ambient (`ambientLayers`, shared with that style, over the first part of `dawnPlan`), so the problem half stays bright but unresolved. Under "Until now." the strings and celli swell on an E sus4 dominant over a soft timpani roll and an accelerating pizzicato ostinato, the suspension falls to E7 a beat before the reveal, and a violin run leads into a full A major tutti at `flow.reveal`. From there the harmony walks one bar per chord through consonant diatonic chords only (I–V6–vi–IV–I–ii7–V in Flow-1, IV–I6–ii7–I–vi–IV in Issues), and every section boundary cadences V–I onto A: the cover shutting, "It clusters issues" (`issues.native`) and the logo (IV–vi7–ii7–V sus4–V–I). Celli pulse in soft eighths with off-beat pizzicato. A slow singing line (the chord tone nearest a climbing register target, every half bar, held while it repeats) rides on top, softer while the voice speaks. The foley is primavera-ambient's, re-harmonised on `dawnPlan`. It is rendered on the tighter-cadence cut (editable-v10); the limiter takes ~2.7 dB, the peak is the reveal swell, and the timpani roll is kept low because it alone added ~0.9 dB. Mixed at `--bed-db=-10`: about 7.7 LU under the voice in the first half and about 6.5 LU in the second.

`cues.ts` now also gives `ultimate2.blocks` (when each stream pill or tool icon first enters the frame, sampled from the Micro17 world) and `voice` (the narration spans). `scripts/mix-ultimate3-concept.mjs` places the editable-v9 phrases (`--voice` for another edition) under a rendered bed at a constant level (bed −5.5 dB; `--duck` adds the old sidechain duck), then applies one measured gain to −14.7 LUFS into a −1 dBFS peak limiter and muxes the result onto a silent picture. It does not use single-pass `loudnorm`: that rides the gain and pumps the bed between phrases.

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

The preserved original at `?experiment=micro-18&cut=original` uses an **Arabesque Acoustic typing-free bed + one live thock scheduler**, not the earlier full Web Audio effects engine. `pnpm ultimate3:score --style arabesque-acoustic --split-arabesque --tuning src/experiments/micro-18/score/arabesque/softness-8-tuning.json --out <new-path>.wav` writes that bed, a split-playback parity export, and frozen provenance. See `../AUDIO_EXPORT.md` for the exact gain/control contract and static-bed retiming limitation. Ordinary score renders bake shared thock PCM through their score buses; split playback keeps the keyboard dry and outside bed mastering. The `keyClick` API/tuner identifier remains for compatibility, but its old bright bandpass recipe is gone. No original WAV or frozen export is overwritten.

## Credits

Piano: [Salamander Grand Piano](https://github.com/Tonejs/audio) by Alexander Holm, licensed [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). Sources and hashes are in `sound-sources/salamander-tonejs/source-manifest.json`. Strings: [VSCO-2 Community Edition](https://github.com/sgossner/VSCO-2-CE) by Sam Gossner and Simon Dalzell, [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/); trimmed and re-encoded in `sound-sources/vsco2-strings/` (see its `source-manifest.json`). Every other sound is synthesized in `voices.ts`.
