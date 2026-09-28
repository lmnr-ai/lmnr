# Ultimate 3 deterministic audio export

## Active Arabesque viewer and matching export

The original cut at `http://localhost:5180/?experiment=micro-18&cut=original` uses Arabesque Acoustic, **not** the legacy full effects engine. `use-arabesque-audio.ts` plays `public/audio/arabesque-acoustic/ultimate3-softness-8-no-typing-v1.wav` through a calibrated Web Audio media source, and mounts exactly one shared `useIssueTypingAudio` scheduler. The new bed has **no keyboard or keyboard ambience sends**; it retains the acoustic score and the existing `score/arabesque/softness-8-tuning.json` (`whoosh.softness=1`, `whoosh.volume=1.5`). The original `ultimate3-softness-8.wav` and frozen exports are untouched.

The score's Issues clock now includes entry + resolved source20 prelude. Its pops sample only `postludeActive`; blocked Arabesque handoffs suppress postlude foley and notes. Live thocks follow current persisted/imported settings, including spring/instant entry and retimed prelude/typing, using the same deterministic event identities and PCM as score exports.

**Frozen-bed limitation:** music and non-typing effects follow the settings in the adjacent new `.json` manifest. They do not adapt to arbitrary editor changes. Rerender a new bed for those changes; do not assume a static WAV has retimed itself. Live typing alone follows edits immediately. The bed retains its original 63.233333s default length; length-changing edits also require a new bed for the ending to match.

**Gain contract (no saved-value migration):** the existing master remains linear 0–10, applied once to each output. The already-mastered bed has fixed **input calibration `1 / 6.98`** before the master, preserving its loudness at the saved 6.98 production setting. Shared thock PCM retains its `.35` DSP headroom trim and receives a separate fixed `.2` active-mix trim, then linear `Issue clusters 2.typingVolume`, then master once. Master 0 silences bed and active release tails; master 2 doubles amplitude relative to 1. `Shared.musicVolume` is still the legacy Sangers control (default 0); it intentionally does not mute Arabesque. Other legacy per-effect controls do not remix the frozen bed. Large master/typing values can clip; they are not silently limited or normalized.

Reproduce the active assets into a **new destination** (split mode preflights all outputs and refuses to overwrite the bed, playback, manifest, stems, or video):

```sh
pnpm ultimate3:score --style arabesque-acoustic \
  --tuning src/experiments/micro-18/score/arabesque/softness-8-tuning.json \
  --split-arabesque --seed 107290 --master 6.98 --typing-volume 1 \
  --out /tmp/arabesque-reproduction/ultimate3-softness-8-no-typing-v1.wav
```

This writes the typing-free bed, an adjacent `.playback.wav` (exact split mix at default settings), and a `.json` manifest with frozen settings, tuning, seed, cue identities, source-manifest hash, output hashes, duration, loudness and peak. Add `--settings file.json` for retimes. The split export decodes the quantized published bed, adds dry shared PCM, and applies the same calibration/typing/master gains; **no second mastering pass** changes that balance. With `--video <silent.mp4> --mp4 <new-output.mp4>`, split mode muxes the complete `.playback.wav`, including thocks, not the keyboard-free bed. The ordinary score command without `--split-arabesque` instead bakes shared thocks into its score buses/ambience and masters the whole mix; it is not the split viewer's amplitude-parity export.

Browser regression (existing editor only, isolated Chrome, session cleaned up):
`node scripts/test-active-arabesque.cjs /tmp/active-arabesque-browser.json`.

## Legacy effects exporter (retained, not the active viewer)

Run from `poc/` with explicit frozen scene props and a flat or DialKit-grouped mix JSON:

```sh
pnpm ultimate3:audio \
  --props ../artifacts/exports/ultimate3-20260924/props.json \
  --mix ../artifacts/exports/ultimate3-20260924/sound-mix.json \
  --wav ../artifacts/exports/ultimate3-20260924/ultimate3-soundtrack.wav \
  --manifest ../artifacts/exports/ultimate3-20260924/ultimate3-soundtrack.manifest.json \
  --silent-video ../artifacts/exports/ultimate3-20260924/ultimate3-silent.mp4 \
  --output-video ../artifacts/exports/ultimate3-20260924/ultimate3-with-effects.mp4
```

The command bundles a temporary browser harness, renders the existing Web Audio recipes and schedules in Chrome `OfflineAudioContext` at 48 kHz with seeded noise, writes an IEEE-float WAV on a fixed -100 dB PCM grid, records SHA-256 links to the exact props/mix/WAV, and optionally stream-copies the frozen H.264 video while encoding audio to AAC. It never reads localStorage. `MicroAnimation18` also accepts `audioSrc` for direct Remotion rendering; use the manifest hashes to ensure that source was generated from the same props and mix.

The audio buffer is exactly `durationInFrames / 30`; effect and reverb tails are retained until that boundary and intentionally truncated at the composition boundary. Event timing and seeded noise are deterministic. Chrome's oscillator/filter implementation can vary by a few final float units across separate processes, so validation compares PCM numerically (the observed maximum delta is recorded in the evidence) rather than promising a byte-identical WAV hash. The manifest reports peak and RMS. Values above unity are not silently normalized; the manifest explicitly warns when the requested high-gain mix exceeds unity.

## Issue clusters 3 integration

The current composition is 1897 frames (63.233333s frame-rounded); its logical
schedule ends at 63.218181818s. Existing frozen props/media examples above are
historical artifacts, not regenerated or overwritten by this change. Generate
new props/mix manifests under a new output directory if exporting this revision.
Typing and coding-agent-window effects share `issuePostludeOffset(settings)` so
both the browser and this offline effects exporter follow entry + source20's
resolved prelude. `score/cues.ts` and the new Arabesque bed now use the corrected source20
clock; older mastered files remain historical and must not be assumed synchronized.
No new transition sound or whirr was introduced.

## Mechanical thock typing

The active live keyboard, score key voice, and this legacy effects exporter use `thock-typing.ts`: the supplied
lubed-linear model's contact tick, four case/plate modes, 135Hz desk thump,
spacebar stabilizer taps, and quieter key release. Both paths schedule identical
seeded 48kHz stereo PCM by event identity, so skipping or replaying a section
does not change its keystrokes. The tuned 6–9-key/second cadence and current
editable typing windows remain authoritative; the older quoted 47.29s/48.28s
burst timestamps are not used.

The supplied standalone demo's per-file -1dBFS normalization is intentionally
omitted. A fixed `.35` trim leaves headroom under the existing production master;
`Issue clusters 2.typingVolume` (the retained saved-control path) and the shared
master each apply once, including active release tails. The manifest retains its
legacy `typingTick` event-count key. The legacy music, error chime, camera/agent whoosh, ratchet, soundboard, saved mix,
and Silk implementation remain intact. The active Arabesque route and its new
score bed are described above; this legacy export command does not reproduce that bed.
