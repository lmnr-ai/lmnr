# Animation 20 — Issue clusters 3

## Composition and source boundaries

Animation 20 owns its adapters. Animation 14/15/16/17 source files are unchanged.

- **0.40–3.40s:** Animation 16's Bash row, actual connector/tool SVGs, trailing Thinking block, 48px labels, 24px/30px terminal typography, and paper-door inset/translation. The owned 78-line fictional trace report retains its 2400px paper, 2040px descent and highlighted lines 68–70. The blue agent is 120px, with Animation 13's blue gradient and 94.2px loader (78.5% ratio).
- **3.45–5.45s:** One SVG world remains mounted. Its camera starts at the existing Bash pose; the report, local grid, tool blocks and agent recede together. Animation 17's 4800px macro grid and camera/content-scale law are adapted to a final 78px pitch. Gray-dot/report scale remains `10 ** -zoom`: 120px becomes 12px. The blue hero independently follows `(54 / 120) ** zoom`: 120px becomes 54px continuously, without enlarging gray dots or report content. Macro strokes are non-scaling. As in 17, the local grid fades and the trace collapses late in the pullback, inside the real hero-cell clip.
- **5.45–5.65s:** Settled, centered dot-grid stage before discovery.
- **5.65–7.55s:** The gray circle paints behind the grid. A warning starts only after the *visible radius* reaches its cell center. Its scale finishes after a `78 × (.25 + radialSoftness)` band. No independent discovery radius/track or forced endpoint exists.
- **7.55–8.00s:** The blue agent scales about local `(0,0)`, remaining at screen `(640,360)`. Its own cell's gray dot returns in its place.
- **8.00–8.45s:** Final readiness/hold gate (historical persisted `analysisLayout` key). It never translates or recenters anything.
- **8.45s onward:** Reuse of unmodified `sampleMicro15` and `Micro15Scene`: gather, arrival-dependent merges, coding-agent window, message send, command/query typing, and subtitles. An owned world-only wrapper maps source column `c` to `c-1`; screen-space coding-agent UI and subtitles do not move. Appearance is instant because warnings are already dispersed. Source15's authored subtitle progress is retained; Micro20's own screen-pinned narration supplies the requested copy with the same transition-driven fades in preview, inspection and export.

### Detection marker and zoom target

The first detected issue pops Animation 16's red triangle beside the blue agent (86.797×80.604px before pullback). Its scale follows the first third of the existing `bashHighlight` progress, so retiming, endpoints and instant clips remain authoritative without introducing another stored track. It shrinks away over the first quarter of `analysisZoomOut` progress. It is separate from the later circle-discovered grid warnings.

The marker is trace-plane decoration, not a camera target. The blue agent remains at the camera world's local origin throughout pullback and settles at screen `(640,360)`. No warning-focused camera move is added; source Animation 16 is unchanged.

### The real center cell and exact seam

`geometry.ts` owns a centered **17 × 12 grid (204 cells)**, pitch 78, border origin `(-23.5,-68.5)`. Its column 8, row 5 content center is exactly `(640,360)`. Stable source cell ID **99** (source column 9, row 5) maps to this hero cell and is not a warning start. World coordinates are derived from `(mappedCellCenter(cell) - HERO_CENTER) × 4800 / 78`. There is no phantom center or unrelated missing dot.

Source column `c` maps to owned column `c-1`, preserving rows and every warning ID/trajectory. The single constant postlude world translation is **`(-39.5,+2.5)`**. Source column 0 ground/grid cells are omitted, but its warning starts/ends survive off-canvas at column -1, without clamping or wrapping. `issue` retains source15 state; `issueWorld` exposes the mapped warning, ground and cluster screen geometry plus the exact translation consumed by the renderer. No late camera/layout displacement exists.

