# Animation 22 — Issue clusters 4

Select `?experiment=micro-22` or Remotion `MicroAnimation22`. Current Ultimate3
(`?experiment=micro-18`, voiceover-v4) uses source22. Animation20, original-cut,
and intentionally imported historical JSON remain available.

## Report and action captions (native seconds)

| Caption | Window | Related action |
| --- | --- | --- |
| Flow-1 powers Signals, our agent built to analyze traces at scale. | 0–1.6 | Bash entry/expansion |
| It finds deep issues, | 1.6–3.8 | Full 2040px descent 1.6–3.29 |
| and reports them. | 3.8–5.85 | Bubble scale-in 3.8–4.15 |
| Not just with labels, | 5.85–8.15 | Row stagger 5.85–6.65 |
| but with any structure you define, | 8.15–11.3 | Explanation words 8.15–10.55 |
| across every trace. | 11.3 through postlude opening | Pullback 11.3–13.2; completed field 13.7 |

Each caption is an independently editable clip, not a preview-only cue. The
last caption bridges into the shared `subtitleIssues` bar, as source20 does.
Original postlude patterns/ready captions then take over.

The original Bash contents/highlights, full descent, and report motion remain:
compact (463,283,154,154), labels (108,260,497,200), explanation
(108,152,497,416). Report camera center stays (746,360); the paper starts at
screen y=-1740 during the report hold. Triangle scales away at 5.2–5.45 before
resize; rows rise/fade, explanation reveals whole words, and the center-right
bubble scales to zero at 11.3–11.85. Hidden words reserve final wrapping.

## Shared postlude, not a second animation engine

At the completed field, `sampleMicro22` hands off to `sampleMicro20`'s existing
source15 sampling and `Micro20Scene`/`Micro15Scene` rendering: warnings travel
into clusters, covers/large warnings merge, the coding-agent window enters,
prompt and issue badge type, message sends, CLI/SQL/predicate type, and the
window exits. Closing pullback/twinkles use `sampleIssueOutro` on that same
terminal merged world. Reverse/arbitrary seeks are pure and deterministic.

Source15 and source20 expose an **opt-in** authored-progress/endpoint seam for
source22; historical callers retain their original sampling. Source22 expresses
source15 smoothstep motion and linear typing as real DialKit clips. Effective
arrival/after-send dependencies delay intact clips and include spring settling
and raw duration tails. The travel bar staggers departure times; the existing
`travelDuration` control owns each flight length. Authored easing shape is
applied over that flight. Live `clip.current` feeds the same sampler, including
postlude subtitles. Invalid partial terminal prelude endpoints retain the trace
world and expose validation rather than snapping to a different field.

### Exact default duration changes

- Standalone prelude: **13.7s**, unchanged. Restored postlude: **7s**; native
  endpoint **20.7s**, previously 13.7s (**+7s**).
- Standalone closing field remains 2s. Existing endpoint-frame convention yields
  **683 frames / 22.766666667s**, previously 473 / 15.766666667s (**+210 frames**).
- Current Ultimate3 reuses its already-retimed source20 postlude settings, whose
  local duration is **6.4s**, not the standalone 7s. Its native source22 endpoint
  is **20.1s**. Entry remains **0.9s**, and postlude starts at Issues-local **14.6s**
  / global **63.208s**. No postlude time is compressed into the old allocation.
- Issues starts at **48.608s**, unchanged. Allocation grows **14.633333333 → 21s**.
  Conclusion starts **63.241333333 → 69.608s**. Its 6.25s duration is unchanged;
  total authored endpoint becomes **75.858s** (previously 69.491333333s).
  Composition: **2085 → 2276 frames**, **+191 frames / 6.366666667s**.
- For comparison, source20's historical authored 7.5–14.5 postlude defaults have
  a resolved prelude handoff at **8.45s**, due to its existing dependency schedule;
  its native endpoint frame count remains **465**, standalone **526**. These
  source20 values and sampled frames are not changed by source22 restoration.

## Authoring, persistence and parity

- Stable standalone IDs remain `micro-animation-22-timeline-v1` and
  `micro-animation-22-controls-v1`. Postlude controls have an additional panel;
  all `postlude_*` bars share the existing timeline.
- Ultimate3 uses its existing `-source22` detail timeline, with `report_*` bars
  chapter-relative and `postlude_*` bars offset by entry plus the report prelude.
  It reuses existing `issues.timing` / `issues.controls`, including custom values.
  Moving the prelude ripples unchanged postlude bars. JSON import/export retains
  native timing, endpoints, raw durations and transition metadata.
- All source22 tracks have a 50ms minimum. DialKit's resolved spring duration is
  never substituted for the raw authored duration when flat saved values exist.
- Load-only caption correction recognizes only the exact former generated
  caption defaults. Changed bars remain literal. A normalized import contains
  the new reporting bar and is never migrated. Standalone current/base/presets
  are handled independently, with an original backup and one-time marker.
  Existing full-depth migration and experiment IDs remain intact. No storage
  clearing or blanket resets are used.

## Deferred audio alignment

The frozen score/VO media, manifests, trims, provenance, phrase schedule and
previous source recordings are unchanged. A replacement take is attached at
`public/audio/voiceover/Signals-launch-09-29-10-04.m4a`; see
`handoff/issues4/README.md`. It is not wired into playback yet. The longer
restored chapter also moves the visual conclusion without moving recorded phrases
or extending the frozen bed: **the current frozen audio is not aligned to this
new visual endpoint**. Transcription, retiming and rendering remain deferred. Dynamic typing/window/postlude helpers are enabled again for
source22 at its new postlude offset, using existing engines; no duplicate audio
engine was added. Preceding chapter schedules and cloud rollback remain intact.

## Validation

`report.test.ts`, `postlude.test.ts`, `authoring.test.ts`, and micro18 tests cover
caption/action cues, unchanged report geometry, seam positions, reverse seek,
shared CLI/exit/outro, real live progress, raw spring durations, dependency tails,
minimum durations, JSON roundtrip, exact extension/offsets, and load-only saved
state migration. Snapshot comparison verifies source20 frames unchanged.
Browser checks inspect actual standalone and current Ultimate3 DOM, live postlude
edits, ripple, import/export, original-cut/source20, and closing field. These are
DOM/functional checks, not a subjective visual review or media render.
