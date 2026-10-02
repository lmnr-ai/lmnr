# Animation 18 — Ultimate 3

## Current edition: Cost cloud lead-in

The active `?experiment=micro-18` edition is **2212 frames / 73.733333s**
(frame-rounded). Its chapter starts are **0 / 17.56 / 28.43 / 43.622 / 62.93s**:
exactly **1.5s** moved from the end of Ultimate2 into the beginning of Cost.
Cost is now **10.87s** instead of 9.37s. Every existing Cost action and its native
trim moved +1.5s in chapter seconds, leaving their global beats unchanged at
that boundary transfer. The subsequently approved Main defaults below tune the
cloud exit and yellow zip; all later chapters, all 23 narration clips and the
linger soundtrack remain unchanged.

In **Main**, scroll to **Clouds Slide Out**, directly below **Ultimate2 Cloud
Enter**. Drag this real native bar left to reveal Cost during the new covered
lead-in; the earliest start is **17.56s**. Its approved default is **17.61s**
(Cost-local **0.05s**), duration **2.41s**, easing **[0.45, 0, 0.55, 1]**. **16 Cost → Cloud Sweep** edits the
same `cost.timing.cloudSweep` clip in chapter seconds, not a second cloud layer.
Both panels support from/to progress, easing and physics springs, and at least
50ms authored duration. Bar duration and easing duration are independent native
DialKit controls; edit the curve duration too when shortening an easing sweep.
Paused live preview consumes raw `clip.current`; reverse seeking, Settings JSON
and export use the same endpoints/curve. Dormant `clouds.slideIn/partialRecede/
recede` metadata is still dormant; no frame-pinned renderer was restored.

**Main → Yellow Agent Zip** is one range bar spanning all three yellow passes:
default **18.76–20.96s globally**, or **1.20–3.40s within Cost** (duration **2.20s**). Moving it shifts
all three passes equally; resizing scales their durations and gaps together.
It does not retime speech, camera moves, warnings or other actions. This is a
range handle over the existing clips, not another motion clock: its envelope
stays linear, and individual motion curves remain editable in **16 Cost →
Cheap Leg One Right / Cheap Leg Two Left / Cheap Leg Three Right**.

The shared defaults live in `current-cut.ts`, not hardcoded overrides in the
Main hook. `main-timing-request.fixture.json` records all **31 requested clips**;
`main-timing-defaults.test.ts` and `main-timing-defaults.browser.test.sh` verify
their starts, durations, easing and 0→1 endpoints. Existing saved edits/imports
remain literal. The native `clip.current` bindings and production handoff note
remain in place; no Motion conversion has been performed.

The active loader applies this boundary migration only to generated
**19.06s / 9.37s** allocations with at least 1.5s of Ultimate2 handoff hold.
Custom clip starts translate without replacing controls, durations or curves.
Manually changed boundaries or insufficient holds are left alone and marked;
explicit imports stay literal, and subsequent edits never re-migrate.
`ultimate3-before-cost-lead-in-v1` preserves the prior settings JSON;
`costLeadInVersion: 1` records completion/skip/import. Historical source13/20
cuts, standalone16/17, saved presets and the handoff snapshots remain available.

A follow-up loader repair handles the observed interrupted hot-reload state:
the new boundary was saved while old Cost clip starts remained. It uses this
browser's `ultimate3-before-cost-lead-in-v1` backup and requires matching shifted
boundaries plus an old handoff hold (or the entire stale action group). Only
clips still matching that backup are shifted; already-shifted clips and custom
cloud reveals are preserved. `ultimate3-before-cost-timing-recovery-v1` saves
the pre-repair state, and `costTimingRecoveryVersion: 1` makes it one-time.
Explicit imports opt out. Reload the editor to run this storage-only repair.

Checks: `cost-timing-recovery.test.ts`, `cost-zip-authoring.test.ts`,
`bash src/experiments/micro-18/cost-zip.browser.test.sh` (actual group drag,
resize, reload, stale panel recovery, reverse poses and Settings JSON export),
`cost-cloud-authoring.test.ts`, `current-cut.test.ts`, and
`bash src/experiments/micro-18/cost-cloud.browser.test.sh` (from `poc`, with the
existing localhost:5180 server). The browser regression uses an isolated
installed-Chrome session, cold legacy Main/Cost stores, real pointer drag/resize,
custom spring presets, reverse seeking and exact native cloud canvas parity.
Follow-up validation: **253 tests**, typecheck and code-only production build
passed. Both Cost browser suites passed, including recovery from the observed
partial migration, all +1.5s local offsets, preserved presets, actual zip drag/
resize, reverse three-rung poses versus export, and reload/JSON persistence.
Audio source files and narration placements were not changed by this repair.

