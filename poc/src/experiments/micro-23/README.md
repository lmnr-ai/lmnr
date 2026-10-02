# Animation 23 - Traces per dollar

Editor: `http://localhost:5180/?experiment=micro-23`.
Still inspection: append `&time=8` (finite, nonnegative seconds). Inspection pauses the transport and hides authoring panels. No audio is created by this animation.

## Current pricing: 888 vs 38

User-approved displayed values for traces below 100k, using Flow-1 at 4k output:
**888 Flow traces/$ versus 38 GPT traces/$**. The conservative **20x** headline,
intelligence scores, approved narration, and all timeline timings stay unchanged.

The field contains exactly **888 dots: 38 orange and 850 blue**: **20 full rows
of 43, followed by 28 left-aligned dots**. There are no side extensions. The
Flow number's right edge meets the last occupied cell at x=780, not the full
field's right edge. All dots stay on 20px cell centers. Bounds are (220,150)
through (1080,570), with labels above at y=110 and below at y=570. Ultimate3
compensates its shared-world grid origin by whole cells; the odd-width full
rows center at x=650, the nearest compatible grid-cell center.

These are approved presentation values, not a claim of unrounded source precision.
See `poc/handoff/pricing-888/README.md` for the calculation and user decision.

## Authoring

One native DialKit transport, ten separately editable bars:

| Track | Default start | Duration | Behavior |
| --- | ---: | ---: | --- |
| Grid Shrink | .07 | .78 | Grid cells shrink from 60px to 20px, on a 1280×720 canvas |
| Orange Dots | .5 | .19 | Group entrance; overlaps the shrink; dot duration is clamped to this short bar |
| Blue Dots | 1.48 | 1.04 | Independent row-major stagger, including its final tail |
| Gpt Label | .51 | .2 | Introducing Flow-1's masked downward slide |
| Flow Label | 2.47 | .24 | Independent masked downward slide |
| Gpt Number | .5 | .21 | Downward card fold and simultaneous count to 38 |
| Flow Number | 2.47 | .24 | Downward card fold and simultaneous count to 888 |
| Headline Reveal | .41 | .42 | Introducing Flow-1 masked downward fold for the central headline |
| Headline Slide Out | 1.58 | .19 | Independent downward card exit during the blue-dot entrance |
| Return to Grid | 3.2 | .76 | Zoom back to the opening cell size while moving the camera 32 rows downward |

All ten supplied start/duration/from/to/easing settings are preserved exactly in `MICRO_23_TIMELINE`, which is spread into `useDialTimeline`. **Return to Grid** remains independently editable and settles at 3.96s. After the completed comparison holds for .49s, the camera zooms toward empty space below the content; everything exits above the viewport without fading. The endpoint restores the opening grid size and phase exactly (60px by default), then holds for 2s. Whole-row camera travel also preserves the opening phase with custom cell sizes. As with other independent bars, retime the return if you move earlier content later.

The headline reads **“20x more traces analyzed per dollar”**. Its stacking order is **grid → headline → dots → model labels/numbers**. The **fixed, overflow-hidden container** appears instantly at the reveal bar start, with stationary **0.5px top/left borders**. Only the **background-colored text card** slides downward inside it: in from above, then out through the bottom. Neither card nor border fades; the border stays put after the card leaves. A background-colored under-stroke prevents the fixed border from double-painting the grid edge.

Reveal and slide-out each have their own timeline bar; moving either does not retime any dots. The exit is **not automatically linked** to the blue entrance. Its legacy persisted key remains `headlineFadeOut` so existing edits, exports and presets survive; the visible bar label is **Headline Slide Out** (scoped native metadata update, not a store monkeypatch).

**Dot Duration**, under **Animation 23 · Appearance**, controls one dot's scale-in duration in **seconds** (default .25s, range .01–2s). It applies to both colors independently of their different total group durations. Its effective duration is capped at the corresponding group bar's duration: shortening a total bar never leaves a tail outside it. If one dot's duration fills the whole bar, that group enters simultaneously. The default group clocks are linear; deliberately changing a group's easing also warps its stagger clock. Individual dots use cubic ease-out scale and opacity.

Other appearance dials: starting/ending cell size, dot diameter, final hold, grid/orange/blue colors. The existing **Grid Color** dial now defaults to **`#1f1f1f` for the dense, zoomed-out grid**. Grid and matching frame strokes interpolate from the original `#333333` during shrink, then return to `#333333` during the final zoom-in. A one-time, panel-scoped migration updates retained old working defaults (`#333333` / `#292929`) so the actual dial and preview pick up the new color. Other controls, custom colors and saved presets remain untouched; no new dial is added. An explicitly selected saved preset retains its own color. Both numbers now use the headline's **fixed, overflow-hidden frame and shared 0.5px top/left border renderer**. The frame appears instantly at its number bar start; the dark number card folds down from above without horizontal motion or opacity fading. Count-up shares the same native eased progress. The obsolete Number Slide distance dial is removed; legacy `numberSlide` render props remain accepted but no longer change the artwork. The masked name-label reveals are unchanged. Timelines and appearance use separate Animation 23 persistence IDs. The existing version-pinned compatibility adapter preserves custom curves and preset modes for this panel's ten transition paths only.

