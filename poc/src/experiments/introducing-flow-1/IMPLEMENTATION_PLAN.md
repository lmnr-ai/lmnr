# Animation 13 - Introducing Flow-1 — continuous-world implementation and review contract

## Latest user direction (supersedes conflicting opening criteria below)
- Use Animation 9 clouds unchanged: no artificial sliding gray background to force coverage.
- Reveal into the title framing, hold briefly, then slide clouds out before continuing.
- Most dots are gray; reuse Animation 9's neighbor-aware selection and defaults. Selected dots share one blue gradient, rather than every dot being blue.
- Separate camera zoom/descent, each reveal/count/bar component, module fill and loop clocks into independently editable tracks.
- Move the benchmark below the title in the same world; camera descent removes Flow-1 naturally with no title fade/exit. Clouds stay screen-pinned.
- Bar/name panels hug their contents. The right heading keeps exact `(580,480,600,180)` geometry with top/left borders matching the seamless grid.
- Number count-ups happen visibly after their masked entrances. Fine engine connector is centered at its native 196×98px export, not stretched across the 240px band; module text starts `#1a1a1a`.
- Current timings and validation are in README.md; old endpoint times below are historical.

## Goal and authority
Replace the existing six-raster crossfade prototype with actual independently animated geometry, text, grid, clouds, and engine layers. Match the six Figma endpoints closely, but keep one continuous surface between them. The user's detailed choreography, below, supersedes the previous inferred crossfades. No screenshot image may be used as an implementation scene. Keep existing Micro 7/12 edits untouched, no commits/pushes in this task.

Implementation/review agents: explicitly `azure-foundry/gpt-5.6-sol`. Because the current checkout contains uncommitted work and the new experiment is untracked, use one source writer at a time. Parallelize independent measurement/algorithm investigations first, and independent spec/render testing afterward. Do not fake parallelism with multiple writers in this checkout.

## Evidence packet
- Figma file: `VEbMxK1qMXzqjAVJaSQMPs`, Laminar-personal.
- Ordered frames: `4773:10504`, `4773:6390`, `4773:10843`, `4773:9034`, `4773:8257`, `4773:8666`.
- Model-list identity: frame-2 node `4773:6730`, frame-3 node `4773:11183`.
- Engine spinner node: `4773:8643`. User supplied this same node for moving lines; inspect the actual lower-right sibling in frame 5 rather than duplicating the spinner asset.
- `reference/4773-*.design.txt`: freshly captured high-fidelity Figma design-context responses, with styles, asset slots and generated coordinates. Read these, not only screenshots.
- `reference/4773-*.metadata.txt`: hierarchical bounding-box measurements.
- `reference/assets.json`: remote-to-local asset mapping; downloaded assets are in `poc/public/introducing-flow-1/assets/`.
- Visual targets: `poc/out/introducing-flow-1-figma/*.png` (1024×576 captures); design coordinates are 1280×720. Do not confuse screenshot pixels with design pixels.
- Existing implementations to inspect: `micro-09/{Scene,DitherClouds,geometry,sparkle,sample,timeline}` and `micro-12/{World,geometry,sample,timeline,App}`. Reuse shader, assets, deterministic neighbor-aware twinkling and timeline conventions; do not alter existing animations' output.
- Original Figma resource skill was unavailable on the desktop server; the parent loaded official figma/mcp-server-guide guidance before get_design_context. Downloaded assets, rather than transient localhost URLs, must be used in runtime code.

## Non-negotiable scene structure
1. A single world grid, with stable integer cell identities and a continuous camera transform. Define world positions in grid units; derive screen coordinates from shared camera state, not independent per-scene offsets.
2. Screen-space cloud overlay at the front. Clouds cover the pre-roll completely then descend out of view, revealing frame 1. Reuse Signals' actual dither rendering and move geometry inside the fixed canvas, not a clipped canvas element.
3. World content: opening Flow-1 title/dots, shared benchmark rows/labels, then open engine and cover. Camera changes must affect the grid and its attached content together. Do not dissolve between full-screen scenes.
4. `SlideReveal` or equivalent: fixed-size, instantaneously mounted, overflow-hidden wrapper; inner background + text content translated from negative full height to zero. The wrapper itself must not move, resize, fade in, or grow as a substitute. Text and its backing slide as one layer.
5. Pure sampling seam: authored clip progress + clip-relative elapsed seconds -> camera, count values, bar widths, twinkle states, engine angles/line offsets. Live DialKit and Remotion must share it. No Date.now, unseeded Math.random, CSS keyframes or accumulated requestAnimationFrame state.

## Phase choreography

