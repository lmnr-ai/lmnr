# Animation 15 — ISSUE CLUSTERS 2

Preview: http://localhost:5180/?experiment=micro-15

A separate direct-travel variation of Animation 14. The original remains available, and the selector lists animations in numeric order.

## Behavior

- `starting-positions.ts` freezes all 47 warning starting cells from the current Animation 14 iteration: seed 209, 90 steps, probability 0.62, small-cluster delay 0.60. Future random-walk changes cannot silently change these starts.
- Appearance uses the same seeded per-cell dot-out/triangle-in intro.
- Each warning cell selects its own deterministic random **start time** within the Travel Start window. The window's left edge is the minimum start, and its right edge is the maximum start. Flight duration is independent of this window: flights continue beyond its right edge.
- The travel hash uses a different salt from appearance, so travel does not simply repeat appearance order. Moving/resizing the window preserves each cell's sampled fraction; changing Travel Duration does not reroll starts. A zero-width window synchronizes all starts.
- Every triangle travels directly to its reference cell, with smoothstep easing. There are no swaps, intermediate waypoints, or moving dots.
- During travel, all 216 dots sit at fixed grid centers underneath the triangles. Leaving reveals the dot underneath; passing over another dot does not move or remove it. During the intro only, the starting dot scales away as its warning appears.
- A group's merge cannot start before its actual last random arrival and last appearance completion. Once settled, its triangles never move again.
- The singleton remains a small warning. Final geometry and local SVG assets are shared with Animation 14.

## Timeline tracks

1. **Appearance**: 0–1.19s. Randomized intro transitions finish inside this segment.
2. **Travel Start**: 1.15–1.50s. This is a random-start window, not a travel-duration segment.
3. **Cover Appearance**: earliest start 2.08s, duration 0.38s. Fades in the square background.
4. **Triangle Scale Out**: earliest start 1.72s, duration 0.59s. Shrinks the small grouped triangles.
5. **Triangle Scale In**: earliest start 2.09s, duration 0.68s. Grows the large triangle.

The three final transitions are **individually movable/resizable timeline tracks, not dials**. Their start times are earliest-start gates: for each group, actual start is `max(track.at, groupReadyAt)`. Moving a track later schedules that effect independently; moving it earlier never covers an unfinished group. Each effect then uses its own complete authored duration. Defaults begin at formation with no extra delay. End hold waits for all three effects to finish in every group.

## Regular dials

- **Warning Appearance Duration**: individual intro transition, default 0.25s.
- **Travel Duration**: each triangle's flight duration, default 2.3s. Zero snaps at each sampled start.
- **Timeline Duration**: complete loop/export duration, now **7s** (210 frames), ending exactly with the agent window exit.

There are no final-merge duration dials, Small Cluster Lead dial, or obsolete Travel segment. There are also no Seed/Dispersion/Swap dials: starts are captured and this variant never swaps. Controls and timeline use separate `micro-animation-15-*` persistence IDs; Animation 14 is unaffected. The retimed controls use `direct-v4`, preserving appearance/travel settings while resetting the previous duration to 7 seconds. The master timeline uses a new persistence ID so stale browser values cannot override these authored defaults.

`?time=<seconds>` inspects the current live timing. `MicroAnimation15` is the 1280×720, 30fps Remotion composition and uses the same pure sampler. Pass tuned controls and all seventeen timing clips as props when exporting (old props receive the new agent-track defaults). DialKit remains in place for authoring.

## Coding-agent extension

The window reproduces Figma frames `4779:13118` (composer) and `4779:13549` (sent/CLI), using the existing completed grid underneath—not the placeholder Figma grid. `agent-reference.json` records measured geometry and text. At 1280×720, the panel is 807×604 at (237, −41), intentionally cropped at the top. It uses local JetBrains Mono, the exact downloaded blue warning SVG, and no invented window controls.

Additional independently movable/resizable timeline tracks:

| Track | Start | Duration | Purpose |
| --- | ---: | ---: | --- |
| Agent Window Enter | 4.26s | 0.47s | Slide down from above the canvas |
| Prompt Typing | 4.27s | 0.44s | Type `Use Laminar CLI to investigate` / `and fix` |
| Issue Typing | 4.64s | 0.27s | Type `this issue` in its own container |
| Issue Padding | 4.65s | 0.35s | Expand left padding for the icon and right inset |
| Issue Background | 4.64s | 0.2s | Fade the badge background to #474747 |
| Issue Warning In | 4.79s | 0.3s | Scale the badge's blue warning in |
| Message Send | 5.08s | 0.18s | Smoothly lift the mounted prompt out of the collapsing composer |
| Cli Command Typing | 5.21s | 0.33s | Type `lmnr-cli sql query` |
| Sql Query Typing | 5.46s | 0.23s | Type the quoted SELECT line |
| Sql Predicate Typing | 5.63s | 0.27s | Type the arrayExists line around its warning icon |
| Query Warning In | 5.72s | 0.2s | Scale the inline SQL warning in after its character position is reached |
| Agent Window Exit | 6.62s | 0.38s | Slide back up, revealing the unchanged final grid |