## Historical reference and initial follow-up alignment

Figma file `VEbMxK1qMXzqjAVJaSQMPs`:
- Opening `4859:18349`: background `#1a1a1a`, centered 60px `#333` grid.
- Ending `4859:18710`: 42×18 field at (220,170), 20px cells, 6px dots; orange `#fb9d0e`, blue `#a8caff`; JetBrains Mono Regular 28px / 40px.
- Headline `4859:21797` / child `4859:23349`: (340,290), 600×140px, centered 48px / 63px JetBrains Mono Regular text, dark background and matching top/left strokes. It shares the existing world transform and the exact `SlideReveal` implementation, not a separate CSS animation.
- Follow-up `4859:20229` and sibling `4859:20232`: 180px-wide name containers with top/left strokes and left padding. The implementation uses an exact two-cell/40px height rather than the Figma auto-layout's 41px including its old 1px border.

User-requested differences from the initial reference:
- **0.5px SVG grid stroke**, with overscan beyond every canvas edge. Lines do not end at the colored field.
- Name containers unfold with matching 0.5px top/left strokes; their right/bottom boundaries meet existing grid lines.
- Both lower containers start at **y=530**, directly against the field's bottom edge, not halfway through a row at y=540.
- Upper number container starts at **x=880**, ending on the x=980 grid boundary.

Reference detail: the Figma artwork contains **38 orange / 718 blue** markers, while its printed values are **37 / 756**. That was the original reference. The current user-approved update above replaces it with 38 orange / 850 blue and printed values 38 / 888.

## Rendering and verification

`MicroAnimation23` is registered at 1280×720, 30fps. It shares `createMicro23Sampler` and `Micro23Scene` with the editor. **Export render settings** downloads `{values, controls}` suitable for Remotion's `--props`; native flattened from/to, easing, spring and timing values are retained. Duration follows the last resolved clip plus the hold, including the final settled frame (default **180 frames / 6 seconds**, including the return zoom and final hold).

No wall-clock animation, CSS transitions or random ordering. Reverse/arbitrary seeks use only the selected time and settings. Grid, markers and label containers share a centered world scale if their tracks are deliberately overlapped.

Historical initial browser verification (before the 888/38 update), installed Chrome / isolated `agent-browser` session on port 5180:
- Opening, shrink midpoint, orange-only, blue entrance, endpoint, and reverse seeks sampled successfully.
- Actual 756 circles, correct endpoint captions, font loaded; no console errors.
- Edited 8-second blue bar extended total duration; duration and custom orange easing survived reload.
- Revised 0.5px grid and name strokes confirmed in DOM and raster samples. Background/orange/blue center pixels matched reference RGB values; half-covered grid pixels measured (39,39,39).
- Both name containers occupy 180×40px at (220,130)/(220,530); lower number shares y=530.
- Setting Dot Duration to .6s gave both first dots radius ≈2.625px halfway through their .6s entrances, and final blue radius 3px exactly at its group endpoint.
- Side panel stays outside the artwork; artwork stays above the timeline dock; still inspection has no authoring-panel overlay.
- Snapshot-relative existing-source changes are only the picker, tuning route, and Remotion registration. Existing dirty Ultimate 3/Animation 21/22 work was not modified.

`bash poc/src/experiments/micro-23/number-slide.browser.test.sh` now verifies both numbers fold downward inside fixed 0.5px frames, with synchronized counts, no horizontal motion/fading, instant frame visibility, retimes, and reverse seeks. It replaces the obsolete horizontal-slide/visible-overflow regression. It uses a separate browser session and the existing server (override `MICRO23_EDITOR_URL` if needed).

`bash poc/src/experiments/micro-23/headline.browser.test.sh` checks the ten native bars, headline content/geometry/layer order, instant stationary 0.5px frame, clipped background-card entrance/exit without fading, independent exit/blue retimes, and reverse seeks.

`bash poc/src/experiments/micro-23/return-grid.browser.test.sh` verifies fresh native defaults and ending geometry, then compares 1280×720 opening/ending artwork rasters for exact equality. It leaves screenshots in a uniquely owned temporary directory. Card/frame browser tests freeze the camera to isolate local motion; the return test exercises the actual default camera.

The initial implementation received an independent source-only review with no findings. Follow-up stroke/alignment/seconds-dial changes were parent-verified as above. Automated checks before the latest timing-default update: **19 tests passed, zero failures**, including new sampling/geometry/seconds-dial/preset tests and existing Flow-1/authoring regressions. Typecheck passed. Code-only Vite production build passed (764 modules; existing large-chunk warning, public media not copied). Integration diff whitespace check passed. The earlier failures were test-fixture mistakes (single-item staggering and an omitted explicit timeline duration); both are corrected. Latest timing-default update: typecheck and all **12 Animation 23 tests passed**, including exact tuned values, 2000px number-slide acceptance, preset retention, and whole-frame rounding with/without the final hold. Fresh-browser native values matched all seven supplied timings. No fresh video export or subjective image approval is claimed.
