# Ultimate 3 — Silk sound-design edition

## Authority and scope

User approved the refined Silk Ratchet audition (`agent-whirr-v2`) and requested the entire soundscape, delegating raw implementation while the parent keeps creative direction.

Build a **separate Ultimate 3 sound-design edition**, replacing the complete legacy SFX layer, not layering new sounds on top of old ones. Preserve the original Ultimate 3, prior studies, existing soundtrack/music work, visual geometry, timings, subtitles, authoring APIs, and unrelated dirty/untracked work. No commit/push, external audio/model requests, new paid services, dependency installation, or reference-audio copying.

The full SFX redesign is authorized. Do not compose a replacement music score: retain the current `ultimate3SangersMusicPlan` as independently controllable musical context. **Parent clarification after live-source inspection: the original currently defaults musicVolume to 0; preserve that concurrent user/external change. The new edition also defaults music OFF. Label its default full-film preview/export SFX-only; this is intentional, not a missing track.** An explicit music control can enable the existing arrangement. Export must not silently omit music while the editor includes it; if an offline adapter is needed, preserve the existing arrangement and report any renderer/timbre differences. The parent decides any remaining music tradeoff. Never restore concurrent external edits from the preservation baseline.

## Creative decisions — binding, not options to expand

### Identity

- Hero voice: **Refined**, NOT the extra-sparkle setting, from `poc/public/sound-studies/agent-whirr-v2` and `poc/scripts/generate-agent-whirr-polish.mjs`.
- Preserve the continuous harmonic body, shallow ten-per-revolution pressure ripple, subtle harmonic motion, softened piano/glass ornaments, and intimate reflections.
- Do not return to noise-excited ratchets, an exposed dentist-drill tone, granular friction, repetitive notification notes, or a generic whoosh underneath every movement.
- The audition's 8.4-second macro envelope is NOT a production loop. Rebuild the approved core as a reusable voice driven by actual motion. Do not replay the whole audition or repeat its ornaments every eight seconds.
- Noise may be used quietly for brief physical transitions (clouds, paper, air), not as the continuous agent texture. Soften it at source; no harsh transient hidden by a limiter.

### Hierarchy

1. Agent motion is the lead SFX voice.
2. One meaningful physical or semantic accent can briefly take focus.
3. Air and environmental transitions remain supporting layers.

Default mix trims relative to the agent bus: material accents around -3 dB, transitional air around -7 dB, typing around -10 dB. These are initial relative bus trims, not instructions to independently normalize every small sample to the same loudness. Use gentle 2–3 dB agent ducking around major reveals if overlap needs space. No permanently busy bed. New master defaults to unity, not the legacy 6.98 gain.

No more than five principal sparkle flourishes across the complete film, plus up to two quiet answering glints. A flourish can contain 2–3 shaped notes. Reserve those for the agent's first launch, meaningful analysis discovery, Flow introduction, the Issues payoff, and the logo if it needs one. Omit a redundant flourish when the existing music already carries the moment. Never generate a note for every dot, row, number, triangle, or character.

## Editorial cue map

Resolve all cues from **current normalized settings and the actual scene samplers**, not hardcoded absolute seconds. Default film is approximately 54.018 seconds; retiming, chapter trimming, extended holds, and skipped/zero-duration clips must remain coherent.

### Ultimate 2 — curiosity → work → insight

- Opening clouds: one soft inhale for the group, not per puff/particle.
- First agent travel: the approved smooth rotor enters with movement and the small launch ornament. Movement stays continuous through straight travel and the turn, with spatial placement following the agent rather than gratuitous stereo orbiting.
- Failure/turn: take brightness away; one restrained downward inflection, not an alarm, beep, or comic crash.
- Backtrack: one short soft reversal gesture tied to the camera move.
- Paper/door lifts: rounded, close material releases, varied within the same family. No unrelated whistle pack.
- Warning/insight focus: one small settling accent; reserve the second principal sparkle for the actual insight, not both every warning and every zoom.
- Cloud departure and hold: taper away and allow a real breath. No phantom motion sound during a frozen terminal hold.

### Cost — contrast and depletion

- Three cheap-agent passes: lighter, shorter versions of the SAME smooth mechanism, roughly 4 dB behind the hero. Follow their separate row-local moves and direction. No flourishes on each pass.
- Powerful agent: return the fuller core for entry and Bash descent. Respect actual stops/resumptions and integrated speed, not wall-clock oscillation through a pause.
- Bash opening: one rounded release, not a long typewriter/ratchet roll.
- Budget depletion: reduce motion and brightness with actual speed; do not add an unrelated dramatic drone. Settle at the real stop and leave room afterward. Smoke lifetime must not keep the motor alive.