Typing is literal character-count sampling, not an opacity wipe. The same prompt remains mounted through Message Send, smoothly lifting into the bottom-aligned transcript while the composer shrinks and text/badge colors dim. It is not retyped. Revised Figma node `4779:13968` replaces per-message vertical padding with **30px horizontal padding, 40px message gap, and 40px transcript bottom padding**. No blank CLI rows are reserved: each typing track smoothly opens one 58px row during its first 220ms (capped at that clip's duration), pushing existing text upward. The first row also introduces the 40px message gap. The completed transcript starts at window-local y=59 and occupies 370px. CLI typing cannot run before the send completes and retains its full duration if send is delayed. All movement is sampled from timeline time, not CSS transitions, so seeking/export stay deterministic. The command is visual text only: **no CLI command is executed and no message is actually transmitted**.

Move Window Exit to control the final reading hold. Scroll the timeline to reach all tracks; the editor preview reserves the dock's actual height when it is resized. Fonts and icon decoding are awaited for Remotion capture, while the same pure sampler handles editor seeking, reverse playback, and export.

## Verification

From `poc`:

- `pnpm exec tsx src/experiments/micro-15/sample.test.ts`
- `pnpm exec tsx src/experiments/micro-15/agent-window.test.ts`
- `pnpm run typecheck`
- `pnpm exec vite build`

Tests cover frozen starts, bounded per-cell random starts, waiting/traveling overlap, independent flight duration, direct paths, stationary dots, actual last-arrival readiness, independently retimed final tracks, zero durations, seeking, endpoints, and editor/Remotion renderer parity. Agent tests additionally cover every typed-character boundary, send completion, independent badge effects, delayed send/CLI gating, entry/exit, old-prop normalization, unchanged background, local assets, and one-time saved-setting migration.

Initial-extension browser verification confirmed exact window bounds (237, −41, 807, 604), the loaded font, the 322.375px badge width (Figma 322.3858px), empty CLI output at send followed by partial typing, and identical underlying grid markup before/during/after the overlay. The retimed defaults preserve independent padding, background, warning, typing, send, and exit controls. The v4 control migration retains custom flight/appearance values while replacing the previous duration with 7 seconds.

An independent code review identified a late-mounted DialKit portal observation issue; it was corrected using mount and resize observers, including the dock's bottom margin. Fresh-load drag-resizing and collapsing the timeline were then browser-tested without covering the preview. Cropped-window screenshot comparisons against Figma produced normalized RMSE ~0.035 (composer) and ~0.041 (sent); these are automated geometric/pixel checks, not a claimed human visual review. The separate image-review runner was unavailable.

Initial-extension final validation passed both Micro15 test suites, TypeScript, and Vite production build (only the existing bundle-size warning). Remotion successfully exported frames 288 (composer), 432 (sent/CLI), and 486 (after exit) using installed Chrome. Composer and sent exports were pixel-identical to the full-resolution editor captures: RMSE **0** for both. Artifacts: `/tmp/micro15-agent-reference/export-{prompt,sent,exit}.png`.

Revised bottom-aligned layout: browser measurements confirmed message y=392 before send, 332.5 halfway through send, 273 at send completion, 224 halfway through the first newline, then 175 / 117 / 59 as the three rows open. The prompt's text remains unchanged throughout; unopened rows measure 0px, completed rows 58px, and bottom padding ends at 40px. Regression tests check continuity at every send/newline boundary, including delayed send and backward seeking. The cluster-cover override remains `#1A1A1A` in Animation 15 only. Revised-layout tests, TypeScript, Vite build, and Remotion frame 432 export all passed; the exported frame is pixel-identical to the editor capture (RMSE 0).

Browser checks confirmed 216 fixed ground dots, 47 warnings, no dots attached to moving triangles, and numeric selector ordering. At 1.61s with the earlier 1.11–2.11s random-start settings, 19 triangles were traveling and 28 still waiting, with all ground dots stationary and full-sized. Moving Cover Appearance from 3.41s to 4.8s delayed only the backgrounds, left both triangle transitions unchanged, and persisted across reload. The test restored the default start afterward.
