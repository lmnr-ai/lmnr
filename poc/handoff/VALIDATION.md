# Stacked handoff validation

Base: `sandbox/signals-launch-video` at `6ba5d926c38281ea8f4d9cd2eafb3b051ab21494`.

## Checks

- **Production build passed:** code-only Vite build, `copyPublicDir:false`, in `/tmp/signals-handoff-build-MyOBLQ`. 725 modules transformed; existing large-chunk warning only. No generated output is committed.
- **Typecheck passed:** `pnpm typecheck` (`tsc --noEmit`).
- **Animation/audio/CLI regressions passed:** 194 tests, zero failures, covering Micro09/10/14/15/16/17/18/20, score tuning/typing/merge behavior, CDP, and score CLI guards.
- **Signal Lab regressions passed:** 19 tests, zero failures.
- **Full score suite passed:** `pnpm ultimate3:score:test`, including the retained upstream styles and keyboard models, determinism, loudness, and peak checks.
- **Preservation passed:** all 2,700 files in the original standalone source manifest remain unchanged. All 861 transferred-file hashes match `transfer-manifest.json`. All 183 transferred WAV/MP3/M4A/PCM audio files match their originals byte-for-byte. The original `lmnr` checkout retains its original branch and worktree status.
- **Publication scope passed:** staged paths are limited to the launch PoC, companion sound/research tools, and relocated trace-generator scaffold. No credentials, agent state, dependencies, rendered MP4s, or unexpected deletions are staged. A dependency symlink used only for local validation is ignored and not committed.
- **Credential pattern scan passed:** no private-key headers or recognized GitHub/OpenAI/Anthropic/AWS credential patterns, or long literal API/access-secret assignments, were found in transferred text files. This is a bounded precaution, not a comprehensive security audit.
- **GitHub size check passed:** every staged file is below GitHub's 100 MiB limit. The media-embedded historical `transcript/timing-editor.html` is 83,575,945 bytes (above the recommended 50 MiB size); it is retained intact as a self-contained reference.
- **Whitespace check notes:** `git diff --cached --check` reports whitespace copied from the original source (a JSX trailing space, a final blank line, and Markdown hard-break/trailing spaces). These were not reformatted during the handoff.

## Audio reference

`public/audio/voiceover/Signals-launch-09-27-03-17.m4a` is copied unchanged from the user-supplied recording. AAC stereo, 48,000 Hz, 58.901333 seconds. SHA-256: `5519cb5f0c69355c65ab2f57b36af684989cab660881b743d872937aecba7ee0`.

## Merge coverage

`src/experiments/micro-18/score/handoff-merge.test.ts` covers retained upstream Phase/Tintinnabuli and keyboard options, typing-disabled silence across all five models without RNG consumption, and the existing shared thock events versus alternate keyboard selection. The original live preview's typing-free WAV and thock engine were not regenerated or rewritten.

The independent earlier twinkle review, exact cut PNGs, and limitations are recorded under `verification/` and in `../HANDOFF.md`. This handoff does not claim a new browser, listening, or Remotion raster review.
