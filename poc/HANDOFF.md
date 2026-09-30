# Signals launch video — agent handoff

## Latest handoff: current Ultimate3 visuals/timing and approved voiceover

Start with **[handoff/latest-ultimate3/README.md](handoff/latest-ultimate3/README.md)**
for the synchronized animation/timing changes, exact rendered settings, and
validation. This includes the latest local work, not just the new voice file.

The user selected **A / subtle** from the latest recording's three processed
versions. Start with **[handoff/voiceover-subtle-a/README.md](handoff/voiceover-subtle-a/README.md)**.
The approved [voice_A_subtle.wav](public/audio/voiceover/voice_A_subtle.wav) is
included with processing metadata and a verified hash. It is now split, aligned
and wired into playback and export as `editable-v8`; see the README's
"Integration" section.

The opening trace run is then 1.25s shorter (two fewer blocks, a slightly faster agent),
as `editable-v9`: **[handoff/voiceover-quicker-trace/README.md](handoff/voiceover-quicker-trace/README.md)**.

## Existing integration: Issue Clusters 4 and previous voice recording

Start with **[handoff/issues4/README.md](handoff/issues4/README.md)**. The current editable Ultimate3 uses Animation21 plus Animation22's expanding report and restored clustering/coding-agent sequence. The latest user re-recording, **[Signals-launch-09-29-10-04.m4a](public/audio/voiceover/Signals-launch-09-29-10-04.m4a)**, is split and wired into playback ([handoff/voiceover-issues4/README.md](handoff/voiceover-issues4/README.md)); the picture and captions are then retimed to it ([handoff/voiceover-captions/README.md](handoff/voiceover-captions/README.md)), then given a clustering breath and a longer look at the warning grid ([handoff/voiceover-soak/README.md](handoff/voiceover-soak/README.md)). The original cut remains separately available.

**[handoff/sound-concepts/README.md](handoff/sound-concepts/README.md)** contains alternate sound designs for the voiceover-soak cut (LAM-2311): `tidepool`, `lumen` and `windup` (round 1, rounded-digital), plus `bluenote` (jazz) and `overdrive` (maximal trailer/EDM) (round 2), plus `tempesta` (a classical virtuoso violin concerto) (round 3; v2 is on the editable-v9 cut with a constant, unducked bed). They are offline score styles built on `score/rounded.ts`. Only offline renders exist so far; live playback still uses Arabesque.

The earlier **[Flow21 handoff](handoff/flow21/README.md)** remains useful background, but its full-composition duration predates the longer restored Issues chapter.

The sections below document the **earlier historical transfer** and its original-cut timing.

## Historical starting point

This branch, `sandbox/signals-launch-video-handoff`, is stacked directly on `sandbox/signals-launch-video` at `6ba5d926c38281ea8f4d9cd2eafb3b051ab21494`. It brings the standalone `signals-launch-video` project's committed and uncommitted launch work into the existing `lmnr/poc` application. The original project and `lmnr` checkout were left intact.

- **Main composition:** Ultimate 3, `?experiment=micro-18`.
- **Standalone issue sequence:** Issue clusters 3, `?experiment=micro-20`.
- **Editor:** run `pnpm install --frozen-lockfile` in `poc` on a fresh checkout, then `pnpm tune --host 127.0.0.1 --port 5180`. On the original machine, reuse its existing `http://localhost:5180` server; don't start a conflicting one.
- **Remotion:** `pnpm studio` in `poc`; see `src/video/Root.tsx` for composition IDs and metadata. Editor and video adapters use the same pure samplers.
- **New recording:** [`public/audio/voiceover/Signals-launch-09-27-03-17.m4a`](public/audio/voiceover/Signals-launch-09-27-03-17.m4a). Supplied by the user for the next agent; copied byte-for-byte, **not yet transcribed, aligned, mixed, or wired into playback**. AAC, stereo, 48 kHz, 58.901333 seconds. SHA-256: `5519cb5f0c69355c65ab2f57b36af684989cab660881b743d872937aecba7ee0`.

## What is included

- All animation source and assets, including Animations 14–18, the rebuilt Micro20, the actual Micro20-in-Ultimate3 shared-world integration, and the Animation9-kernel twinkling outro.
- Ultimate3's active Arabesque Acoustic typing-free audio bed, live deterministic lubed-linear thocks, softness-8 whooshes, offline rendering/mixing scripts, score source, tuning controls, and source-sample attribution/manifests.
- The existing upstream **Phase**, **Tintinnabuli**, and five selectable keyboard models, rather than overwriting them with the older standalone snapshot.
- The separately developed **Ultimate 3 Silk** edition and its source assets/scripts.
- Repository-root `sound-synth/`, `soundboard/`, `song-studio/`, `soundscape-prototype/`, and `research/` directories, preserving their original relative relationship to `poc`.
- The earlier trace-generator scaffold under `tools/signals-trace-generator/`, with its own package/lockfile/README. It is separate from the animation editor and needs its own dependencies and credentials to run.
- Prior transcript media, frame references, HTML timing editor, and generator scripts under `poc/handoff/transcript/`.
- Historical frozen export audio, settings, and manifest under `poc/handoff/frozen-exports/`; these are **historical**, not exports of the current longer composition.
- Selected verification notes and exact grid-cut PNG pairs under `poc/handoff/verification/`.
- `poc/handoff/transfer-manifest.json` records source-to-destination paths and hashes; merge resolutions are identified rather than misrepresented as byte-identical copies.

