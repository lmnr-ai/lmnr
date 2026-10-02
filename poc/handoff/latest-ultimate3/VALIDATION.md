# Receiving-checkout validation

Executed in `lmnr/poc` after transferring the current source:

- `pnpm typecheck`: passed.
- `pnpm exec tsx --test src/experiments/micro-18/*.test.ts src/experiments/micro-20/*.test.ts src/experiments/micro-22/*.test.ts src/experiments/introducing-flow-1-2/*.test.ts src/experiments/introducing-flow-1/geometry.test.ts src/experiments/introducing-flow-1/opening.test.ts`: **237 passed, 0 failed**.
- Vite production build via its JS API (`publicDir:false`, unique temporary output): passed. Avoided duplicating existing media; no source or public assets changed during the build.
- Deep comparison of normalized `settings.json` against receiving `VOICEOVER_DEFAULTS`: passed; **2315 frames**.
- `git diff --check`: passed.
- All **31 transferred files** match their local source hashes.
- **747 source/script/media/package paths** match the local project byte-for-byte, including existing audio assets.
- Checked **3524 preexisting tracked files** for unintended modifications. Only the scoped source paths and `poc/HANDOFF.md` changed. The unrelated untracked `signals-status-column.png` is unchanged.
- Approved A WAV matches the selected Downloads file's SHA-256; ffprobe confirms 24-bit stereo PCM at 48 kHz, 70.101333 seconds. Processing measured −16.03 LUFS and −1.54 dBTP; original recording unchanged.

## Existing local render/browser evidence

Before transfer, the same local source produced a complete H.264/AAC MP4:
1280×720, 30 fps, 2315 frames, video 77.166667s / audio 77.166000s.
Its metadata is saved in `last-render-ffprobe.json`.

Local browser geometry checks confirmed transparent/unclipped Issues entry,
edge-to-edge trace/shared-grid coverage at four bridge times, and no blue-agent
peek before movement. Explanation words were checked at 57.66s / 58.26s /
58.87s (0 / 9 / all 20 words).

No second MP4 render or separate receiving-server browser session was run for
this transfer. Receiving build/tests and byte identity establish source parity;
these checks do not claim fresh visual/listening approval. The newly approved
A voiceover remains a handoff asset, not part of the existing mix or MP4.
