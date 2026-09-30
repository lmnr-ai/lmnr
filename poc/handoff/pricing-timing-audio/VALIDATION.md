# Merge validation

## Source preservation

- Three-way merge base: `44187c8fb` (the local cut's last synchronized upstream).
- Upstream target: `0755714a720dc167457a7dd4dfbeb67fb9873bd9` (editable-v11).
- Local source and authoring settings were backed up before merging. Evidence
  is in the local checkout's `artifacts/tmp/ultimate3-pricing-timing-merge/`.
- 33 standalone Animation23/24 files are byte-identical to the local source.
- 1056 pre-existing upstream `poc` files are byte-identical, including every
  approved audio asset. Existing-file changes are limited to the intended
  renderer integration, registration, master appearance, docs and tests.
- Conflicts were limited to `voiceover-cut.ts` and a cloud-authoring test.
  Resolved by applying `withFlowComparison` to final v11 defaults (not frozen
  v9/v10 defaults) while keeping every upstream cadence migration. The cloud
  test covers both cadence and the added comparison.
- Local pricing tests' v9 absolute times were shifted to the v11 clock;
  production comparison clips remain unchanged in Flow-native time.
- Local preview files were synchronized to the combined result after verifying
  no local files had changed since backup. Browser authoring migrated to v11,
  comparison v2, and preserved paper texture on.
- The obsolete one-time local preview loader and local artifacts were not
  published. The unrelated `signals-status-column.png` remains untouched.

## Automated checks

- TypeScript typecheck: passed.
- Regression suite: **295 passed, 0 failed** (Ultimate3, Issues20/22,
  Animations23/24, Flow21, and zoom-grid color).
- Vite production build: passed, using `publicDir:false` and temporary output.
- Diff whitespace check: passed.

`pricing-cadence-merge.test.ts` proves:

1. Merged normalized defaults equal the frozen upstream v11 settings with
   only the comparison added; duration is exactly 2085 frames.
2. Every one of the 2085 exported frame samples retains upstream animation
   clocks and narration, with only the new comparison sample added.
3. Pricing starts with n13 at 37.30s and returns at 40.07–41.33s, preserving the
   native engine camera endpoint and holding through spoken “per dollar.”
4. Saved v9 comparison edits and the paper setting survive cadence migration;
   reloads are idempotent and explicit imports remain literal.

The first post-merge run exposed three stale absolute-time assertions in the
local comparison tests. They were corrected for the 6.43s upstream shift;
no production timing was changed to make those assertions pass.

## Installed-Chrome browser checks

All three browser suites passed against the synchronized combined source on
port 5180, using isolated sessions:

- `micro-18/flow-comparison.browser.test.sh`: all 756 dots, settled 37/756 cards,
  dense grid color/width, renderer boundaries, migrated named presets, native
  timing bars, masks, custom from/to values, and preset round-trips. The first
  cut has zero changed pixels; the return boundaries have only 3 circle-edge
  samples and 14 one-channel rounding samples respectively, within the existing
  strict bounds. Intelligence, settled engine, and Issues comparison-on/off
  rasters match exactly (zero changed pixels). Reference-labeled v9 probe times
  are translated 6.43s earlier by the test for v11.
- `micro-24/baseline.browser.test.sh`: retained opening, insert and ending,
  exact empty-grid boundary rasters, native timing/from/to edits, and 6px dock
  clearance.
- `micro-23/return-grid.browser.test.sh`: native defaults, zoom-dependent grid
  color, offscreen ending, and identical opening/ending rasters.

These are numerical/DOM/raster checks, not a new subjective listening or visual
approval. No complete MP4 was re-rendered for this handoff.

## Extracted reference

`ffprobe` confirms AAC-only M4A, stereo, 48 kHz, 73.322667s. Source and extracted
AAC packet hashes match exactly. The Downloads and repository M4A copies have
the same SHA-256. Original MP4, approved soundtrack, and narration are unchanged.

This is a sound-reference handoff, not a new sound-design mix or full MP4 render.