The same `WorldGrid` renders identical 204 border paths during scan and postlude. The wrapper hides source14's original 18-column reference grid and background, filters ground dots to 204 and translates only its world container. Both the source SVG and source container allow overflow, so newly visible right-edge content is not clipped before translation; the outer composition clips to the actual 1280×720 viewport. Cluster covers, borders and large/small warnings all receive the same translation. Source14/15 files remain untouched; coding-agent and subtitle siblings retain their screen-space transforms.

## Narration

The owned subtitle overlay stays outside the SVG camera and hides source15's subtitle copy only within Micro20. Default caption lifetimes (effective playback seconds):

- **0–3.45:** “our agent built to analyze traces”
- **3.45–5.45:** “at scale” (tied to the resolved zoom-out bar)
- **5.45–7.25:** “It finds deep issues,”
- **7.25–9.39:** “In every trace,”
- **9.39–11.77:** “and clusters them into high-level patterns,”
- **11.77–15.45:** “Ready for you or your coding agent.”

`subtitleFlow` and `subtitleDetection` are additional editable prelude bars. “at scale” uses `analysisZoomOut` directly, including its easing/endpoints; detection narration waits for the zoom to finish if it is retimed. The every-trace line continues from the detection bar's end through the existing `issues.subtitleIssues` bar, without fading in again at the world handoff. Patterns and Ready use their existing Issues bars; the later caption wins their small overlap. Authored easing/spring progress and endpoints control fades. All caption timing uses the same resolved dependency ripple as the artwork and export. The original Animation 15 wording is untouched.

## Stage-specific spinner tuning

The Analysis panel exposes five magnitude dials, in **turns per second** (0–10):

- `spinnerEntrySpeed`: clockwise while entering.
- `spinnerStopSpeed`: clockwise through stopping/opening; ends when those clips finish.
- `spinnerDescentSpeed`: **counterclockwise** while sliding down the report.
- `spinnerZoomSpeed`: clockwise during zoom-out.
- `spinnerAnalysisSpeed`: clockwise after zoom, through the agent's scale-out.

Defaults are 1.9 for each. Zero pauses that stage. `spinner.ts` integrates angular velocity across resolved clip boundaries, so direction/speed changes never reset phase and reverse seeking is deterministic. Descent wins overlaps with stopping/opening; stopping wins overlap with entry. Gaps hold, and rotation stops after agent exit. Editing an earlier stage changes the accumulated angle later, but not a later stage's speed.

Before registration, `micro20:stage-spinner-speeds-v1` copies each saved state's old `spinnerSpeed` into any missing stage fields. Existing stage fields (including zero), active selection, preset/base independence and metadata are preserved. The full original record is backed up at `micro20:stage-spinner-speeds-original-v1`. The marker is set even on fresh storage; later imports are not rewritten. Explicit legacy export props still normalize through the old magnitude when stage fields are absent. The legacy master dial is no longer displayed.

## Authoring and the single clock

There is one `useDialTimeline`, with prelude rows and a collapsible **Issues** group in global seconds. All rows are **earliest starts**, not promises to interrupt an unfinished prerequisite. The toolbar reports the effective handoff and chapter ripple.

The tuned defaults are owned by `PRELUDE_TIMING` and `ISSUE_GLOBAL_DEFAULTS` in `timeline.ts`. All prelude bars use easing `[.45,0,.55,1]`; subtitle bars retain spring bounce `.2`. Bash opening starts at 1.45s and descent at 1.60s for 1.69s. The requested circle bar starts at 5.25s for 1.90s; dependencies resolve it to 5.65s. Exit/hold dependencies resolve the handoff to **8.45s**, so issue bars retain their authored 7.5s origin while playback ripples them by **+0.95s**. Saved authoring states/presets and explicit imports are not migrated or overwritten; Reset uses the new defaults. DialKit and the production handoff comment remain in place.

