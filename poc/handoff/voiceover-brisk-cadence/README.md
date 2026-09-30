# Brisk cadence before "Introducing Flow-1" (editable-v11)

Six pauses before n11 lose another 1.48s in total. Everything from n10 on moves 1.48s sooner,
unchanged. The cut is 2085 frames (69.5s), with chapters at 0 / 19.06 / 28.43 / 43.622 /
62.93s. Everything else is the [tighter cadence](../voiceover-tighter-cadence/README.md).

| Gap | v10 | v11 | Picture |
|---|---|---|---|
| n02 → n03 "When your agent fails" | 1.235 | 0.935 | Run 5.178 → 4.878s at 448.74px/s (was 422.75). Same track, about 6.1% faster. |
| n04 → n05 "The insights…" | 1.15 | 0.85 | `cameraBacktrack` 1.3 → 1.1s. The lifts come 0.35s apart (were 0.4s), and highlight/warning follow. Everything from `warningFocus` on, including `cloudEnter` (now 9.69s), is 0.6s sooner. |
| n06 → n07 "Cheap LLMs…" | 0.755 | 0.605 | Cost starts 0.6s sooner (opening 19.66 → 19.06s). Its legs, warnings and "crucial issues" caption come 0.15s sooner. |
| n07 → n08 "Powerful LLMs…" | 0.788 | 0.508 | `cameraDownToBash` starts at 2.8s and takes 0.95s (was 3.0s, 1.1s). The purple Bash lands 0.43s sooner. |
| n08 → n09 "but the costs…" | 0.54 | 0.39 | `bashDescent` 1.6 → 1.5s, and the bash warnings come 0.5s sooner. The budget camera is 0.58s sooner. |
| n09 → n10 "Until now" | 1.13 | 0.83 | Budget depletion and smoke take 1.35s (were 1.65s). Cost is 10.25 → 9.37s (`costTrimEnd` as well). |

- The legacy `clouds` bars move with their chapter beats: slideIn and partialRecede −0.6s, and recede −1.48s.
  Sound effects follow the settings, and the bed is rescored.
- The shorter drain stops Cost's camera sooner, so Flow's world layout snaps seven grid cells over
  (was six). The settled Flow framing is unchanged.
- [placements.json](placements.json) has the same `a`/`b` trims with the new `at`.
  [default-settings.json](default-settings.json) holds the current `VOICEOVER_DEFAULTS`. Both
  are the inputs of
  `node scripts/build-ultimate3-issues4-vo.mjs editable-v11 voiceover-brisk-cadence voice_A_subtle.wav`,
  which wrote `public/audio/voiceover/editable-v11/`.
- Storage holding editable-v10 (or older) generated values upgrades field by field. A tuned
  streamer speed keeps its own v8, v9 or v10 opening and Cost, including phrase slots. v9 and
  v10 both drop 12 blocks, so v10 is recognized by its run length.

Published render: `lam-2305/ultimate3-brisk-cadence-arabesque-voiceover.mp4`, same mix chain as
editable-v10, -14.9 LUFS, -1.0 dBTP.