### Pre-roll -> frame 1: cloud reveal and blue field
- Begin with screen covered as in the Signals reveal; choose a short editable hold and cloud descent.
- Render Flow-1 and lattice using frame-1 measured geometry, fonts, blue gradient and content.
- Dots twinkle with neighbor-off encouragement inspired by Signals sparkle. Preserve stable seeds/cell coordinates across zoom; animate visibility/scale, never change dot hue or alternate colors.
- Favor a deterministic finite-history/precomputed event field over render-order mutation. Separate global dot-shrink progress from twinkle envelope.

### Frame 1 -> frame 2: scale shared grid and reveal benchmarks
- Measure frame-1 vs frame-2 cell pitch and origin from design data. Solve the camera scale/translation from those correspondences; grid lines remain continuous throughout.
- Every blue dot scales to zero by frame 2, even those currently twinkled off; no remnant circles.
- Reveal each frame-2 text/background block with the seam-slide wrapper. Stagger only as an editable motion choice, never change endpoints.
- Count ONLY Flow-1 percentage up to 81.9%; all other frame-2 percentages are fixed values that slide in.
- Preserve actual text and placements from design: Opus-5 89.0%, Sonnet-5 83.5%, Flow-1 81.9%, GPT-5.6 Sol 81.0%, GPT-5.6 Luna 80.0%, Gemini-3.8 Flash 69.9%.

### Frame 2 -> frame 3: same rows, camera moves down
- Keep six model-name row identities and their world coordinates. The list's design screen y changes from 300 to 60: at this scale the corresponding camera delta is +240px. Do not animate list y separately to imitate the camera.
- New numbers replace old numbers via the same masked downward slide. Old numbers may slide out downward inside the same number mask, with no bleed or double text at the settled endpoint.
- New target numbers count from zero: [6, 9, 238, 6, 116, 11]. Round/clamp and land exactly.
- Bars grow from zero to measured widths [10, 27, 638, 10, 307, 40] design px (or corresponding world units), not a guessed common normalization.
- Required row structure: flex row -> fixed number container; sibling flex row with zero left padding -> bar, gap, model name. Gap is 12px at frame 2 and 20px at frame 3. Preserve any 1px border inset reflected in Figma; never apply left padding to simulate the bar.
- Names stay present; their horizontal changes follow bar width/gap, not remounting or crossfade.
- Reveal bottom-right 'Traces analyzed per dollar' with the same seam-slide. Use all exact labels in reference data, not an inferred replacement.

### Frame 3 -> frame 4: descend to the open engine
- Continue moving camera down so surface moves up. User estimates ~1.5 screen heights: use grid-aligned world placement and measured endpoint to set the actual travel; document chosen distance as tunable art direction rather than claiming it is measured.
- Keep grid identity/origin coherent during travel; overscan so no grid edge or sudden appearance is visible.
- Engine is an agent with hood raised: reconstruct measured circle/ring, Flow-1 module, connectors, upper-right spinner and lower-right line window from separate layers/assets. Grid alignment is a requirement, including during camera movement.
- Engine and open cover should live in world space ahead of the camera, not be conjured by a scene swap. Review intermediate travel frames for accidental overlap with departing benchmark text.

### Frame 4 -> frame 5: fill and start engine
- Camera/geometry stays fixed. Only Flow-1 box background crossfades gray -> exact blue gradient; text color may follow reference if necessary.
- Upper-right spinner begins spinning about its own center as activation starts.
- Lower-right line strip moves upward continuously inside its fixed clip. Tile enough copies of a periodic strip beyond both clip edges and use modulo cycle displacement. No blank gap at wrap, no finite list running out, no visible reset/jump.
- Engine time derives from the actual activation clip start (including live retiming), and motion continues through cover descent and the final hold.

### Frame 5 -> frame 6: close cover
- Cover is already above the open agent; move it downward into the measured final slot. Do not introduce a new unrelated full-screen blue circle.
- Fade its background gray -> final blue/gradient while descending. Keep its loader tied to cover position and spin it about the correct center.
- Final camera and covered-agent geometry match frame 6. Continue spinner indefinitely for any extended final hold; freezing global clip progress must not inadvertently stop elapsed-time motion during playback.

## Implementation sequence
1. Parallel read-only investigations: (A) extract Figma coordinates/assets, camera endpoints and text styles; (B) inspect reusable Signals/cloud/sparkle code and deterministic timing/loop design. Return concrete proposals and hazards, not code writes.
2. Single writer implements measured constants/types, pure state/timeline, actual scene modules, clouds/twinkle, benchmarks, engine/cover, live controls and Remotion wiring. Small focused modules such as `GridWorld`, `BenchmarkRows`, `Engine`, `SlideReveal`, `CloudReveal` are appropriate if they simplify ownership.
3. Replace prototype assets as runtime scenes; retain source references only as review fixtures. Document all inferred timings and camera travel in README with colored review-risk bullets and REVIEW comments at fragile seams.
4. Run focused timing/geometry tests and typecheck. Render a six-keyframe strip plus transition-boundary samples using Remotion `--gl=angle`. Record canonical hold timestamps in an exported keyframe schedule/README so reviewers don't guess.
5. Parallel independent testing: source/spec + deterministic invariants; browser/render + visual endpoints/intermediate frames. Reviewers must inspect actual current files and artifacts, not accept implementer prose as proof.
6. Single writer fixes concrete review failures, then both relevant checks re-run. Up to two fix/review rounds; unresolved failures must be disclosed, never mislabeled pristine.

