# September 29 take on the Issue Clusters 4 cut

Superseded as the default by [../voiceover-captions/README.md](../voiceover-captions/README.md) (script captions, picture retimed to the voice); this placement, its `editable-v5` sources and render stay as published.

The editable Ultimate3 (`?experiment=micro-18`) now narrates with **[Signals-launch-09-29-10-04.m4a](../../public/audio/voiceover/Signals-launch-09-29-10-04.m4a)** (SHA-256 `e79d8e45…87403`) over the 75.858s / 2276-frame Issue Clusters 4 cut.

- [placements.json](placements.json): 23 phrases, `a`/`b` = source seconds in the take, `at` = composition seconds. The speech runs 12.8–72.7s of the recording; the room sounds before and after are not used.
- Phrase IDs are `n01`–`n23`. Stored edits of the September 27 take's `vo*` clips are dropped on load and never move these; the old take, its `editable-v4` trims and beds stay untouched (`VOICEOVER_PHRASES_V4`).
- [default-settings.json](default-settings.json): the current `VOICEOVER_DEFAULTS`, the render settings. They differ from `handoff/issues4/default-settings.json` only in the voiceover phrases.
- `node scripts/build-ultimate3-issues4-vo.mjs` wrote `public/audio/voiceover/editable-v5/`: the Arabesque Acoustic Chill split-playback bed at -5.5dB (seed 107290, v4 tuning), the 23 phrase trims (the v4 voice chain), and a hashed manifest. It refuses to overwrite.
- `scripts/export-ultimate3-editable-vo.ts` mixes that bed with edited phrases for the editor's parity export.

## Placement

The Issues phrases start within ~0.3s of their captions (labels, structure, every trace, patterns, ready), except "It finds deep issues and reports them.", which lands ~1.8s after the Detection caption because "Flow-1 powers Signals, our agent built to analyze traces at scale." fills the start of the chapter. The Flow narration is longer than the chapter, so its phrases run with tight gaps into the Issues entry. "with Laminar." sits on the logo (73.37s).

The Ultimate2 and Cost captions still show the older script (e.g. "You build agents.", "Cheap LLMs can read traces efficiently"); the new take says "This is the agent you've built." and "Cheap LLMs fail to find crucial issues.".

## Score

The Issues cues now read source22's own prelude (`timing22`) instead of source20's schedule. Arabesque's report bridge follows the 13.7s report: the bash stop, the descent ripple, the bubble, the label rows, the typed explanation and the zoom out each get one touch over a triplet arabesque. Everything else is the Arabesque Acoustic Chill score, shifted by the cues.

## Published render

`lam-2305/ultimate3-issues4-arabesque-voiceover.mp4`: the bed above plus the placed phrases (15ms fades), ducked under the voice (`sidechaincompress=threshold=0.02:ratio=3.5:attack=20:release=250`), then `loudnorm=I=-14.7:TP=-1:LRA=11`. It measures -14.8 LUFS, -1.0 dBTP; faster-whisper recovers the full script.
