# Tighter cadence before "Introducing Flow-1" (editable-v10)

The pauses from n02 to n11 are cut by 4.95s in total, so they sit closer to the post-Flow-1
cadence. Everything from n11 on moves 4.95s sooner, unchanged. The cut is 2129 frames
(70.96s), with chapters at 0 / 19.66 / 29.91 / 45.102 / 64.41s. Everything else is
the [quicker trace run](../voiceover-quicker-trace/README.md).

| Gap | v9 | v10 | Picture |
|---|---|---|---|
| before n02 "Every time it runs" | 0.955 | 0.755 | Run 5.478 → 5.178s at 422.75px/s (was 399.59). Same track and approach, about 5.8% faster. |
| n02 → n03 "When your agent fails" | 1.335 | 1.235 | Same run trim. |
| n03 → n04 "the trace can tell you why" | 0.885 | 0.735 | `upwardTurn` 1.1 → 0.95s. |
| n04 → n05 "The insights…" | 1.65 | 1.15 | `cameraBacktrack` 1.6 → 1.3s. The lifts come 0.4s apart (were 0.5s), and highlight/warning follow. Everything from `warningFocus` on, including `cloudEnter` (now 10.29s), is 0.95s sooner. |
| n06 → n07 "Cheap LLMs…" | 2.105 | 0.755 | The opening chapter ends as n06 ends (21.16 → 19.66s). Cost's clouds lift 0.4s sooner and its legs zip 0.8s sooner. |
| n07 → n08 "Powerful LLMs…" | 1.988 | 0.788 | `cameraDownToBash` starts at 3.0s and takes 1.1s (was 4.51s, 1.58s). The purple Bash lands 2s sooner. |
| n08 → n09 "but the costs…" | 1.04 | 0.54 | `bashDescent` 1.84 → 1.6s. The budget camera comes 2.5s sooner (0.37s after the warning). |
| n09 → n10 "Until now" | 2.08 | 1.13 | Budget depletion and smoke take 1.65s (were 2.6s). Cost is 13.7 → 10.25s (`costTrimEnd` as well). |

- The legacy `clouds` bars move with their chapter beats (slideIn −0.95s, partialRecede −1.9s,
  recede −4.95s). Sound effects follow the settings, and the bed is rescored.
- [placements.json](placements.json) has the same `a`/`b` trims with the new `at`.
  [default-settings.json](default-settings.json) holds the current `VOICEOVER_DEFAULTS`. Both
  are the inputs of
  `node scripts/build-ultimate3-issues4-vo.mjs editable-v10 voiceover-tighter-cadence voice_A_subtle.wav`,
  which wrote `public/audio/voiceover/editable-v10/`.
- Storage holding editable-v9 (or older) generated values upgrades field by field. A tuned
  streamer speed keeps its own v8 or v9 opening and Cost, including phrase slots.

Published render: `lam-2305/ultimate3-tighter-cadence-arabesque-voiceover.mp4`, same mix chain as
editable-v9, -14.9 LUFS, -1.0 dBTP.
