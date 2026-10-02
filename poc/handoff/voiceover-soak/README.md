# Clustering breath and a longer look at the warning grid

The editable Ultimate3 voiceover cut (`?experiment=micro-18`) is the [voiceover-captions](../voiceover-captions/README.md) cut with 1.3s more room. It now runs 77.158s (2315 frames).

| Beat | Was | Now | Why |
|---|---|---|---|
| Discovery circle (`analysisCircleGrow`) | 62.208 (0.7s) | 62.208 (1.7s) | `CLUSTER_BREATH`: a calmer grow |
| Agent scale-out / circle fade / layout | 62.708 / 62.908 / 63.108 | +1s | follow the circle |
| "It clusters issues…", "ready for you…", clustering postlude | 63.35 / 65.9 | 64.35 / 66.9 | the gap after "across every trace" is 2s instead of 1s |
| Conclusion, "Unlock the insights…" | 69.608 / 69.66 | 70.608 / 70.66 | Issues allocation +1s |
| Wide warning grid (conclusion placeholder) | 3.75s | 4.05s | `GRID_SOAK`: holds 0.3s longer; the 3s pullback is unchanged |
| Logo, "with Laminar." | 73.358 / 73.37 | 74.658 / 74.67 | |

Editor storage holding editable-v5 or editable-v6 generated values upgrades field by field. Edited fields stay, and historical imports stay literal.

- [placements.json](placements.json): the voiceover-captions placements with n20–n22 moved +1s and n23 moved +1.3s.
- [default-settings.json](default-settings.json): the current `VOICEOVER_DEFAULTS`, the render settings.
- `node scripts/build-ultimate3-issues4-vo.mjs editable-v7 voiceover-soak` wrote `public/audio/voiceover/editable-v7/`: the Arabesque bed rescored to these cues (seed 107290, v4 tuning, -5.5dB) and the same 23 phrase trims. The script now takes its frame count from the settings allocations.

## Published render

`lam-2305/ultimate3-issues4-arabesque-voiceover-v3.mp4`: the same mix chain as voiceover-captions. It measures -14.8 LUFS, -1.0 dBTP.