The following sections describe earlier handoffs and historical defaults.

## Animation 19 picker entry: updated Flow comparison

The default `?experiment=micro-18` narrated cut now uses Animation 23's shared
traces-per-dollar artwork, as in Animation 24, without retiming the narration:

- **37.01–37.28s:** intelligence title folds down; its original beads, labels,
  scores, narration-cued flow-1 ball and string move left together.
- **37.30–40.07s:** zoom out, headline/dots/labels and 37/756 cards. The spoken
  “while analyzing 20 times more traces per dollar” is at **37.30–40.05s**.
- **40.07–41.33s:** one continuous camera zoom/descent from the comparison into
  “Flow-1 powers Signals.” No stop on an empty grid and no second camera move.
  Engine activation/cover beats keep their original times.

Only this dense insert uses `#1f1f1f` / .5px; both ends match the original
`#333333` / 1px shared-world grid. The insert retains its authored Flow-relative
clips; upstream editable-v11 moves the whole Flow chapter 6.43s earlier. All
chapter boundaries, 2085-frame duration, voice clips, bed, master gain and other
chapters retain the upstream v11 values.

`flow.comparison` v2 stores twelve independent native clips in the existing Flow
detail timeline. The return clip owns both zoom and descent, ending at the old
engine camera's settled pose. Its old separate camera bar is hidden, while that
camera's timing metadata is retained for the soundtrack and historical cuts. Their actual `clip.current`, starts, durations, endpoints and
transitions drive the shared renderer; inspection and Remotion use the same
sample. The replaced graph bars no longer appear, while their old timing data
is retained for historical settings/audio metadata. Existing Flow panel IDs and
named presets are not deleted. Stored source21 settings get a load-only,
idempotent addition fitted to their own existing comparison/engine window.
A load-only v1→v2 migration extends only an unedited default return clip;
custom return timings and other clips survive. Named presets are retained.
Explicit historical JSON imports keep their literal version (or the old graph
with `comparison:false`), and `?cut=original` remains unchanged. The return's
native progress drives both layers under a common camera and grid; no opacity
crossfade or duplicate engine animation is used.

Checks: `flow-comparison.test.ts` and `flow-comparison.browser.test.sh` cover
fixed timing, native edits, migration/presets, reverse sampling and grid cuts.

## Latest synced cut and master paper texture

Merged with `sandbox/signals-launch-video` at `0755714a7`: approved A/subtle
editable-v11 voiceover, brisk opening/Cost cadence, **2085 frames**, chapter starts
**0 / 19.06 / 28.43 / 43.622 / 62.93s**. See
[brisk-cadence handoff](../../../handoff/voiceover-brisk-cadence/README.md) and
[combined pricing/audio handoff](../../../handoff/pricing-timing-audio/README.md).
The older sections below retain the history of previous cuts.

**Ultimate 3 · Master appearance → Paper Texture** is a persistent DialKit
toggle available in Main and every detail view. It is stored as the optional
boolean `paperTexture` in Settings JSON and the same Remotion `settings` prop.
Missing/false means off, preserving historical presets. The current preview can
be enabled independently without changing narration, timings, or master gain.

The exact Figma `image 233` (`4859:7955`, inside `4740:28387`) is saved at
`public/micro-18/paper-texture.png`: **Multiply, opacity 1, object-fit cover,
90° clockwise rotation**, 891×1320 before rotation. Placement `(1300,-32)` with
top-left rotation origin produces bounds **(-20,-32,1320,891)** on the authored
1280×720 canvas. No extra tint, filter, fade, tiling, or strength adjustment.
Source hash and settings: `public/micro-18/paper-texture.source.json`.

The single layer is the final child of the isolated/clipped shared frame,
above clouds and captions but outside every camera transform; toolbar/DialKit
are untouched. Remotion waits for image decoding during export; the plain React
preview uses the same image and styles without requiring a Remotion context.

Five fixed-order chapters reuse the read-only Animation 17, 16, Introducing Flow-1, and the full Animation 20 Issue clusters 3 scene renderer, followed by the supplied Figma Laminar logo.