### Flow — release, clarity, capability

- Cost-to-Flow bridge: one fluid camera gesture, not separate stacked chapter whooshes.
- Introducing reveal: the brightest, clearest flourish in the film, but short and contained, not twelve seconds of constant shimmer.
- Benchmark rows: group the staggered entrances into a small coherent gesture; no six-note automatic piano ladder. Suppress repeated/per-digit ticks.
- Count/bar finish: one subtle arrival at meaningful completion. Bar growth is a smooth lift, not the old ratchet.
- Engine/activation: quieter recurrence of the rotor identity, following visible spinning lifetimes.
- Split cover: paired soft closing material, not a slam and not a duplicate reveal fanfare.

### Issues — gathering → action

- Cluster travel/gathering: one grouped motion sound plus a precise soft seat at assembly; never one sound per triangle.
- Agent window: same material language as the paper/door family.
- Typing: very quiet grouped touches only during visible writing bursts. Cap density (<=8 contacts/s) and stop at the actual burst end. This must not become another grainy continuous machine.
- Send/result: one intentional confirmation, not notification beeps after every SQL fragment. A short payoff ornament is permitted here if it does not fight the score.

### Conclusion — room, then landing

- The existing placeholder section is deliberately silent in SFX.
- Logo: one warm, restrained landing aligned to the existing musical cadence. No added flourish if the cadence already says enough; at most a soft halo/tail.
- No new rhythmic gestures after the logo. End tails cleanly within the exported film.

## Implementation contract

- New package/route named `ultimate-3-silk` (or equivalently explicit label **Ultimate 3 — Silk sound design**), and separate Remotion composition such as `Ultimate3Silk`. Reuse existing scene renderers. Do not make a visual fork or copy whole chapter implementations.
- New audio/settings persistence namespace. No destructive migration/reset of original settings, no implicit reading of legacy SFX mix gains into the new mix.
- Keep existing `clip.current`, `useDialTimeline`, `<DialTimeline />`, and production handoff comments. A minimal backwards-compatible audio injection seam in micro-18 App is allowed if needed; the default route must retain identical behavior.
- One deterministic cue plan and audio recipe/sampling source drives editor and export. Seek/pause/resume, rapid retiming, audio enable, stale async builds, and cleanup must not duplicate/leak voices or replay past one-shots.
- Continuous rotor must use actual movement/rotation clocks. Do not merely gate a fixed 1.9-rps loop under configurable 9-rps cheap agents. Cap sonic brightness independently so fast movement does not become harsh.
- Default export contains the new SFX, with music explicitly OFF to respect the current source default. Expose independently adjustable master/music/agent/material/air/sparkle/typing buses, and include music in exports when explicitly enabled. SFX-only WAV and available stems should be reproducible and downloadable too.
- No silent editor/export divergence for nondefault settings. If a generated-asset approach needs a settings-specific build, enforce and expose the settings identity instead of playing the default audio under retimed picture.
- Preserve attribution, pinned source hashes, and modification disclosures for sampled piano. See `agent-whirr-v2/CREDITS.md` and its manifest.
- Do not start or restart frontend/app servers. Existing visible preview is http://localhost:5180/. Use installed Chrome with agent-browser; no Playwright download. Remotion WebGL exports need `--gl=angle`.

## Evidence required / parent acceptance

- Targeted tests: retiming/trim/holds; no legacy voices in new mode; rotor stops/resumes/phase continuity; bounded accents/typing density; deterministic sampling; pause/seek/cleanup and stale generation guards; editor/export cue parity; zero/gain bounds; unchanged original routes/defaults.
- Typecheck, focused original regressions, browser operation, a default full-film render, and ffmpeg duration/peak/loudness checks. Document exact commands and any pre-existing failures, rather than fixing unrelated code.
- Hash-preserve original audition assets and pertinent original source files unless a reviewed additive seam was necessary. Preserve all other working-tree changes.
- No claims of subjective listening or expert approval from meters, browser tests, screenshots, or model prose. The user has approved the identity, not yet the complete final mix.
- Parent owns final cue economy, overlap/mix choices, actual handoff, and acceptance. Ask the parent if fulfilling this contract requires broad original-scene rewrites, music replacement, license uncertainty, or a different scope.
