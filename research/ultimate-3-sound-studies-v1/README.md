# Ultimate 3 — sound studies v1

Three original 16-second sound studies, not a scored film or a professional-quality certification. The original Ultimate 3, soundtrack, soundboard, sound-synth, and song-studio are untouched by this work.

## Listen

With the existing preview server:

http://localhost:5180/sound-studies/ultimate-3-v1/index.html

Standalone player and audio: `poc/public/sound-studies/ultimate-3-v1/`. Its HTML uses relative WAV links and works without a build; it makes no external font, analytics, or script requests.

1. **Felt Circuit** — warm, material-led. Damped modal contact, quieter digital tone, fine noise friction.
2. **Glass Thread** — lighter, digital-led. Higher/shorter contacts, restrained FM tone, a little more short-room reflection.
3. **Quiet Assembly** — sparse hybrid. Fewer gathering grains, darker contact, a single bright final arrival in the composed phrase.

These material names are intentions, not claims of audible acoustic realism. There is no sampled felt, paper, glass, wood, voice, or music.

## Structure and listening questions

- 0–8 seconds: isolated contact, articulation, travel, and gathering gestures.
- 8–9 seconds: breathing room.
- 9.2–14 seconds: a small composition from that palette.
- Remaining time: tail and silence.

The order of isolated roles is held constant to make comparisons easier. The final phrases differ deliberately. They are not three identical arrangements with only timbre changed.

Keep overall playback volume stable. Listen once without reading the intent, then compare the same role across studies. Which world belongs with the film? Which gesture feels cheap, hollow, brittle, too synthetic, or overly musical? What should be removed? These questions matter more than a numerical score.

## Synthesis and provenance

Generator: `poc/scripts/generate-ultimate3-sound-studies.mjs`.

Everything is synthesized locally from seeded noise, damped sinusoidal modes, low-index FM, filters, and short same-polarity room taps. No sample library, recorded Foley, external impulse response, or part of the Base44 reference is incorporated. Related damped modes share a rounded onset; bright layers decay faster. Noise travel uses a broad amplitude arc rather than a whistling resonant riser. Grain groups gather toward center instead of triggering one sound per visual particle.

All PCM is 48 kHz, 16-bit stereo. TPDF dither is deterministic and exact silent regions remain zero. Loudness matching applies **constant gain**, targeting −22 LUFS while reserving a measured true-peak ceiling of −3 dBTP. There is no limiter, compressor, or dynamic normalization. `ffmpeg` loudnorm is used for measurement only; its processed stream is discarded. Tonal selections are provisional and must later be reconsidered against the actual music.

`poc/public/sound-studies/ultimate-3-v1/manifest.json` records seeds, cue onsets/durations/gains/pans, measurements, and WAV SHA-256 hashes. The reference analysis informs broad creative possibilities only; full perception of that recording remains unverified.

## Validation evidence

Initial generation passed finite/bounded PCM, cue extent, leading silence, DC offset, mono-energy compatibility, and measured true-peak assertions.

| Study | Integrated LUFS | True peak dBTP | LRA LU |
|---|---:|---:|---:|
| Felt Circuit | -22.05 | -4.61 | 5.9 |
| Glass Thread | -22.01 | -7.17 | 4.7 |
| Quiet Assembly | -22.15 | -4.70 | 5.7 |

Browser check using agent-browser with installed Chrome:
- All three WAVs decoded with 16-second duration, readyState 4, and no media error.
- Phrase button began playback around 9.2s.
- Starting another study paused the first.
- Playback test was muted; it establishes operation, **not listening quality**.

Node syntax checks and repository `git diff --check` passed. The separate reproducibility task (`b697c76af`) completed with exit code 0: regeneration in an isolated temporary folder reproduced all three WAVs and the manifest byte-for-byte.

## Gemini review protocol

User explicitly authorized one review of each study. Runner: `poc/scripts/review-ultimate3-sound-studies.mjs` (running it makes paid network requests; never run as a test).

- Model: `google/gemini-3.6-flash`, via Vercel AI Gateway Chat Completions file attachment.
- Complete WAV per request, with neutral filename `study-N.wav`.
- No intended palette, source code, cue map, or reference-analysis prose supplied.
- Same critical prompt for all three, low reasoning, max 1,400 output tokens each.
- One request per study; no retries or model switches. Pre-send receipts prevent accidental repeat billing in the same output directory.
- Ask for acoustic anchors, candid professional-sketch assessment, strongest/weakest detail, and ranked edits. Explicitly stop if only transcript/text is available.
- Responses are **advisory model opinions**, not proof of successful audio decoding or professional certification. Reported zero audio tokens would remain ambiguous, not be silently ignored.

Review Markdown and sanitized evidence live beside this README. Credentials and audio base64 are never saved. Evidence contains content hashes, reported model/usage/cost, and an explicit false flag for independently verified perceptual coverage.

## Next decision

User audition first. Keep one palette or combine selected roles, then create a short scored picture segment. Only after that listening checkpoint should these studies become the separate full Ultimate 3 replacement pass. No full soundtrack is being generated here.