- **Main timeline:** exactly five contiguous chapter allocations. Expanding an editable endpoint ripples later starts; extra allocation is a terminal hold. Playback is never sped up.
- **Detail timelines:** the Main/chapter selector sits with the authoring chrome above the timeline dock (not across the top of the preview). Only the selected timeline is mounted, and switching preserves the global frame.
- **Live preview sizing:** authored 1280×720 geometry is wrapped once and uniformly contained using a numeric `ResizeObserver` scale. It responds to width, height, aspect-ratio, maximize/restore, and timeline-dock changes while preserving 6px dock clearance.
- **Ultimate 2 → Cost:** Ultimate 2 removes fourteen stream blocks immediately before the lifting blue Thinking block while preserving the agent's 660px/s velocity. Its remaining clips shift forward by 4.182s. Ultimate 2 then ends when its editable cloud entry finishes, holds for 0.5s, and cuts directly to Cost. One canonical cloud canvas preserves the settled 27px pose across the boundary and continuously adopts Cost's geometry during its normal exit.
- **Cost:** native playback is clipped at 15s by default (two seconds removed from the source tail), then freezes at that actual sampled endpoint if its allocation is extended.
- **Cost → Flow:** Cost and all of Introducing Flow-1 occupy one persistent world under one camera and one fixed 100-unit grid. Cost native coordinates use the fixed map `world = native × 5/6 + (16.25, -50.4167)`, derived from its actual SVG stroke centers; the Cost camera starts at scale 1.2, preserving the source's 120px screen pitch. Flow is fixed 12 cells right and 48 cells below at `(1200, 4800)`, reducing bridge horizontal travel to 3.1px while preserving grid alignment. The tunable 1.2s bridge changes only the shared camera from the exact trimmed Cost endpoint to Flow's opening pose while Flow stays at native time zero. There are no chapter panels, per-chapter clips, grid replacement, phase morph, or independently translated worlds.
- **Flow:** after entry, the same camera composes Animation 13's camera as `shared translation = native translation - native scale × (1200, 4800)`, so its zoom and benchmark/analysis/engine pans continue unchanged. The opening percentage/name cards enter top-to-bottom with a tunable **Number row stagger** (`0.05s` default, `0–0.25s`). The canonical grid and both content transforms remain mounted. Flow native playback is clipped at 11.8s by default (1.5 seconds removed from its source tail), making the default Flow chapter 1.2 + 11.8 = 13s. Cost smoke and Flow clouds remain screen-oriented effects; Cost's budget stays world-attached above its smoke.
- **Flow → Issue clusters 3:** the editable `leadIn` (1.2s default) scrolls the same world downward from Flow’s real trimmed endpoint. The source20 opening is placed below it on the 100-unit lattice. Its local 120px grid uses the same 5/6 native mapping as Cost; a continuous half-screen-pixel border inset matches SVG stroke centers exactly at arrival. The native source20 clock begins only after arrival. Its full dependency-resolved prelude, 17-column analysis grid, 54px settled hero, reverse descent loader, warning marker, postlude, and all six current narration segments are reused without changing standalone artwork. Subtitles are screen-pinned outside the shared camera.
- **Issues authoring:** entry, `prelude_*`, and `postlude_*` bars share the existing selected detail transport. Bars are earliest starts in chapter seconds; source20 dependencies ripple intact clips and the conclusion. Prelude stage spinner controls, radius/softness, earliest handoff, and postlude travel/hold controls are exposed. Native source20 starts at 43.718s by default; its internal postlude handoff resolves at native 8.45s.
- **Conclusion:** Conclusion is exactly 2s `TODO: ` followed by 2s logo. Its bottom captions are tied directly to those editable card stages: “Unlock the insights hiding in millions of agent traces” and then “With Laminar”; the latter stays visible with the terminal logo hold.
- **Inspection:** `?experiment=micro-18&time=<finite nonnegative seconds>` pauses authoring and samples normalized persisted Ultimate 3 settings deterministically. It never reads standalone animation presets.
- **Serialization:** **Settings JSON** exports/applies the complete normalized composition settings. Remotion's `settings` prop uses the same shape. Browser persistence is namespaced under `micro-animation-18-*`; obsolete generated 22/17/14.5 allocations and the prior 18.7-second Ultimate 2 defaults migrate while other authored allocations are retained. The generated 1s + 1s conclusion receives a one-time storage-load migration to 2s + 2s; normalization and explicit JSON imports remain authoritative.
- **Final score:** rendered video uses one of the offline scores in `score/` ("Tactile Glass", "Nocturne", "Signal", "Aria", "Arabesque", its Acoustic Chill variant, acoustic cuts, Nocturne duet/digital cuts, "Phase" and "Tintinnabuli"; original music + foley, -14 LUFS); see `score/README.md`.
- **Original animation audio (`?experiment=micro-18&cut=original`):** Arabesque Acoustic with the existing softness-8 whooshes, now a corrected default-timed **typing-free bed** plus one live lubed-linear thock scheduler following current source20 settings. No full legacy engine plays in parallel. See `AUDIO_EXPORT.md` for original-cut provenance, gain calibration, export parity, and the frozen-bed retiming limitation. The default `?experiment=micro-18` is the editable v4 voiceover cut: the restored chapter-driven clouds, 22 global narration clips over a voice-free keyboard-bearing v4 bed, and a code-only edited-audio exporter. See `../../../handoff/voiceover-retime/LOCAL_PREVIEW.md`.
- **Legacy animation effects engine (not active in this viewer):** the embedded Ultimate 2 `streamRun` timing drives the shared Animation 10 tick/puff soundtrack and its cadence continues through a 3-second linear fade on a dedicated family bus. **Puff offset** shifts the first puff relative to `streamRun` while preserving the 0.7s puff period. Ultimate 2's `cloudEnter` drives “clouds whoosh in”; Cost's following `cloudSweep` drives “clouds whoosh out”. Each whoosh inherits its visual clip's resolved duration. During Flow, the same tick recipe becomes a ratchet for the authored `barsGrow` clip; **Flow ratchet volume** controls its level and **Flow ratchet interval** controls its cadence, with smaller intervals producing faster ticks. Each staggered opening `modelRows` card triggers the supplied piano recipe at its visual start; **Number drop volume** controls this layer independently, **Number drop base** selects its pitch (`G5` default), and changing **Number row stagger** retimes all six notes. The exact Soundboard `error-chime.wav` plays when Ultimate 2's warning triangle enters and again when Cost's bash warning triangle enters; **Error tone volume** controls both cues independently; the mastered WAV is calibrated so its percentage remains intuitive at the unusually high `6.98` production master gain. The mix also has independent tick, puff, cloud, ratchet, and number-drop controls, no drone, transport-safe pause/seek behavior, and stream fading does not alter these independent effects.

