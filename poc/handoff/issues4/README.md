# Current handoff — Issue Clusters 4 and new voice recording

This updates `sandbox/signals-launch-video` on top of upstream `9e5e09ccb4b05a5600630f91f827d499b18993b9`. Only the local Animation22 delta was transferred with a three-way merge; upstream score styles, audio changes, Flow21 refinements and unrelated work were retained.

## Start here

- Current editable Ultimate3: `?experiment=micro-18`.
- Standalone **Animation22 / Issue Clusters4**: `?experiment=micro-22`.
- Original historical cut: `?experiment=micro-18&cut=original`; standalone Issue Clusters3 remains `?experiment=micro-20`.
- Source: `src/experiments/micro-22/`; Remotion adapter `src/video/MicroAnimation22.tsx`, composition `MicroAnimation22`.
- Merged current defaults: [default-settings.json](default-settings.json), including retained upstream voiceover settings. Import this in the current editor when handing off exact code defaults; it is not a transcription/alignment of the new take.
- Reuse an existing preview server rather than starting a conflicting one. Source/default settings are committed; browser-local custom presets require their own JSON export.

## New recording for the next agent

**[Signals-launch-09-29-10-04.m4a](../../public/audio/voiceover/Signals-launch-09-29-10-04.m4a)** is the user's latest re-recording, copied byte-for-byte from the supplied download. Use this take for the next transcription/alignment pass, not the historical September27 take.

- AAC, stereo, 48kHz; **76.928 seconds**, 1,070,010 bytes.
- SHA-256: `e79d8e458cb5d06d1af55a3c9bda0240e25fe9dccab783a039064a16edd87403`.
- Machine-readable metadata: [recording.json](recording.json).
- Now split, placed and wired into playback: see [../voiceover-issues4/README.md](../voiceover-issues4/README.md).

## Visual and subtitle contract

The new report retains original Bash contents and full2040px descent, with the trace header above the viewport. One speech bubble scales from center-right, shows the warning, scales the triangle away, expands for three staggered label rows, grows for word-by-word explanation, then scales to zero from center-right on zoom-out.

Default native-time caption cues:

| Caption | Start | Action |
| --- | ---: | --- |
| Flow-1 powers Signals, our agent built to analyze traces at scale. | 0 | Intro |
| It finds deep issues | 1.6 | Descent |
| and reports them | 3.8 | Initial bubble |
| Not just with labels | 5.85 | Three staggered rows |
| but with any structure you define | 8.15 | Explanation word reveal |
| across every trace | 11.3 | Zoom-out / trace field |

**The full clustering and coding-agent sequence is restored after zoom-out:** grouping into high-level patterns, coding-agent handoff, prompt/send/CLI/query flow, window exit and original closing field. It reuses source20/source15 samplers/renderers rather than a parallel engine.

Prelude endpoint13.7s. Standalone native endpoint20.7s, encoded683frames at30fps (including closing field). Current Ultimate3 uses its existing retimed6.4s postlude: Issues starts48.608s, postlude starts63.208s, conclusion starts69.608s, total authored75.858s / composition2276frames. Preceding chapters and Animation21 are unchanged by this update. The Issues allocation grows by6.366666667s rather than squeezing or truncating restored sections.

All relevant bars remain scrubbable. Saved full presets retain their supplied starts; only prelude-only edits ripple the postlude. Load-only migrations update recognizable old generated captions/depth, while custom bars and deliberate normalized JSON imports remain literal.

## Validation

The source checkout passed206 tests, typecheck, code-only Vite build, isolated Chrome checks and independent source review. Browser checks include restored standalone/current Ultimate3 clustering and CLI, reverse seeking, actual live endpoints, full preset save/load/clear, individual prelude ripple, and custom postlude edits.530 historical source20 frames matched the pre-task snapshot. These are functional/state/DOM checks, not subjective image or listening approval.

See [VALIDATION.md](VALIDATION.md) for checks on the merged publication checkout. Recording alignment and a new rendered video remain the next agent's work.