## Review checklist / acceptance matrix

### A. Source and geometry checks
- [ ] No `<Img>`/CSS background using a full-frame reference screenshot as the animation.
- [ ] One shared camera and grid with stable cell/world identities; measured pitch/origin at all six endpoints.
- [ ] Frame-2/3 model names are the same mounted/world-positioned rows; camera produces the 240px screen rise.
- [ ] Grid covers viewport and overscan throughout zoom and ~1.5-screen descent; no lines pop, reset origin or double.
- [ ] Engine components, ring, cover and benchmark row heights align to intended grid lines, with intentional Figma offsets documented.
- [ ] Each text background and text slide inside an instant fixed mask; no overflow, premature appearance or partially clipped settled text.
- [ ] Required flex structure, zero inner left padding, 12px -> 20px gap, exact bar endpoint lengths.
- [ ] Only Flow-1 percentage counts in frame 2; all six numbers count in frame 3, clamp and land exactly.
- [ ] All text matches source, uses local JetBrains Mono with fonts ready before render, no fallback-font layout shift.

### B. Motion/determinism checks
- [ ] Frame zero is fully cloud-covered, including all corners; descent reveals rather than raises clouds.
- [ ] Blue gradient remains invariant while dots twinkle; neighbor inhibition/encouragement demonstrated, not just independent random flicker.
- [ ] All dots scale to zero before frame 2; stable IDs prevent reseeding on camera move.
- [ ] Camera interpolates continuously with intended ease-in-out; no full-scene alpha dissolve or content teleports.
- [ ] Frame 4 and 5 camera/grid/object placement identical; fill and engine activation are the changes.
- [ ] Engine spinner frozen before activation, rotates afterward without jumping when timeline is retimed.
- [ ] Line loop tested immediately before/after multiple wrap points and at long elapsed time; upward motion, same coverage, bounded node count, no blanks.
- [ ] Cover starts raised and descends into final slot; its loader moves with it and continues spinning.
- [ ] Preview and export sampled at identical times agree; seek backward/forward gives identical state. No wall-clock or order-dependent state.
- [ ] Edit activation/transition times in live DialKit and verify motion clocks follow edited starts, not constants.
- [ ] Final duration includes all clips and final hold; Remotion Root frame count tracks duration.

### C. Render and browser checks
- [ ] Tests and `pnpm --dir poc typecheck` pass; `git diff --check` clean.
- [ ] Render every settled endpoint and compare against corresponding Figma screenshot at same size (1280x720 normalized). Check positions, dimensions, fonts, colors, gradients, borders, assets and z-order.
- [ ] Keep comparison/overlay images and numeric landmark deviations. Target <=2 design px at measured key landmarks; document any unavoidable anti-aliasing/dither differences rather than hiding them in a large global tolerance.
- [ ] Inspect at least 25/50/75% of each transition, plus cloud start, number exchange, line wraps and cover crossing. A clean endpoint does not prove motion.
- [ ] Local browser at `http://localhost:5180/?experiment=introducing-flow-1` loads with no console/page errors or missing assets. Use installed agent-browser + Chrome; do not install Playwright. Respect existing Herdr frontend server, do not start a duplicate server.
- [ ] Remotion `--gl=angle` output renders without WebGL/delayRender stalls. Repeated same-time renders deterministic (allow only explicitly established graphics-device effects).
- [ ] No external localhost Figma asset URLs in runtime code. Downloaded file dimensions and slots match reference.
- [ ] Existing Micro 9/12 targeted tests still pass; no unrelated source edits or commits.

## Review-risk decisions
- 🟢 One camera/world transform instead of independent screen layouts; user explicitly requested it.
- 🟢 Raster frames become comparison fixtures only; actual scene built from Figma layers/assets.
- 🟡 Duration, stagger and camera easing are editorial defaults exposed in DialKit; old 7.6s timing is not a requirement.
- 🟡 Engine world distance is chosen to preserve grid alignment and approximate 1.5-screen travel while matching endpoint.
- 🟡 User reused the spinner node URL for lines; lower-right line asset from full frame is authoritative.
- 🟠 Full visual acceptance requires actual render comparisons. If an agent/model cannot view screenshots it must say so, use measurements, and must not claim it visually verified the sequence.