Default duration is **63.218181818 seconds / 1897 frames at 30fps** (63.233333s frame-rounded export):
`14.518181818 + 15 + (1.2 + 11.8) + (1.2 + 15.5) + 4`.
Conclusion now begins at **59.218181818s**. Issue lead-in is 36 frames and source20 is all 465 frames; conclusion placeholder and logo are 60 frames each.

## Cloud rollback to the pre-midnight behavior

The frame-pinned three-bar cloud rewrite is reverted. The reference is `449f3d67`, the last local commit before September 28 midnight. Ultimate2 uses its native cloud entry, Cost inherits its settled pose and uses its native sweep, and Flow's separate cloud plane arrives/leaves with the shared world. The Flow21 graph, camera, timings, extended opening, narration, audio, and other changes remain intact.

The Main timeline no longer exposes the replacement `slideIn` / `partialRecede` / `recede` bars or X/Y extent dials. Existing `clouds` JSON is retained only for round-trip compatibility; it cannot affect rendering. Native chapter cloud timing and Flow's Y-offset remain active. No storage wipe is needed.

## Current v4 Flow chapter and sound handoff

The default editable voiceover cut now stitches **Animation 21 — Introducing flow-1 2** into the existing Cost → Flow → Issues shared world. Its native `beadsEntry` bar is **2.88–4.28s**, with one **Bead stagger seconds** dial (0.11s default); `graphSpread` is **5.41–6.95s**. Both axes still enter at 6.1s, and exit before the 8.64s engine descent. The graph has no intermediate camera pan; its displaced 240px is folded into engine descent, preserving the final engine framing. The Flow dot remains at x=1150/y=270, Sol stays gray, Y labels step by 5%, and X labels by 100 traces/$. Captions use the new “20x more traces per dollar” wording.

In the current narrated source21/source22 cut, the five peers stagger first (Opus, Sonnet, Sol, Gemini, Luna). Flow's dot, `74.1%`, and name stay hidden until narration phrase `n12` (currently 34.07s). The on-screen caption now says **“Matching GPT-6-Sol in intelligence…”**; the existing narration audio and phrase windows are unchanged. Opus 5 displays **84.8**, Sonnet 5 **77.3**. Flow's settled gap above Sol matches Gemini's gap above Luna (**36 graph pixels**), leaving clearance between the 32px-high labels. Its upward entry uses the same bead travel duration/easing, starting no earlier than the resolved peer bar end. The cue is converted from global narration time to Flow-native time, so narration/chapter edits and reverse seeks stay consistent. The line and subsequent chart spread are unchanged; standalone/historical previews retain their original six-bead sequence.

