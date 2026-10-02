# Historical v2 local voiceover integration verification

This document records the previous 1942-frame v2 preview only. For the active v4 cut, see `LOCAL_PREVIEW.md`; these measurements and browser checks do not validate the latest cut.

## Preservation

- `411aed4`: checkpoint of existing local source and authored assets before importing anything.
- `21392a2`: verbatim seven-file import of upstream `1432ccce7`, preserving its author/message.
- All seven imported files match the upstream Git blobs byte-for-byte.
- Checkpoint-relative modifications are limited to five existing integration files; all other checkpoint source and assets remain unchanged. The narration recording matches SHA-256 `5519cb5f0c69355c65ab2f57b36af684989cab660881b743d872937aecba7ee0`.
- Generated inspection/export directories were left intact and were not included in the checkpoint.

## Audio

- `ultimate3-voiceover-v2.wav`: SHA-256 `b7942fb5034b32370edf3a55835446dbdcb6b53b2ef3ec816bd85c57889bc99b`.
- ffprobe: stereo, 48,000 Hz, exactly **3,107,200 stereo sample frames**, matching **1942 video frames / 64.733333 seconds**.
- Final mix measured **-15.15 LUFS integrated**, **-1.00 dBTP**. This reconstructs the upstream approximate mix description; it is not the unpublished original export.
- Build output-overwrite guard tested: existing output rejected without changing its checksum.
- First generated v1 preview had a 36.7ms short tail caused by timestamp-based trimming. Replaced by sample-count-based padding/trimming plus a hard ffprobe check. Only those newly generated failed v1 files were removed; original audio was not modified.

## Mounted browser checks

Performed with installed Chrome through an isolated `agent-browser` session against the existing port 5180 server; no server was started/restarted, and no user browser storage was changed.

- New route renders the imported 64.731333-second authored timeline using the existing Micro18 UI.
- Exactly one audio element created during playback, loading the v2 voiceover WAV; no duplicate keyboard. Browser reports 64.733333-second audio duration.
- Measured playback clock difference: approximately 37ms, within the inherited media-engine seek tolerance.
- Pause stopped the audio. Main-timeline seeks to 56, 20, and 62 seconds updated both artwork and paused audio to the same times.
- Master gain 0, 2, and 6.98 reached the single output gain; fixed source calibration remained 1/6.98.
- Switching into Issues and back retained the global frame and paused state.
- Original settings/main-panel sentinel data remained byte-identical after playback, view changes, and new-cut authoring initialization.
- Paused `?time=62.251` inspection shows “With Laminar”, with no timeline transport mounted.
- No browser console errors; isolated test session closed after verification.

## Automated checks and review

- `pnpm typecheck`: passed.
- Animation/audio/authoring/CLI regression suite: **194 passed, zero failures**.
- Code-only production Vite build (`copyPublicDir:false`): passed; 728 modules, existing large-chunk warning only. Output: `/tmp/ultimate3-voiceover-vite-sjueet`.
- `git diff --cached --check`: passed.
- Fresh independent source review: **OK with notes; no issues found**. Reviewer read the exact staged source diff and all named files, confirming opt-in routing, isolated storage/panel IDs, scoped authoring compatibility, one audio engine/no extra keyboard, exact sample-count/overwrite guards, and regression coverage. Browser/audio measurements were parent-verified, not re-run by the reviewer. The frozen mix must be rebuilt after timing edits.

Earlier checks caught two test-only typing/serialization assertions; these were corrected without changing the imported timings. No fresh Remotion video export or subjective listening/visual approval is claimed.
