# Ultimate 3 deterministic audio export

Run from `poc/` with explicit frozen scene props and a flat or DialKit-grouped mix JSON:

```sh
pnpm ultimate3:audio \
  --props ../artifacts/exports/ultimate3-20260924/props.json \
  --mix ../artifacts/exports/ultimate3-20260924/sound-mix.json \
  --wav ../artifacts/exports/ultimate3-20260924/ultimate3-soundtrack.wav \
  --manifest ../artifacts/exports/ultimate3-20260924/ultimate3-soundtrack.manifest.json \
  --silent-video ../artifacts/exports/ultimate3-20260924/ultimate3-silent.mp4 \
  --output-video ../artifacts/exports/ultimate3-20260924/ultimate3-with-effects.mp4
```

The command bundles a temporary browser harness, renders the existing Web Audio recipes and schedules in Chrome `OfflineAudioContext` at 48 kHz with seeded noise, writes an IEEE-float WAV on a fixed -100 dB PCM grid, records SHA-256 links to the exact props/mix/WAV, and optionally stream-copies the frozen H.264 video while encoding audio to AAC. It never reads localStorage. `MicroAnimation18` also accepts `audioSrc` for direct Remotion rendering; use the manifest hashes to ensure that source was generated from the same props and mix.

The audio buffer is exactly `durationInFrames / 30`; effect and reverb tails are retained until that boundary and intentionally truncated at the composition boundary. Event timing and seeded noise are deterministic. Chrome's oscillator/filter implementation can vary by a few final float units across separate processes, so validation compares PCM numerically (the observed maximum delta is recorded in the evidence) rather than promising a byte-identical WAV hash. The manifest reports peak and RMS. Values above unity are not silently normalized; the manifest explicitly warns when the requested high-gain mix exceeds unity.
