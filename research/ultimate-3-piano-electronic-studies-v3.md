# Ultimate 3 — three piano/electronic composition directions

## User direction

The previous study finally felt composed, but its muted strings sounded like a calm guitar piece. The new brief: a paradox between classical piano and zippy electronic tones; hopeful, technological, and respectful of classical roots. Three genuinely different soundscapes, not timbral variants of a single score.

## Deliverables

Listening page: http://localhost:5180/sound-studies/ultimate-3-v3/index.html

Audio/player: `poc/public/sound-studies/ultimate-3-v3/`.

Each has a full stereo WAV, MP3, and aligned piano/electronic stems retaining their mix gains. The player presents whole compositions first and allows passage seeking; starting another player pauses the first.

### 01 — Clockwork Bloom, 28.6 seconds

- **Shape:** A miniature 6/8 piano invention → an electronic second voice → momentary uncertainty → joined voices → bright cadence.
- **Classical basis:** D-major tonal movement, lilting bass/accompaniment, an independently phrased upper melody, related answering phrases, and a dominant-to-tonic cadence.
- **Technology:** Brief zips in piano rests, light offbeat accents, and later understated low pulses. Mostly answering rather than doubling the melody.
- **Tempo:** 80 dotted-quarter BPM; six eighth-note divisions per bar.
- **Character to test:** playful, nimble, curious. Does the electronics/piano conversation avoid becoming a cute toy-box cue?

### 02 — Glass & Voltage, 29.364 seconds

- **Shape:** Flowing piano → electronics cut across → partial freeze → interlocking return → piano-led resolution.
- **Classical basis:** E-flat-major broken-chord figures, a separate upper voice, harmonic inversions, and a final cadence.
- **Technology:** A 3+3+2 grouping against regular piano subdivisions, short low pulses and fast pitch-swept gestures. The sound language has sharper rhythmic edges than Clockwork Bloom.
- **Tempo:** 112 BPM in 4/4.
- **Character to test:** kinetic and incisive. Does the contrast create useful energy without turning into a generic electronic advertisement?

### 03 — Tomorrow, Softly, 31.4 seconds

- **Shape:** Intimate piano question → distant electronic response → gathering horizon → held breath → wider answer → restrained resolution.
- **Classical basis:** A-major melodic phrasing, voiced left-hand harmony, suspensions resolving toward the tonic, and deliberately varying phrase durations.
- **Technology:** Initially sparse quick signals become a wider harmonic voice at the return. A few articulated electronic pulses add movement without a persistent drum pattern.
- **Tempo:** Authored rubato: ten bars of 2.4–3 seconds, not a fixed-quantized grid or real-time random timing.
- **Character to test:** expansive and hopeful. Is the opening sufficiently alive, or still too calm? Does the digital answer feel surprising enough?

## Piano source and legal provenance

The guitar-like Karplus–Strong voice is **not reused**. These pieces use acoustic grand-piano note recordings from **Salamander Grand Piano by Alexander Holm**, licensed **CC BY 3.0**.

Actually accessed sources:

- Pinned upstream README: https://raw.githubusercontent.com/Tonejs/audio/efd8296360f9526e379bfbe5c1698ff54d6a1d34/salamander/README
- Distribution: https://github.com/Tonejs/audio/tree/efd8296360f9526e379bfbe5c1698ff54d6a1d34/salamander
- Independent source description: https://freepats.zenvoid.org/Piano/acoustic-grand-piano.html
- License: https://creativecommons.org/licenses/by/3.0/ (license identified in the accessed upstream README; no separate legal interpretation is claimed).

The initial guesses `README.md`, `LICENSE`, and `LICENSE.txt` in the Salamander folder returned 404. The repository listing revealed the actual file, `README`, which explicitly names Alexander Holm and CC BY 3.0. The FreePats page confirms the author, piano model, and license.

Only 22 sampled pitches were fetched, covering A1–C7 in minor thirds. This is the small Tonejs MP3 distribution, **not** the original full 16-velocity-layer instrument. Gain and filtering approximate velocity changes; they are not a substitute for true velocity layers or a human performance.

Source files: `poc/sound-sources/salamander-tonejs/`; pinned URLs, hashes, and sizes in `source-manifest.json`. The player and downloads include attribution, change notices, source links, and a copy of the original README. Preserve those credits when sharing.

All scores and electronic patches are newly authored. No known classical composition is being arranged. No recording, melody, effect, or impulse response from the Base44 reference is incorporated. No paid model request or Gemini evaluation was made.

## Reproduction

1. `node poc/scripts/prepare-ultimate3-piano-sources.mjs` — validates cached files; fetches the licensed subset only if the source manifest is absent. No paid API.
2. `node poc/scripts/generate-ultimate3-piano-electronic-studies.mjs` — renders locally using Node and ffmpeg.

An optional output-directory argument keeps render experiments isolated. The scores contain fixed note timings, small deterministic attack offsets, and seeded electronic synthesis. No wall-clock or interactive audio scheduling is involved.

## Checks performed

| Study | WAV integrated LUFS | WAV true peak dBTP | LRA LU | Mono energy ratio |
|---|---:|---:|---:|---:|
| Clockwork Bloom | -21.00 | -6.90 | 4.6 | 0.778 |
| Glass & Voltage | -21.02 | -4.82 | 4.0 | 0.847 |
| Tomorrow, Softly | -21.02 | -6.54 | 12.9 | 0.813 |

- Constant-gain level matching only; no compressor or limiter. All three reached the common −21 LUFS target within 0.02 LU. Tomorrow deliberately has the widest dynamic contrast.
- MP3 true peaks: −6.89, −4.82, −6.54 dBTP respectively.
- All nine WAVs: stereo, 48 kHz, 16-bit, expected durations, no PCM clipping.
- For each piece, the aligned piano/electronic stems sum to the full mix within **two 16-bit PCM units**, consistent with independent quantization/dither.
- Source hashes validated before decoding; output SHA-256 values and cue maps in the manifest.
- Node syntax checks and `git diff --check` passed.
- Browser decoded all three MP3s without media errors (readyState 4), at 28.6 / 29.364292 / 31.4 seconds. Switching passages selected the correct label and paused the other players.
- At a 390px viewport, document width remained 390px.
- Browser playback checks were **muted**. Technical checks do not establish listening quality or professional polish.

## Scope and decision boundary

The existing Ultimate 3 soundtrack and earlier audio studies remain unchanged. These are three composed auditions, not final picture-synchronized scores. The prior player gets a navigation link only.

Next decision belongs to the user's listening: choose the overall relationship between piano and electronics, not a sound in isolation. If a direction works, score a short actual film excerpt before expanding across Ultimate 3. These are original musical proposals, not an implicit decision to replace existing film music.