- Prelude dependencies preserve full clip durations after retiming. Zoom waits for Bash; scan waits for the completed zoom plus a 0.2s resolved-grid hold; fade/exit/readiness gate wait for scan; the gate waits for hero exit.
- The numeric **Earliest handoff** control is a time marker, not an animation with ignored endpoints. Effective handoff is the later of that value and the complete prelude endpoint.
- Issue bars use the fixed authored origin **7.5s**. A bar at 8.65 means issue-local 1.15. If effective handoff moves to 10s, all issue sampling receives an explicit +2.5s chapter ripple. Bars still show authored earliest starts; the toolbar shows this offset. Individual source15 merge/send dependencies remain intact.
- Source15's timing-only rows expose only timing, not unsupported progress/curve controls. Subtitle and prelude rows retain full `from`, `to`, `transition` and current-value semantics through a shared evaluator. Raw spring overshoot is retained in samples; bounded geometry uses the same clamp in every render path. Authored zero durations are true steps, despite DialKit's visual minimum duration.
- Canonical timeline defaults never depend on the selected preset or edited curve; Reset restores the authored defaults. The scoped compatibility adapter described below preserves independent current/base/preset curves across registration and duration edits. Initial owned values are read for first-frame duration calculation. No effect seeks another transport. Paused bar edits, forward/reverse seeks, live playback, `?time=<finite nonnegative seconds>` and Remotion all use the same serialized authored state. Invalid `?time` values do not activate inspection. Valid inspection pauses the transport.
- `timelineDuration` on Analysis is the **minimum total composition duration**. The Issues duration is the **minimum local postlude duration**. Actual duration is the maximum of these holds and dependency-resolved arrivals/merges, after-send typing, subtitle and window endpoints. Preview/export use the same function. One endpoint frame is included: defaults are **465 frames at 30fps**, with the final exited-window pose at frame 464.

### Incomplete authoring states

The remapped scan's full-arrival minimum radius is **878.799px** (default radius **900px**), including all 47 starts and the default 35.1px arrival band. Reducing radius below the required threshold deliberately holds analysis, rather than inventing warnings that the circle never reached. The editor displays the needed radius outside the artwork. The export has the same finite held pose, with no error overlay. Similarly, final zoom/collapse/fade/exit/readiness-gate endpoints below 1 cannot make a discontinuous handoff; the editor explains unfinished prelude endpoints. With an incomplete zoom, discovery and the required radius use actual rendered screen distances, not final-layout distances. Partial-zoom discovery never substitutes settled-grid distances for the actual rendered distances.

This is deliberate authoring validation, not a completed issue sequence. Before export, sample the final frame and verify `phase === 'issues'`; a held analysis sample includes `validation`. Restoring a sufficient radius resumes the deterministic composition without rewriting saved values.

## Persistence and export props

### One-time obsolete radius-default migration

Before registration, the independent `micro20:odd-grid-radius-migration-v1` migration changes only numeric radius **820 → 900** in the owned controls' current/base/preset values. Other radii and all other fields/metadata remain intact. The original serialized control record is backed up verbatim at `micro20:odd-grid-radius-original-v1`; this backup is never overwritten. The marker is written even for fresh storage, so explicit later imports (including 820) always win. Custom insufficient radii still hold honestly; values are not silently clamped upward. The existing single-clock migration and version-pinned authoring adapter are unchanged.

### DialKit 1.4.3 compatibility boundary

`authoring.ts` is an explicitly version-pinned, micro20-owned compatibility adapter. DialKit's public registration/update methods reconcile **and persist** every base/preset before returning, rejecting curves of another kind from the config default. Public setters cannot repair that safely: a destructive write would already have occurred. Making the current curve the default also corrupts inactive presets and Reset; that former adapter has been removed.

For the exact v2 timeline ID and known valid transition paths only, the adapter temporarily retains each state's own copied curve and mode in `reconcileValues`. It restores copied base modes before `persistPanel` writes (DialKit otherwise replaces them with current modes). Owned mode edits go through the public value setter so they belong to the active preset or base. Canonical defaults and other fields retain native behavior. No original serialized objects are mutated and there is no repair-after-write window.

