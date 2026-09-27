# Active Ultimate 3 thock integration — parent verification

## Delivered

Active viewer: http://localhost:5180/?experiment=micro-18

- A new typing-free Arabesque Acoustic bed retains the softness-8 tuning and music style. Original `ultimate3-softness-8.wav` is unchanged.
- Exactly one live shared lubed-linear thock scheduler follows current source20 settings. The full legacy effects engine remains disabled.
- Score postlude cues now include the resolved source20 prelude; the old clock was 8.45 seconds early. Blocked postludes are gated.
- Fixed bed input calibration `1/6.98`, fixed thock trim `.2`, existing linear master and typing controls; no saved-value migration. `musicVolume` still belongs to legacy Sangers, not Arabesque.
- Split export includes bed + shared thocks, and optional video mux now uses that full playback WAV. New output preflight/exclusive writes protect bed, playback, manifest, stems, and video.

## Assets

Under `poc/public/audio/arabesque-acoustic/`:

- `ultimate3-softness-8-no-typing-v1.wav`: typing-free active bed.
- `ultimate3-softness-8-no-typing-v1.playback.wav`: matching full soundtrack at default settings/mix.
- `ultimate3-softness-8-no-typing-v1.json`: settings, tuning, seed, identities, measured loudness/peak, hashes, and provenance.

Duration 63.233333 seconds, 48 kHz stereo 24-bit. Bed approximately -14.0079 LUFS, split playback -14.0070 LUFS, -1.20 dBTP. Parent verified published hashes against the manifest and an independent rerender. A subsequent real CLI integration test reproduced those hashes again and verified muxed AAC matches encoding of the complete playback WAV.

## Verification

- `tests.txt`: parent rerun, 85/85 regression tests pass.
- `split-cli.txt`: 2/2 real CLI integration tests pass; typecheck passes. Tests cover preflight preservation, invalid arguments, reproduction, and full-keyboard video mux.
- `score-full.txt`: parent all-style deterministic score tests pass with expanded time budget.
- `build-code-only.txt`: production Vite code build passes with `copyPublicDir:false` (assets verified separately).
- `browser.json`: completed worker test of the actual mounted :5180 route. Default and edited timelines use shared PCM with zero buffer difference; unique scheduled voices; pause/seek/replay and master 0/1/2 verified. Paused inspection is silent, browser errors empty. Short Web Audio parity render: mute peak 0, doubling delta 0, formula delta ~1.30e-9.
- `preservation.json`: final parent hash audit of 1,046 pre-existing files; only 15 authorized existing files changed, none deleted, original WAV unchanged. Snapshot `/tmp/ultimate3-active-thock.bUyKRu` includes tracked and untracked source. The adjacent diff covers those existing files; new implementation files are listed in the snapshot's `changed-files.json`, plus `poc/scripts/render-ultimate3-score.test.ts` added during parent recovery.

## Recovery and review transparency

The implementation worker timed out during final verification without its final report. Parent inspected its snapshot-relative changes and artifacts, corrected stale documentation and split-video muxing, added output safety tests, and reran validation.

No independent code-review approval was obtained: one reviewer lacked its provider extension; another finalized before reading files; Fusion rejected the configured API route; the separate CLI reviewer failed authentication. These are NOT clean reviews. Parent performed code inspection and acceptance based on the evidence above.

The initial parent all-style test run exceeded 180 seconds; the longer rerun passed. A separate full asset-copy build failed with ENOSPC while duplicating unrelated public Silk exports. Parent removed only its incomplete temporary output, then successfully built code without copying the public directory. No project assets were deleted.

## Limitations

Only live typing follows arbitrary editor retimes. The bed's music, other effects, and length are frozen to its manifest settings and require rerendering after timing changes. Other legacy per-effect controls do not remix the bed. High master/typing settings can clip; no hidden normalization is applied. No subjective listening approval is claimed.

Reproduction and usage are documented in `poc/src/experiments/micro-18/AUDIO_EXPORT.md`.
