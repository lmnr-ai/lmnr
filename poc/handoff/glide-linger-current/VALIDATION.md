# Validation

- Imported PR #2466 head `5ce52252371062f97711006b033b0a70ae6b6b03` against synchronized base `9d7f4c72d`. All 29 incoming paths matched their base locally; no conflict resolution or unrelated overwrites were needed.
- At initial import, 28 files were byte-identical to the PR, including all five soundtrack beds. The subsequent shared-default correction additionally wires `VoiceoverApp.tsx` to the current-cut loader; audio assets remain unchanged.
- TypeScript typecheck: passed.
- Ultimate3 and Animation16 regression tests: **195 passed, zero failed**.
- Targeted `ultimate3:score:test glide-minimal-linger`: passed.
- Code-only Vite production build: passed (existing large-chunk warning).
- Current-profile audio export: passed source/bed checksum validation, **2212 frames / 3539200 stereo samples at 48kHz**. Selected bed: `glide-minimal-linger`. Output SHA-256: `e8572a5e74c3d454a164072584bcd399279f6d74a973fa68cb63b3684afb3367`.
- Installed-Chrome check at 20.7s confirms all three yellow agents use the canonical white-agent path with black 3px strokes. The persisted cut has paper off, 2212 frames, master 6.98, and soundtrack `glide-minimal-linger`; it survives reload.
- Spinner regression was red at 1.5px, then green at 3px. It exercises the actual Ultimate3 renderer and forward/reverse sample times. Purple, white and blue artwork and all spinner clocks are unchanged.

No new full MP4 or subjective listening approval is claimed. The extended ending, narration and softer sound design are adopted from the PR's unchanged bed. A +3dB narration boost was not applied.

## Shared-default correction

The original validation only covered settings installed in the automated browser.
A fresh browser still got a 1.5px spinner. Two loader regression tests reproduced
that failure (`1.5 !== 3`). The actual `VoiceoverApp` entrypoint now uses
`loadCurrentVoiceoverSettings`, not the frozen historical loader directly.

- Nine targeted tests and TypeScript typecheck pass.
- The subsequent full Ultimate3/Animation16 regression run passes **201 tests,
  zero failures**. The production build also passes (large-chunk warning only).
- A separate browser session, without manually importing a profile, renders all
  three yellow strokes at 3px, selects linger, and uses the 6.75s logo hold.
- Seeding that session with the previous generated defaults and reloading also
  renders all three strokes at 3px.
- Tests cover one-time migration, storage backup, gain/preset preservation,
  literal explicit imports, custom controls/endings, and later manual edits.

Local backups and detailed evidence: `artifacts/tmp/glide-linger-integration/`.
