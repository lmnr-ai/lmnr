# Validation — October 2 handoff

Verified in the isolated `lmnr-turbopuffer-latest` publication worktree, based on remote commit `5ce52252371062f97711006b033b0a70ae6b6b03` after `git pull --ff-only`.

- `pnpm typecheck`: passed.
- `pnpm exec tsx --test src/experiments/introducing-flow-1-2/*.test.ts src/experiments/micro-18/*.test.ts src/experiments/micro-23/*.test.ts`: **233 passed, 0 failed**.
- Vite production code build (`publicDir: false`, unique temporary output directory): passed; only the existing large-chunk advisory remains. Media integrity was checked separately, below.
- `git diff --check`: passed.
- Serialized preview settings match the JSON representation of `CURRENT_VOICEOVER_DEFAULTS`; frame count is **2212**.
- SHA-256 checks for the original recording, processed WAV, AAC copy and processing script: passed against `provenance.json`.
- Full FFmpeg decode of all three audio files: passed without reported errors.
- Processed master: stereo 48 kHz, 24-bit PCM; verified **-15.96 LUFS / -1.54 dBTP**.
- WAV/AAC duration difference: less than one 30 fps frame. See `audio-formats.json`.
- **1,158 source files match the current authoring checkout byte-for-byte**. Exceptions: the handoff index has the new delivery entry, and the obsolete local bootstrap HTML was intentionally excluded.
- All **1,140** pre-existing upstream `poc/` files are retained. No tracked changes outside the explicit animation transfer allowlist were introduced. Existing narration and soundtrack media are unchanged.
- The source authoring checkout was not switched, staged, reset, or committed.

The matching-caption/score/label-spacing browser suite previously passed on the source checkout, including forward/reverse seeks and no clipping. Its code was transferred byte-identically. Publication validation does not claim a separate browser server was launched for this worktree, a full MP4 was rendered, or subjective listening approval was performed.
