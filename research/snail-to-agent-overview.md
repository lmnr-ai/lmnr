# Snail → multi-agent overview: three approaches

Investigation only; no application changes. 2026-09-15.

## Verified target
Figma desktop design context and metadata for [overview 4724:10384](https://www.figma.com/design/VEbMxK1qMXzqjAVJaSQMPs/Laminar-personal?node-id=4724-10384) and [hero tile 4724:10520](https://www.figma.com/design/VEbMxK1qMXzqjAVJaSQMPs/Laminar-personal?node-id=4724-10520):
- Composition1280×720;15×9 tiles,148×148 each,2px gaps.
- Grid origin(-484,-314), total2248×1348; intentionally cropped, not fitted entirely into frame.
- Hero column7,row4 (zero based), tile top-left(566,286), center(640,360).
- Dots diameter12; hero white,134 other dots #3d3d3d. Tile background #1a1a1a, gutter backdrop #141414.
- Existing Snail circle diameter120 at(640,360). Hence overview initial zoom10 exactly matches circle size; tile1480×1480 starts at(-100,-380), beyond every viewport edge.

## Recommendation: explicit deterministic frame-matched bridge
Keep Snail and a new AgentOverview scene separate. Fade old path AND grid; independently scale spinner to0; whiten Metal circle and remove its grain. Normalize background to #1a1a1a. This produces a plain white120px circle on a flat background.

Overview at scale10 produces exactly that same frame: centered white120px circle, hero tile covers screen, neighbors offscreen. Switch scene ownership during a short identical-frame plateau. Then zoom overview10→1 about(640,360). No DOM measurements, layout history, or screenshot assets needed. The overview remains independently editable for later choreography, using stable tile identities.

Preserve live DialKit clip.current bindings; static sample consumes same clips for browser query-time and Remotion. Suggested clips: worldFade, spinnerExit, agentWhiten, handoff, overviewZoom. Shared pure bridge geometry should enforce match conditions, not depend on component mount history. Keep user-requested production TODO unchanged; no Motion conversion is requested now.

Estimate +330–450 / -20–40 lines including tests. Idiomatic green; bug risk yellow. Risk: background, residual grain, or duplicate hero ownership can expose the seam.

## Alternative: persistent camera/world
A single hero and overview world exist continuously. Map old route coordinates into overview world at1/10 scale; camera starts10× and follows route, then zooms to1× around final hero. Route transform equivalence can be proved: world(R)=H+(R-E)/10; camera center=world(P); screen=C+s*(world(R)-world(P)). At s10, this equals C+R-P, exactly current Snail projection.

No scene swap. Supports overlapping fade/zoom and future camera travel naturally. However changes current Scene painter order, screen-space agent ownership, old-grid coverage and nested masking. Overview can still be factored as a module, but coordinate integration reaches deeper into proven Snail code.

Estimate +250–330 / -20–40 lines including tests. Idiomatic green; bug risk yellow. Risk: nested transforms, mask scope, and oversized background layers can hide or misalign the overview.

## Alternative: native shared-layout / FLIP
Use Motion layoutId on matching DOM hero/frame elements, allowing runtime measurement and automatic transform transitions. This matches the intuitive frame-matching workflow for interactive UI, but is not the same as deterministic endpoint matching.

[Motion official layout docs](https://motion.dev/docs/react-layout-animations) state SVG components are not supported by layout animations; directly animating SVG attributes is recommended. Shared layout animation starts from React layout changes and prior matching elements. [Remotion official animation docs](https://www.remotion.dev/docs/animating-properties) require frame-driven animation and warn non-frame-driven transitions can flicker. Therefore using native layoutId directly here needs DOM conversion and a separately proven deterministic playback adapter; random-access parity is not established. A DOM wrapper alone does not prove correct SVG child matching or out-of-order render behavior.

Estimate +350–550 / -40–100 lines including integration/tests, very uncertain because an export adapter may be required. Idiomatic orange for this stack; bug risk red. Risk: layout history and unsupported SVG matching can diverge between scrubbing and exported frames.

[Remotion transitions](https://www.remotion.dev/docs/transitions/) orchestrate scenes; they do not automatically match arbitrary Figma/DOM elements. They are optional orchestration, not a solution to anchor geometry.

## Timing and validation
Current travel completes15.93s;20-second composition leaves4.07s. Suggested cleanup16–16.5, matching plateau around16.5, zoom16.6–18.9, final hold. Later storytelling may require explicitly extending composition; do not silently compress current route. Frame599 is final frame, not600.

Check geometry endpoints, initial frame-covering tile bounds, unique hero ownership, all135 tile locations, random/reverse seeks, both palettes, and browser/Remotion screenshot parity. Matched bridge additionally requires pixel comparison on either side of handoff. Typechecks cannot establish visual correctness.

Evidence: two read-only repository investigations completed; both baseline geometry suite and typecheck passed per their reports. Research child's artifact delivery failed, so parent independently read fetched official docs and synthesized this note. No proposed transition has been implemented or visually validated.
