# Script captions and picture retimed to the September 29 take

The editable Ultimate3 voiceover cut (`?experiment=micro-18`) keeps the [voiceover-issues4](../voiceover-issues4/README.md) take and length (75.858s, 2276 frames). What changed is the captions, and the picture now follows the voice.

## Captions

The narrated cut draws one screen-pinned caption track (`VoiceoverCaptions.tsx`) instead of the chapter subtitle bars. Each script line is shown verbatim. It spans the phrase clips it is spoken over, from the first clip's `at` to the last clip's end plus 0.4s, and the next line cuts it. Moving or trimming a phrase in the editor moves its caption. The standalone animations and the original (unnarrated) cut keep their own subtitle copy.

The script line reads "Powerful LLMs find deep issues," while the take says "can find".

## Picture retime (global seconds)

| Beat | Was | Now | Voice |
|---|---|---|---|
| Cheap legs zip | 23.81 / 24.30 / 24.80 | 23.90 / 24.38 / 24.86 | "Cheap LLMs fail" |
| Three warnings pop (`thinkingDrop`) | 25.36 | 25.60 | "crucial issues" |
| Camera to budget | 31.41 (1.3s) | 31.26 (1.15s); budget clips -0.3s | "but the costs" moved 32.35 → 31.95 |
| 20x graph (`graphSpread`) | 42.72 | 44.92 (+2.2s) | "while analyzing" |
| Engine (`cameraToEngine` onward) | 45.95 | 48.35 (+2.4s) | "Flow-1 powers Signals" |
| Issues lead-in | 48.61 | 51.30 | "traces at scale" |
| Bash descent | 51.11 (1.69s) | 53.00 (1.3s) | "It finds deep issues" |
| Bubble / labels | 53.31 / 55.36 | 54.45 / 55.50 | "reports them" / "Not just with labels" |

The Flow allocation and trim grow by `FLOW_HOLD` (2.692s) and Issues shrinks by the same amount: its report prelude now ends at 11.008s, so `micro22PreludeEnd` follows the last clip instead of a fixed 13.7s floor. Explanation, zoom-out, the clustering postlude and the conclusion keep their global times. Editor storage with the editable-v5 generated values upgrades field by field; edited fields stay.

- [placements.json](placements.json): the voiceover-issues4 placements with "but the costs are unsustainable." 0.4s earlier (31.948s).
- [default-settings.json](default-settings.json): the current `VOICEOVER_DEFAULTS`, the render settings.
- `node scripts/build-ultimate3-issues4-vo.mjs editable-v6 voiceover-captions` wrote `public/audio/voiceover/editable-v6/`: the Arabesque Acoustic Chill bed rescored to these cues (seed 107290, v4 tuning, -5.5dB) and the same 23 phrase trims. It refuses to overwrite.

## Published render

`lam-2305/ultimate3-issues4-arabesque-voiceover-v2.mp4`: the same mix chain as voiceover-issues4 (15ms phrase fades, `sidechaincompress=threshold=0.02:ratio=3.5:attack=20:release=250`, `loudnorm=I=-14.7:TP=-1:LRA=11`). It measures -14.8 LUFS, -1.0 dBTP.
