# Ultimate3: brisk cadence + new pricing picture + sound reference

## Start here

Work on **`sandbox/signals-launch-video`**. This handoff combines upstream
**`0755714a720dc167457a7dd4dfbeb67fb9873bd9` / editable-v11** with the latest
local Ultimate3 pricing animation, standalone Animations 23/24, and master
paper-texture toggle. It does **not** replace the approved soundtrack.

The next agent's task is to inspect/listen to **[`turbopuffer.m4a`](turbopuffer.m4a)**
and try to recreate its sound-design character for this cut. No listening-based
analysis or new sound design has been performed as part of this transfer.

**Use [`preview-settings.json`](preview-settings.json)** for the current combined
picture. This is the complete migrated browser authoring snapshot: v11 timing,
`flow.comparison.version: 2`, and the user's paper texture **on**. Apply it through
Settings JSON, or pass it as the `settings` property to Remotion `MicroAnimation18`.
Do not use the older upstream handoff JSON as the final picture props: those
historical snapshots intentionally lack the new comparison. Likewise, the
composition's legacy default props remain the original cut.

## Timing and pricing merge contract

- 1280×720, 30fps; **2085 frames / 69.5s exported** (69.48s authored).
- Chapter starts: **0 / 19.06 / 28.43 / 43.622 / 62.93s**.
- All upstream v11 opening/Cost timing, narration placements, source trims and
  `/audio/voiceover/editable-v11/` audio assets are retained.
- The comparison retains the exact local **Flow-native** clips. Upstream moved
  the whole Flow chapter 6.43s earlier than the local v9 cut; the insert follows
  that shift, rather than restoring old global timestamps.

| Global time | Picture |
| --- | --- |
| 37.01–37.28s | Intelligence beads, labels, ball and string exit left; title folds down. |
| 37.30–40.07s | Animation 23's dense-grid comparison, headline, 37/756 number cards. |
| 37.30–40.05s | Narration n13: “while analyzing 20 times more traces per dollar.” |
| 40.07–41.33s | Single continuous camera zoom/descent into the Signals engine. |

`micro-18/flow-comparison.ts`, `Scene.tsx`, `sample.ts`, `authoring.ts`, and
`voiceover-cut.ts` own the Ultimate3 integration. It uses the shared Micro23
picture inside the existing source21 Flow timeline; it does not replace the
whole chapter with the longer standalone Animation24 timeline.

Standalone `micro-23` and `micro-24` retain their local files and independent
presets. The 38 orange / 718 blue artwork markers and printed values 37 / 756
are intentional. The dense insert alone uses #1f1f1f / .5px grid lines; original
opening/engine grids remain #333333 / 1px. The comparison return owns the single
camera move; old camera timing remains metadata for audio/history.

Load-only migrations preserve tuned timings, explicit imports/opt-out,
`clip.current`, named presets and historical cuts. The production DialKit TODO
is retained. No global-cloud rewrite, new audio owner, or wall-clock animation
was introduced.

## Reference audio provenance

- Newest downloaded video at extraction: `turbopuffer.mp4`.
- Original unchanged: `/Users/kolbeyang/Downloads/turbopuffer.mp4`.
- Extracted copy: `/Users/kolbeyang/Downloads/turbopuffer.m4a`.
- Committed copy: this folder's `turbopuffer.m4a`.
- AAC, 48 kHz, stereo, **73.322667 seconds**, **1,187,978 bytes**.
- Stream-copied without re-encoding, normalization, gain, timing, pitch or speed changes.
- M4A SHA-256: `ebd558972b39a8df3c822cb601b81c1ab0a98d77d8a6a0cd07e1dd399cdd9b18`.
- Source and extracted AAC payload hashes match:
  `cbe7d2d8ddc91cb7d56970d621f73901ce9df498485287ae87331c0b17a85e09`.

## Next sound-design pass

Read the current score/audio ownership before implementing:

- `poc/handoff/voiceover-brisk-cadence/README.md`
- `poc/src/experiments/micro-18/score/README.md`
- `poc/src/experiments/micro-18/AUDIO_EXPORT.md`
- `poc/src/experiments/micro-18/voiceover-phrases.ts`
- `poc/src/experiments/micro-18/offline-audio.ts`
- `poc/scripts/export-ultimate3-audio.ts`

Analyze reference timestamps/timbres/envelopes first. Recreate editable sound
layers and adapt them to these visual beats; the 73.32s reference and 69.5s video
do not share a timeline. Deliver a separate auditionable candidate and A/B
comparison. Preserve approved A/subtle narration, all original media, current
authoring settings and the existing default mix until the user selects a new
one. Verify intelligibility, clipping and preview/export timing. Do not change
the pricing picture or undo the upstream cadence to match the reference audio.

See `VALIDATION.md` for merge and verification evidence.