The two temporary private method replacements are synchronous, reentrant and restored in `finally`, including on thrown subscribers. Nested foreign registrations explicitly use native methods; no other panel gains altered reconciliation. A version/shape guard runs before migration or registration. An incompatible library disables the editor with a visible error instead of risking saved state. Updating DialKit requires revalidating this seam, not merely changing the version string. Actual-store tests cover both active kinds, inactive presets, distinct base values/modes, first registration, every persistence write, reload, switches, Reset, repeated registration, nested foreign/owned callbacks and exceptions.


The single-clock timeline is `micro-animation-20-main-timeline-v2`. `persistence.ts` performs one load-only copy from the two owned v1 timelines **only if v2 does not exist**. It prefixes issue keys, translates issue `at` values by 7.5, preserves endpoints/transitions/base values/presets, and copies the old handoff time/base values/presets to the new marker panel. To restore an old combined preset's handoff, choose its matching `Handoff · …` companion preset as well; the marker is now a separate control rather than an inert timeline clip. Old keys remain untouched as backups; an independent `micro20:single-clock-migration-v1` marker records the conversion. Existing v2 imports always win. No source experiment migration runs here. Obsolete independent warning-radius controls are not exposed, but their original records remain in the untouched v1 backup.

`MicroAnimation20Props` includes analysis controls, full `preludeTiming`, full native-local `issueTiming`, `issueControls`, and earliest `issueStart`. `serializeTimeline` is the App's tested extraction seam. Pass its output plus controls to Remotion; do not export only `at`/`duration` or replace subtitle curves with linear interpolation.

## Validation

From `poc`:

- `pnpm exec tsx --test src/experiments/micro-20/*.test.ts`
- `pnpm typecheck`

Odd-grid task evidence is under `artifacts/tmp/micro20-odd-grid/`: before snapshots; four initially failing geometry regressions; migration tests; all micro20/source-suite/typecheck/build logs; and the reproducible `browser-test.mjs` with actual CTM measurements from 12 native-size App poses. It asserts 54×54 hero versus 12px gray dots, 204 static grid paths across 7.25/7.5 and the late postlude, all 47 mapped warnings, cluster covers/borders/large warnings, unchanged UI coordinates, both viewport edges (including newly exposed rightmost dots/warnings), current-default migration and later-import preservation. Browser SVG float comparisons use 0.001px tolerance; static grid path/matrix signatures are exactly equal. No new Remotion image-render comparison was run for this refinement.

Prior rebuild evidence remains under `artifacts/tmp/micro20-rebuild/` (single-clock/preset adapter, source16 report and source17 camera).

The implementation worker cannot view images in this environment. DOM/CTM measurements and pixel-difference metrics are evidence of geometry and parity, **not subjective visual approval**. Human/reviewer inspection of captured motion poses remains required.

## Twinkling closing pullback

After the complete postlude and agent exit, standalone appends a two-second
centered `1 → .4` pullback under “Unlock the insights hiding in millions of agent
traces”. `micro20PostludeDurationFrames` preserves the original endpoint for
compositions; `micro20DurationFrames` also includes the closing segment and its
exact endpoint frame (defaults: outro 15.5–17.5s, 526 total frames at 30fps).

`outro.ts` seeds Animation9's actual four-neighbor sparkle automaton from the
terminal issue pose on a 49×30 overscan field. The real source15 renderer retains
the merged covers and large warnings; free cells spontaneously change state and
cycle the six Animation9 assets. No renderer reconstruction or cut crossfade is
used. At onset, even invisible overscan SVGs and identity CSS transforms are
omitted to retain Chromium's exact original rasterization. Overscan enters only
as the camera pulls back. Subtitles stay outside that camera.

Ultimate3 opts out of the standalone tail and invokes this same sampler in its
existing first Conclusion slot. Retiming source20 still waits for the entire
postlude; blocked handoffs retain their diagnostic source state instead of
inventing a terminal pose. `outro.test.ts` covers this boundary, retiming,
random/reverse seeks, export-frame sampling, and the unchanged Ultimate3 schedule.
