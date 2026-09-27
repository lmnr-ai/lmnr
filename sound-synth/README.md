# Signal Lab soundboard

Open <http://localhost:4177/sound-synth/> and choose **signal lab / engine**. This remains an audition-only soundboard; it is not connected to video playback.

## Directions and compatibility

- **Felt rotor** (`servo`, C4): soft stretched piano-like partials.
- **Glass carousel** (`turbine`, C5): a lightly FM-excited glass tone.
- **Pixel purr** (`mechanical`, C3): rounded triangle resonance and filtered texture.
- **Ratchet** (`ratchet`, C4): phase-continuous transient teeth over an independently mixed soft whirr.

The original three serialized keys and defaults are retained. Old saved engines that omit the new fields are normalized against their own direction defaults at playback, without changing localStorage, so stale form values cannot leak into them. New controls are included unchanged in save, replay, digit shortcuts, and copied JSON.

Ratchet starting points range from **soft pawl** (dark, three rounded teeth), through **wooden wheel** (five medium teeth), to **digital ratchet** (seven short bright teeth). All share the same bounded ratchet algorithm.

## Controls

**Pitch**

- Base note is chromatic MIDI C2–C6; the UI displays note name and actual frequency.
- Fine tune is ±50 cents.
- Note and fine tune smoothly transpose every pitched partial, the FM carrier/modulator, low tonal weight, and tuned texture/click resonances. They never alter rotation.

**Motion and texture**

- Speed controls phase-continuous rotation from 1.5 to 12 revolutions/second. For Ratchet, click cadence is `rotation × teeth`.
- Power adds low body only; it does not alter speed or master volume.
- Brightness sets the spectral low-pass cutoff independently from recurrence; resonance is bounded from 0.2–12 Q.
- Noise texture adds a subtle filtered layer to every direction.
- Pulse depth blends steady and revolving action. At 0% the shared tonal/noise mix is truly steady; Ratchet's explicitly separate teeth remain audible.
- Pulse sharpness smoothly crossfades stable broad and narrow endpoint curves, avoiding live WaveShaper curve replacement.
- Ratchet click level, tone, decay (8–120 ms per strike), integer teeth/turn (1–8), and whirr level are independent. Decay stays in milliseconds as speed changes.
- Ratchet scheduling integrates rotation into tooth phase, including acceleration and live speed changes. An 80 ms audio-clock lookahead schedules each strike; after a main-thread stall, missed teeth are skipped instead of replayed in a burst.

Base note, fine tune, speed, power, brightness, resonance, noise, pulse depth/sharpness, ratchet controls, and master volume update smoothly during continuous playback. Changing direction while continuous gracefully replaces the source graph. Duration and spin-up apply on the next playback; spin-down applies on the next stop. Timed duration includes both ramps, which are proportionally shortened when necessary.

The master range includes true zero. Conservative click and output defaults keep the result digital, whimsical, and piano-adjacent rather than aggressive machinery.

## Saved piano sequence

The soundboard adds **G4 · E4 · C4** to saved sounds once without replacing or reordering existing entries. It uses the supplied piano voice and plays the descending notes 120 ms apart. Sequence metadata is retained by playback and **copy json**; ordinary saved piano sounds remain single notes.
