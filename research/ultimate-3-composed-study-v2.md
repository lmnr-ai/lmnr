# Ultimate 3 — composition study 02

## The question

Does a connected sonic scene communicate a convincing direction better than v1's isolated swatches?

User feedback: the first studies felt like paint splattered into separate squares. Quiet Assembly was the closest, but only slightly. The next artifact must have phrasing, development, contrast, and an overall shape—not merely improve individual clicks.

## Artifact

**A thought finds its shape** — 29.6 seconds of original musical context plus material sound design.

Listen: http://localhost:5180/sound-studies/ultimate-3-v2/index.html

Files: `poc/public/sound-studies/ultimate-3-v2/`.

Generator: `poc/scripts/generate-ultimate3-composed-study.mjs` (run from repository root; requires Node and ffmpeg).

This is a throwaway composition study, not a new production soundtrack or a picture-synchronized cue. The existing Ultimate 3 and all v1 files/audio remain unchanged, apart from a navigation link in the v1 HTML pointing to this follow-up.

## Composition choices

| Time | Role | Arrangement decision |
|---|---|---|
| 0–4.8s | A thought | Open fifth/ninth harmony, incomplete muted-string motif, close material contact, fine connective friction. |
| 4.8–9.6s | Finding a pattern | Related motif with a changed root; irregular contacts begin sharing a cadence with soft low pulses. |
| 9.6–14.4s | Gathering | Greater note/grain density and suspended harmony; noise changes color and direction instead of being a repeated stock whoosh. |
| 14.4–16.8s | The breath | Notes cease; the harmonic/room tails deliberately drain. A short clearing creates anticipation before a quiet pickup. |
| 16.8–24s | Opening | The original motif returns with major-third context and fuller harmonic voicing. Low pulses carry momentum rather than isolated notification sounds. |
| 24–29.6s | Coming to rest | Related descending phrase resolves to D; short material settlement and harmonic release, not a new unrelated logo chime. |

The 100 BPM grid is an authored choice, not a claim about the reference. Contact events are not all quantized equally. Density, register, and harmony create the arc; the master is not simply turned up for the reveal.

## Sound changes from v1

- Exposed sine/FM notification-like notes replaced by noise-excited muted-string synthesis with a small damped modal body.
- Material contacts use lower inharmonic modes and a softened noise attack.
- Continuous travel uses overlapping frequency bands and evolving folded amplitude, with restrained high-frequency energy.
- Fine friction is built from overlapping seeded grains, not a frozen looping sample.
- Musical harmonic support and soft bass pulses give the scene connective tissue. This is a substantial change of scope from an SFX-only palette, and is explicitly labeled on the player.
- A shared damped comb/all-pass room supplies depth without external impulse responses.

All audio is local original synthesis: no Base44 samples, copied melodies, recorded Foley, sample-library assets, external room responses, or model-generated sound.

## Important distinction: composition versus effects quality

Adding music does not establish that the effects themselves improved. The page provides aligned `musical-foundation.wav` and `material-motion.wav` stems for inspection, using the **same gain as the full mix**, not individually normalized. The primary artifact is the full composition; the stems are not another menu of unrelated swatches.

This musical support is provisional context, not authorization to replace Ultimate 3's existing music. Future picture scoring must reconcile these tones with the actual music or explicitly agree a music replacement. User listening should determine whether this is too polite, synthetic, melodic, or rhythmically busy for the desired direction.

## Engineering checks — not taste validation

- WAV/MP3 render succeeded and finite/unclipped PCM and cue bounds were checked.
- WAV: 48 kHz, 16-bit stereo, 29.6s; integrated **−21.02 LUFS**, true peak **−2.30 dBTP**, loudness range **7.2 LU**.
- MP3: 256 kbps; integrated **−21.02 LUFS**, true peak **−2.29 dBTP**.
- Target was −20 LUFS, but a **constant gain** ceiling of −2.3 dBTP took priority. No compressor or limiter was used.
- The ffmpeg loudnorm JSON in `manifest.json` includes diagnostic output estimates, but the filtered audio stream was discarded. Only `input_*` fields describe the delivered audio. The manifest's `normalization_type: dynamic` belongs to that discarded diagnostic path, not to the mastering applied to the files.
- Mono energy retention: approximately **0.991**. Mean DC approximately **−1.1e−14**.
- Browser decoded the WAV at 29.6s, readyState 4, no media error. Seeking to Opening started playback around 16.8s and selected the correct chapter. At 390px viewport, page width remained 390px.
- Browser playback was muted: these checks establish operability, not audio quality. Node syntax and `git diff --check` passed.

No new Gemini review was requested. Earlier critiques suggested useful hypotheses, but their timestamp errors and uncertain audio path are not a reliable artistic gate.

## Next listening decision

Does the gathering earn the breath? Does the returning motif feel like a satisfying answer? Is the musical/contextual layer helping the intended film, or pulling it toward an instrumental track the user does not want?

If the arc works, score a short actual picture segment next. If it does not, revise this composition rather than expanding it across the full film. No sound is approved merely because this artifact renders or passes level checks.
