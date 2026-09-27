# Animation 20 — odd grid, 54px hero, stage-specific spinner

## Completed requirements

- Centered 17-column × 12-row grid (204 cells) throughout scan and postlude. No late layout translation.
- Original Issue clusters source column c maps to c−1 on the owned grid. Cluster covers/borders, large/small warnings and ground dots share the same mapping. Screen-space coding-agent UI and subtitles remain unchanged.
- All 47 warning identities/trajectories preserved, including off-canvas source-column-zero starts and targets. Newly exposed right-edge content is not pre-clipped by the old SVG viewport.
- Final blue-agent diameter is **54px**, superseding the original 68px request. Initial diameter remains 120px and gray dots settle at 12px.
- Five magnitude dials in turns/sec: spinnerEntrySpeed, spinnerStopSpeed, spinnerDescentSpeed, spinnerZoomSpeed, spinnerAnalysisSpeed. Defaults 1.9; range 0–10. Descent is counterclockwise, opposite the other stages. Zero pauses the selected stage.
- Piecewise integrated angular velocity preserves accumulated phase through stage boundaries, authored overlaps, holds and reverse seeks. Descent takes priority over stopping/opening; stopping/opening over entry. Rotation stops when the blue agent exits.
- Load-only migrations retain original backups, custom values, base/preset independence, selection and later imports. Obsolete 820px scan default becomes 900px to cover all remapped warning starts. Old spinner magnitude initializes missing stage values; explicit new values, including zero, win.

## Recovery and review status

The implementation child timed out before the independent review phase. It saved the odd-grid changes but did not apply the subsequent 54px/spinner updates. Parent inspected those partial changes, implemented the latest requests directly, and performed the checks below. No independent reviewer completion is claimed.

## Parent-executed validation

- `pnpm exec tsx --test src/experiments/micro-20/*.test.ts src/experiments/micro-15/sample.test.ts src/experiments/micro-16/sample.test.ts src/experiments/micro-17/sample.test.ts`: **56/56 passed**.
- `pnpm typecheck`: passed.
- `pnpm exec vite build`: passed, existing large-bundle advisory only.
- `node artifacts/tmp/micro20-odd-grid/browser-test.mjs`: passed 12 native-size App poses. Actual SVG CTMs verify 54px hero/12px dots, 204 exact static border paths across handoff, 47 mapped warnings, ground/cluster geometry, untranslated UI, both viewport edges and migration/import behavior.
- `node artifacts/tmp/micro20-odd-grid/spinner-browser.cjs`: passed all five actual rendered velocity checks, independent edits, zero-speed pauses, stage-boundary phase continuity, serialized export sampling parity and reload persistence. No browser errors. Default descent −684°/s versus +684°/s in other stages; edited 0.7 turns/sec produces ±252°/s.
- Both dedicated browser sessions closed successfully. Used existing localhost5180 and installed Chrome only; no server restart/install/staging/commit.

Initial spinner tests correctly failed before implementation. A later source-parity regression needed a 1e−9 tolerance for floating-point summation (`547.2` vs `547.199999…`); the final run passed.

Evidence: `browser-measurements.json`, `spinner-browser.json`, corresponding browser scripts and native task logs. Source docs: `poc/src/experiments/micro-20/README.md`.

Image viewing is unavailable. These are source/numeric/browser interaction checks, not subjective pixel/motion approval. A new Remotion image render was not run for this refinement; shared sampler serialization and actual browser angle parity were verified.