## Current visual/audio contract

- Ultimate3 defaults: **63.218181818 seconds / 1897 frames at 30 fps**. It uses a single transport, editable/rippling chapter timelines, deterministic arbitrary and reverse sampling, and a shared Cost/Flow/Issues camera/world.
- Standalone Micro20: **526 frames**, exact terminal sample at **17.5 seconds**. Its original postlude ends at 15.5 seconds, followed by the two-second twinkling pullback.
- Ultimate3 does **not** include that standalone tail in its Issues allocation. The same ending plays once in its existing Conclusion slot, **59.218181818–61.218181818 seconds**, then the unchanged logo/“With Laminar” ending.
- The closing camera reaches **40% scale** (60% zoom out) around the center. Free cells evolve with Animation9's actual deterministic kernel; merged covers and the actual source renderer remain in place. The caption is “Unlock the insights hiding in millions of agent traces”.
- The same-composition starting cuts were measured at **zero differing pixels** at 1280×720, with changing captions hidden. This does not claim cross-composition or Remotion raster identity.
- Keep the 17-column source grid, 54px hero, 12px dots, continuous/reverse loader, source16 Bash/report descent, source13 gradient, radius-driven discovery, source15 postlude, and six-part narration intact.
- Active Micro18 audio is the calibrated Arabesque typing-free bed plus one live shared-PCM thock scheduler. Do not also enable the full legacy effects engine, duplicate the keyboard, destructively subtract keyboard audio, or add whirring.
- Master is a true linear 0–10 gain applied once; defaults remain master 6.98, music 0, errorTone .11, Ultimate2 tick 2, Cost ratchet 2, typing 1. Paused inspection must remain silent.
- Signal Lab retains saved sounds and the G4 → E4 → C4 piano recipe; Engine/Ratchet remain click-only.
- Preserve explicit settings imports, transitions, endpoints, instant/spring semantics, and narrowly versioned load-only migrations. Browser-local presets are **not** automatically part of Git; export Settings JSON from the original browser to transfer any additional live authoring presets. The committed code defaults and historical JSON exports are included.

## Upstream integration decisions

The latest upstream branch added keyboard models and score styles after the standalone copy diverged. A bounded three-way merge retained both sets of work:

- `--keyboard`, Phase/Tintinnabuli, and the score registry remain available alongside `--tuning`, `--split-arabesque`, seed control, and the no-typing bed path.
- Nocturne-family default `thock` uses this project's existing shared PCM and live event identities. Explicit alternative models use the upstream modelled-keyboard scheduler. This intentionally preserves the active audio synchronization instead of reverting it to the upstream word-gap scheduler.
- A typing-disabled render suppresses every keyboard model, including ambience sends, without advancing its RNG.
- `score/handoff-merge.test.ts` covers retained options, muted alternate keyboards, and default-thock versus alternative-model selection.
- Neither the current soundtrack WAVs nor the new recording were regenerated or changed during this transfer.

## Validation and known limitations

See `handoff/VALIDATION.md` for checks run on this exact stacked checkout.

Earlier twinkle verification passed 136 tests and typecheck; independent review found no remaining blockers. Remaining notes:

- No fresh Remotion still/video raster export was performed for the twinkle change.
- Repeated standalone midpoint screenshots had four warning-edge pixel differences (maximum channel delta 51) despite identical pure state/DOM geometry. Ultimate3's repeated midpoint was exact; the starting cuts are exact in both.
- Conclusion's authoring tests do not yet use complete resolved DialKit clip output in every case. Opening imported duration-based spring clips can persist equivalent normalized transition metadata; no remaining camera reset was established.
- The active mastered bed is frozen to default timing. Retiming the composition requires regenerating its bed for fully retimed non-keyboard audio; live typing follows current settings.
- Models could not view images, so numerical checks are not subjective visual approval or listening approval.

## Intentionally not published

Credentials (`.env`), local agent/session state, dependencies, caches, build output, rendered MP4s, and temporary inspection dumps were not copied. The base branch's existing ignores for generated `public/sound-studies/`, `public/ultimate-3-silk/default/`, and `public/ultimate-3-silk/exports/` remain in force. Their source, renderers, source samples, and authored manifests are included; regenerate those outputs when needed. The 83.6 MB historical transcript timing-editor HTML is retained because it embeds its media and is useful as a self-contained reference.