- `flow.sourceVersion: 21` selects the shared Animation21 renderer/evaluator. `flow.timing21` holds its complete authored endpoints and curves. `flow.controls.beadStaggerSeconds` is copied in Settings JSON and honored by both preview and Remotion.
- `flow.timing` remains the legacy source13 schedule for historical cuts and existing sound consumers. Original-cut defaults are unchanged. Explicit historical JSON imports are stamped `sourceVersion: 13`; they will not be silently upgraded on their next storage load.
- Only an **unversioned current-v4 editor snapshot** upgrades on load. It retains allocations, trims, other chapters, narration, cloud settings, original flow timing, entry and appearance choices; the new chapter starts from the approved Animation21 defaults. Source21 detail panels use separate IDs so old DialKit snapshots cannot overwrite the new bars. `clip.current` and the production TODO remain in place.
- The current v4 cut remains **2085 frames / 69.49133333333333s** before frame rounding. Existing allocations/trims and all source media are unchanged. Export the current Settings JSON and pass it as the `settings` prop to `MicroAnimation18`; its shared sampler/scene honors source21. The composition's legacy default props intentionally remain the original cut.
- **Sound-agent handoff:** no sound, frozen bed, music, speech recording, phrase timing, score cue or audio export was retuned/re-rendered here. Audio can be out of alignment with the new Flow visuals, and the old recorded comparison wording is intentionally not rewritten. Use `flow.timing21` plus the chapter's global start and `flow.entrySlide` offset for the next sound pass; do not infer new cue timing from retained `flow.timing`.

The older detail descriptions above describe the preserved original cut where they mention source13 rows, benchmark percentages or the intermediate camera pan.

## Issue clusters 3 compatibility

`issues.sourceVersion: 20` identifies the new chapter without renaming existing postlude `timing` / `controls`. New `preludeTiming`, `preludeControls`, and `issueStart` belong to source20. `migrateIssues3Storage` runs once on editor load (`micro-animation-18-issues3-migration-v1`), backs up exact original settings/timeline/controls under `micro-animation-18-issues3-original-v1`, retains the old panel, and maps current/base/inactive presets to the distinct `micro-animation-18-issues3-timeline-v1` panel. Old bars are explicitly prefixed `postlude_`, never interpreted as prelude timing. Custom old timing/controls are retained and the original chapter is recoverable as `issues.legacySource15`. Generated .5s entry and generated source15 defaults adopt the new defaults. Explicit subsequent settings imports bypass migration; existing new-panel records are never migrated over.

The version-pinned source20 DialKit transition-preservation shim explicitly opts in only this new Issues panel in addition to its original source20 panel. All other panels use native reconciliation. Native source20 `from` / `to` / transition semantics are preserved; the camera bridge normalizes its endpoint values to its two physical poses, with instant arrival for a zero-duration bar.

`sampleUltimate3().issues.source20` is the rendering authority. The retained `.sample` is a Micro15-shaped **compatibility-only postlude sample**; before handoff it contains a non-visible opening pose. Event consumers must check `.postludeActive` and use `issuePostludeOffset(settings)` (entry + resolved prelude), also exposed as `.postludeOffset`. Live typing, coding-window effects, and score cues now use this offset. Score pop sampling checks the visible postlude instead of the compatibility pose; blocked Arabesque handoffs emit no postlude-only effects. No whirr was added. Saved control records are unchanged; the active mastered bed uses fixed input calibration before the existing linear master (see `AUDIO_EXPORT.md`).

**Historical exports:** the new Arabesque bed uses the corrected score cues. Older score WAVs and frozen exports are untouched and must not be assumed synchronized with the longer composition. The separately owned Silk consumer is unchanged.

### Continuing issue field in Conclusion

The first Conclusion stage now reuses micro20's terminal issue world and shared
Animation9-based twinkling pullback, instead of the TODO card. Its persisted
`placeholder` key remains unchanged; its authored offset, duration, endpoints,
and transition drive the camera, and the existing logo cut remains authoritative.
The default pullback runs 59.218181818–61.218181818s; “With Laminar” and the total
63.218181818s / 1897-frame schedule are unchanged. Source20's standalone closing
tail is explicitly excluded from the Issues allocation, so it is not counted
twice. No audio or earlier artwork/timing is changed.
