# Current Ultimate3: Glide · minimal (linger), matched yellow spinner

The user selected PR #2466's **Glide · minimal (linger)** as the current local
Ultimate3 cut. Imported PR head: `5ce52252371062f97711006b033b0a70ae6b6b03`.
All PR source/assets were imported without conflicts against the previously
synchronized launch-video base `9d7f4c72d`.

## Current picture and soundtrack

**Later authoring update:** this folder's JSON remains the frozen PR-derived
base. The live `current-cut.ts` defaults additionally include the 1.5s Cost
lead-in, **Clouds Slide Out at 17.61s / 2.41s**, and **Yellow Agent Zip at
18.76s / 2.20s**. Export **Settings JSON from the live editor** for the newly
tuned picture; importing this folder's frozen JSON intentionally restores its
earlier timing. Narration and soundtrack are unchanged.

- Picture: this folder's **`settings.json`**.
- Soundtrack: **`glide-minimal-linger`** / “Glide · minimal (linger)”.
- 1280×720, 30fps, **2212 frames / 73.7333s**.
- Paper texture **off**; new traces-per-dollar comparison retained.
- Longer ending/logo hold from the PR, so the music reaches the last frame.
- Approved A/subtle narration and 6.98 master unchanged. No +3dB brand-line boost.
- The original and other Glide soundtracks, assets, and historical settings remain available.

This profile is now the **shared default** for `?experiment=micro-18` on port
5180, not just a saved setting in the automated browser. Refresh an existing
browser to upgrade recognized old generated spinner controls and logo timing.
`current-cut.ts` backs up prior settings and applies a versioned, idempotent
migration; custom controls, custom endings, historical cuts and new explicit
JSON imports remain literal. The old generated Arabesque mix selection upgrades
to linger once, preserving gain, presets and base values; other selections stay.

For an exact manual load, import `settings.json` through Settings JSON and select
**Glide · minimal (linger)** in **Ultimate 3 · Voiceover mix**. Soundtrack selection
remains separate from picture JSON. Frozen historical defaults are not changed.

## Yellow spinner

The yellow agent already used the exact white-agent 89×89 arc path from
`public/micro-07/spinner.svg`; the mismatch was its 1.5px black stroke versus
the white agent's 3px stroke. The current profile sets
`cost.controls.cheapSpinnerStrokeWidth` to **3**, retaining its existing path,
center, black color and rotation timing. Purple/white/blue artwork is unchanged.
The control remains editable. Historical defaults and imported snapshots are
preserved; only recognizable old generated editor settings upgrade on load.

Relative to the PR's `turbopuffer-sound/minimal-settings.json`, that single
stroke-width value is the only picture/settings difference. The PR snapshot
is preserved unchanged so prior render and audio provenance remain reproducible.

## Export

From `poc`, export audio with:

`pnpm exec tsx scripts/export-ultimate3-editable-vo.ts --settings handoff/glide-linger-current/settings.json --bed glide-minimal-linger --out <new-output.wav>`

Render Remotion `MicroAnimation18` with this same settings JSON as its `settings`
prop. Either pass the exported WAV as `audioSrc`, or render silent picture and
mux that WAV afterward. Do not use the old 2085-frame export or omit `--bed`.

The frozen linger bed is imported unchanged and still uses its approved phrase
sources. Changing only spinner width does not change any audio timing. The
bed manifest records 2212 frames / 3539200 samples at 48kHz, matching this cut.

`glide-linger-current.test.ts` covers actual rendered yellow arcs/strokes,
reverse sampling, the single-setting change versus the PR, frame count, paper
state, preserved narration, and the linger PCM checksum/length.
