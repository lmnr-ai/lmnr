# Quicker trace run (editable-v9)

"Every time it runs, it leaves a trace." now reaches "When your agent fails," 1.25s sooner.
The picture and voice are otherwise the [A/subtle integration](../voiceover-subtle-a/README.md):
2278 frames, chapters 0 / 21.16 / 34.86 / 50.052 / 69.36s.

- **Track.** The opening run drops Bash and its separator, the two blocks just before the
  lifting blue Thinking (`streamBlocksRemoved` 10 → 12), which shortens it by 360px. Write and
  its icon remain. The approach to the elbow stays 391.025604px, so the lift is unchanged.
- **Speed.** The run is 5.478s (was 6.728s). The agent runs at 399.59px/s (was 378.86px/s),
  about 5.5% faster. Every Ultimate2 clip from `continueStraight` on, the clouds and the
  tuned `cloudEnter` (now 11.24s) move 1.25s sooner, as does the chapter allocation (22.41 → 21.16).
- **Voice.** n01 and n02 keep their slots; n03–n23 move 1.25s sooner. The trims are the
  editable-v8 trims (same `a`/`b`).
- [placements.json](placements.json) and [default-settings.json](default-settings.json)
  (the current `VOICEOVER_DEFAULTS`) are the inputs of
  `node scripts/build-ultimate3-issues4-vo.mjs editable-v9 voiceover-quicker-trace voice_A_subtle.wav`,
  which wrote `public/audio/voiceover/editable-v9/` (the bed is rescored to the new cues).
- Storage holding editable-v8 generated values (opening clips, speed, route, clouds, allocation,
  phrase slots) upgrades field by field. A tuned streamer speed keeps its 10-block route.

Published render: `lam-2305/ultimate3-quicker-trace-arabesque-voiceover.mp4`, same mix chain as
editable-v8, -14.9 LUFS, -1.0 dBTP.
