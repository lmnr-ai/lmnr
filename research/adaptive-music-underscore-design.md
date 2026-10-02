# Research: Adaptive Music Underscore Design for Hopeful Song Studio

## Summary

Expert adaptive-music systems do **not** make music adaptive by choosing isolated notes or gestures at random. They preserve authored musical structure, then vary or transition that structure at musically meaningful boundaries: vertical systems add/remove synchronized layers; horizontal systems move among authored phrases; hybrid systems do both. Wwise and FMOD both make musical synchronization, transition rules, state/parameter control, and authored segments central to their designs—not unconstrained event randomness.

For this fixed linear product video, Hopeful Song Studio should be a **deterministic arrangement audition tool**. It should schedule authored, harmonically compatible phrase modules against storyboard beats, offer independent instrument palettes (piano, digital pings, strings, hybrid), expose a small set of intentional intensity states, preview only legal bar/phrase transitions, and reserve an authored penultimate build plus final cadence for the planned ending.

> **Scope note:** “Sourced findings” below report principles supported by primary or high-trust references. “Recommendations” and the implementation blueprint are the researcher’s application of those principles to this repository; they are not claims made verbatim by the sources.

## Research angles

1. **Runtime structures:** vertical remixing, horizontal resequencing, hybrid systems, and state/intensity models.
2. **Musical continuity:** quantized transitions, harmonic planning, motifs, stingers, constrained variation, and orchestration independence.
3. **Listenability:** why authored constraints beat aimless randomness and how systems control repetition and fatigue.
4. **Product-video adaptation:** turning interactive techniques into a deterministic underscore with a guaranteed narrative ending.

## Findings — sourced

### 1. Adaptivity is usually selection among authored musical possibilities, not random note generation

Wwise organizes interactive music around Music Segments, Music Tracks, Music Playlist Containers, Music Switch Containers, states/switches, and transition rules. In other words, the adaptive unit is generally an authored segment or synchronized track/layer. A Music Switch Container selects music according to game state; a Playlist Container sequences segments under explicit playlist behavior. [Audiokinetic, “Understanding the Interactive Music Hierarchy”](https://www.audiokinetic.com/en/library/edge/?source=Help&id=understanding_interactive_music_hierarchy) [Audiokinetic, “Understanding Music Switch Containers”](https://www.audiokinetic.com/en/library/edge/?source=Help&id=understanding_music_switch_containers) [Audiokinetic, “Understanding Music Playlist Containers”](https://www.audiokinetic.com/en/library/edge/?source=Help&id=understanding_music_playlist_containers)

FMOD Studio similarly treats music as authored timeline content controlled by parameters, transition regions/markers, destination markers, and quantized timing. Its examples demonstrate rearrangement and layering from authored assets rather than free-running random melody. [FMOD Studio User Manual, “Music”](https://www.fmod.com/docs/2.03/studio/music.html) [FMOD Studio Examples](https://www.fmod.com/docs/2.03/studio/examples.html)

**Implication:** random violin flourishes are not a substitute for adaptive composition. Randomness may choose among already-vetted alternates, but the vocabulary, entry points, harmony, density, and exit behavior should be authored.

### 2. Vertical re-orchestration/remixing changes density while keeping musical time and harmony aligned

Vertical systems run synchronized stems or track variants and alter which are audible. This is ideal when the underlying tempo, phrase, and harmony should continue while energy changes. Wwise Music Tracks can contain sub-tracks, including switch and random step/sequence behaviors, inside the larger interactive-music hierarchy; state-driven mixing can change the active texture without discarding the common musical clock. [Audiokinetic, “Understanding Music Tracks”](https://www.audiokinetic.com/en/library/edge/?source=Help&id=understanding_music_tracks) [Audiokinetic, “Working with States”](https://www.audiokinetic.com/en/library/edge/?source=Help&id=working_with_states)

FMOD’s parameter-driven music design likewise permits synchronized instrument layers and parameter conditions to change an arrangement while it continues on the same event timeline. [FMOD Studio User Manual, “Music”](https://www.fmod.com/docs/2.03/studio/music.html) [FMOD Studio User Manual, “Parameters”](https://www.fmod.com/docs/2.03/studio/parameters.html)

**Strengths:** stable phrase continuity, fast and reversible intensity changes, and predictable harmony.  
**Costs:** all stems need a shared timeline and must sound acceptable in every allowed layer combination; repeatedly muting/unmuting the same loop can expose repetition.

### 3. Horizontal resequencing changes what phrase comes next, but only through authored legal exits and destinations

Horizontal systems connect discrete musical segments. Wwise transition rules define source/destination relationships and can specify when the source exits, what transition segment plays, and where the destination enters. Playlist behavior controls sequence/randomization at the segment level. [Audiokinetic, “Defining Transitions Between Music Objects”](https://www.audiokinetic.com/en/library/edge/?source=Help&id=defining_transitions_between_music_objects) [Audiokinetic, “Understanding Music Playlist Containers”](https://www.audiokinetic.com/en/library/edge/?source=Help&id=understanding_music_playlist_containers)

FMOD exposes the same compositional idea through transition timelines/regions, destination markers, and parameter conditions. Its timeline logic allows the playhead to move to an authored destination when conditions are met, while quantization keeps that move musically aligned. [FMOD Studio User Manual, “Music”](https://www.fmod.com/docs/2.03/studio/music.html)

The historical iMUSE patent is direct primary evidence of this principle: music can respond to changes by selecting musically compatible transition points and branches instead of abruptly switching arbitrary audio. [LucasArts, “Dynamic music system,” US5315057A](https://patents.google.com/patent/US5315057A/en)

**Strengths:** genuine narrative development, new harmony/melody, and relief from a single repeating loop.  
**Costs:** transition coverage grows quickly; every allowed source/destination pair needs a convincing musical path, or the graph must deliberately prohibit it.

### 4. The most useful production design is hybrid: horizontal form plus vertical intensity

Nothing in the Wwise or FMOD object models forces a project to choose only one method. A segment can contain layered tracks, while a playlist/switch/transition system chooses among segments. This naturally supports a hybrid design: horizontal modules provide an authored beginning, development, contrast, and ending; vertical layers tune local energy inside those modules. [Audiokinetic, Interactive Music overview](https://www.audiokinetic.com/en/library/edge/?source=Help&id=interactive_music) [FMOD Studio User Manual, “Music”](https://www.fmod.com/docs/2.03/studio/music.html)

**Implication for listenability:** use horizontal movement to avoid hearing the same musical sentence indefinitely, and vertical changes to react without constantly restarting the sentence.

### 5. Transition timing is a compositional constraint, not merely a crossfade setting

Wwise transition rules distinguish musical exit and entry behavior and support synchronization at musical points (for example, immediate, next grid, next bar, next beat, or exit cue depending on configuration). Music Segments contain musical timing information and entry/exit cues. [Audiokinetic, “Defining Transitions Between Music Objects”](https://www.audiokinetic.com/en/library/edge/?source=Help&id=defining_transitions_between_music_objects) [Audiokinetic, “Understanding Music Segments”](https://www.audiokinetic.com/en/library/edge/?source=Help&id=understanding_music_segments)

FMOD provides tempo/time-signature-aware quantization and transition timeline tools for the same reason: a technically smooth crossfade can still be musically wrong if accents, harmonic rhythm, or phrase syntax collide. [FMOD Studio User Manual, “Music”](https://www.fmod.com/docs/2.03/studio/music.html)

**Practical hierarchy:**

- **Beat boundary:** suitable for small percussive/timbral responses.
- **Bar boundary:** suitable for layer changes and many stingers.
- **Phrase boundary (often 2, 4, or 8 bars):** safest place for harmony, melody, or section changes.
- **Authored exit cue:** best when a phrase has pickup notes, a tail, or an irregular formal length.

Crossfades solve amplitude continuity; quantized exits, compatible harmony, and correct pickups solve musical continuity.

### 6. State models should encode narrative meaning; continuous parameters should control interpolable detail

Wwise distinguishes States (global categorical conditions) from Switches (selection associated with an object/game object), and uses RTPCs for parameter-driven control. [Audiokinetic, “Understanding States”](https://www.audiokinetic.com/en/library/edge/?source=Help&id=understanding_states) [Audiokinetic, “Understanding Switches”](https://www.audiokinetic.com/en/library/edge/?source=Help&id=understanding_switches) [Audiokinetic, “Understanding RTPCs”](https://www.audiokinetic.com/en/library/edge/?source=Help&id=understanding_rtpcs)

FMOD parameters can be continuous, discrete, or labeled and can condition instruments and transitions. [FMOD Studio User Manual, “Parameters”](https://www.fmod.com/docs/2.03/studio/parameters.html)

**Interpretation:** use a few named states for qualitatively different musical intentions (“setup,” “curious,” “building,” “resolved”), while continuous intensity can shape quantities such as layer gain, pulse density, brightness, or reverb. Avoid mapping one raw UI event to one new musical gesture; that produces jitter instead of narrative.

### 7. Motifs and stingers have different jobs

A **motif** is recurring musical identity embedded in the score; it can return in altered orchestration, register, rhythm, or harmony to create memory and coherence. A **stinger** is a short event-linked musical punctuation layered over or transitioned into the underscore. Wwise exposes Stingers as a first-class interactive-music feature, triggered by an event but synchronized according to musical rules. [Audiokinetic, “Using Stingers”](https://www.audiokinetic.com/en/library/edge/?source=Help&id=using_stingers)

**Implication:** the Laminar/product identity should be a small motif that survives palette changes. Reserve stingers for genuinely important on-screen reveals; do not turn every click, trace expansion, or annotation into a melodic interruption.

### 8. Constrained variation is valuable; unconstrained randomness is musically expensive

Wwise’s playlist and track behaviors allow random or sequence selection, but they operate within containers and authored segment/track structures; they also expose controls intended to manage playback behavior rather than inventing arbitrary pitches. [Audiokinetic, “Music Playlist Container Property Editor”](https://www.audiokinetic.com/en/library/edge/?source=Help&id=music_playlist_container_property_editor) [Audiokinetic, “Music Track Property Editor”](https://www.audiokinetic.com/en/library/edge/?source=Help&id=music_track_property_editor)

Academic and practitioner literature describes interactive music as balancing variability against authored coherence. Karen Collins’s foundational study places dynamic music in the broader functional and production context of games, while Michael Sweet’s practitioner text treats vertical remixing, horizontal resequencing, transitions, and compositional planning as authored systems. [Karen Collins, *Game Sound*, MIT Press](https://mitpress.mit.edu/9780262537773/game-sound/) [Michael Sweet, *Writing Interactive Music for Video Games*, Addison-Wesley](https://www.pearson.com/en-us/subject-catalog/p/writing-interactive-music-for-video-games-a-composers-guide/P200000009925/9780321961587)

Useful constrained variation includes:

- alternates with the same length, cadence type, and harmonic function;
- “shuffle bags” that play each eligible alternate before repeating;
- no-immediate-repeat and minimum-recurrence-distance rules;
- weighted variants, where a neutral bed is common and conspicuous flourishes are rare;
- deterministic seeded choice for reproducible previews/renders;
- variation in voicing, texture, register, or ornament while preserving the motif and chord function.

Random pitch, random entry time, random phrase length, and unrestricted simultaneous variants multiply failure modes and weaken recall.

### 9. Harmonic continuity needs an explicit contract

Wwise/FMOD provide the timing and routing machinery, but middleware cannot guarantee that two clips are harmonically compatible. That remains a composition/content-authoring responsibility. The transition-rule and destination-marker designs make this division clear: tools determine *when and where* a transition can happen; authors provide assets whose source tail, transition, and destination entry work together. [Audiokinetic, “Defining Transitions Between Music Objects”](https://www.audiokinetic.com/en/library/edge/?source=Help&id=defining_transitions_between_music_objects) [FMOD Studio User Manual, “Music”](https://www.fmod.com/docs/2.03/studio/music.html)

A robust module library should therefore carry metadata such as key/mode, harmonic function at entry and exit, chord path, cadence class, pickup duration, phrase length, tempo, and allowed successors. Compatibility can then be represented as a small transition graph rather than guessed during playback.

### 10. Orchestration can be independent from musical form, but only if the arrangement was authored for interchangeability

The shared-clock/layer model in Wwise and parameter-conditioned instruments in FMOD support separation of **what the music says** (phrase, motif, harmony, cadence) from **which timbres say it** (piano, pings, strings, hybrid). [Audiokinetic, “Understanding Music Tracks”](https://www.audiokinetic.com/en/library/edge/?source=Help&id=understanding_music_tracks) [FMOD Studio User Manual, “Music”](https://www.fmod.com/docs/2.03/studio/music.html)

That independence is not automatic. Palettes need compatible roles and ranges:

- **piano:** attack plus harmony; leave rests and avoid constant arpeggiation;
- **digital pings:** sparse motif/accent role; short decay and restricted register so they do not become notification noise;
- **strings:** sustained support, voice-leading, swells, and occasional motif; avoid exposing solo gesture samples as random melody;
- **hybrid:** role assignment rather than “everything on”—for example, piano motif, soft string pad, and pings only on reveal accents.

### 11. Repetition and fatigue are controlled at several levels

The source systems provide tools for alternate playlists, transitions, layer changes, and parameter control. The musical solution is multi-scale:

1. **Moment scale:** do not react to every event; debounce and prioritize.
2. **Bar scale:** vary density/voicing while preserving pulse.
3. **Phrase scale:** rotate authored A/A′/B modules and manage recency.
4. **Section scale:** change harmonic destination or orchestration.
5. **Whole-piece scale:** maintain a narrative arc and avoid returning to “intro” after the climax.

Composer Mick Gordon’s account of *DOOM* is useful primary production evidence for building a system from authored musical building blocks, intensity, and implementation constraints rather than expecting middleware randomness to compose the result. [Mick Gordon, “DOOM: Behind the Music,” GDC 2017](https://www.gdcvault.com/play/1024415/-DOOM-Behind-the-Music)

The lesson is not to copy *DOOM*’s sound; it is to deliberately design the musical system and its content vocabulary together.

## Recommendations — application to Hopeful Song Studio

The following are design recommendations derived from the findings, not direct prescriptions from Wwise, FMOD, or the cited authors.

### A. Replace “random gesture audition” with “arrangement-path audition”

The core preview should audition a complete, legal path through a phrase graph, not trigger isolated samples. Every preview should answer four questions visibly:

1. Which phrase module is playing?
2. What narrative/intensity state is active?
3. Which palette and roles are active?
4. At what bar/phrase boundary will the next change occur?

Offer these audition modes:

- **Whole cue:** deterministic play-through from opening to final cadence.
- **Transition A → B:** one source phrase, transition, and destination phrase, with one-bar count-in.
- **State sweep:** Calm → Engaged → Build → Resolve at fixed, labeled boundaries.
- **Palette compare:** same exact arrangement and seed, switching only orchestration.
- **Loop stress test:** repeat the allowed middle-body logic for 2–3 minutes to expose fatigue.
- **Ending test:** start 8 or 16 bars before the planned logo/end card and verify the cadence lands exactly.

Do not include a “surprise me with notes” control. If a randomize button is retained, rename it **Generate arrangement variant** and randomize only legal module/alternate choices under a displayed seed.

### B. Use four palettes with explicit musical roles

Each phrase module should have role stems or equivalent event data: `motif`, `harmony`, `pulse`, `air`, and `accent`. Palette selection maps roles to instruments; form and harmony remain unchanged.

| Palette | Motif | Harmony/bed | Pulse | Accent | Guardrail |
|---|---|---|---|---|---|
| Piano | felt/soft piano | spaced piano voicings | low repeated note only in higher states | upper-register grace tone | cap note density; preserve rests |
| Digital pings | warm sine/mallet ping | very quiet filtered pad | soft clock-like tick | brighter two-note ping | accents only on marked beats; no UI-event chatter |
| Strings | restrained viola/violin section or quartet | legato lower strings | measured ostinato in Build only | authored swell/harmonic | no randomized solo violin gestures |
| Hybrid | piano carries motif | strings carry bed | muted digital pulse | ping on major reveal | prevent all roles from doubling the motif |

The studio should solo/mute **roles**, not arbitrary samples. Include loudness-normalized palette comparison so “more exciting” is not merely “louder.”

### C. Author a small phrase library before adding generative behavior

A sufficient first library for a roughly 45–75 second product cue:

- `OPEN_4`: 4 bars, establishes tonic/modal color and motif fragment.
- `A1_4`, `A2_4`: two neutral 4-bar continuation alternates, same entry/exit function.
- `DISCOVER_4`: 4 bars, harmonic lift for “show me step-by-step”/first clarity beat.
- `B1_4`, `B2_4`: 4-bar forward-motion alternates.
- `REVEAL_2` or `REVEAL_4`: controlled lift for the most important product reveal.
- `BUILD_4`: denser penultimate phrase, exits only to cadence.
- `CADENCE_4`: authored final phrase with logo/end-card sustain and render tail.
- Optional `BRIDGE_2`: neutral transition used only where editorial timing needs two bars.

Each alternate must be auditioned in every palette and every allowed layer subset. Start with **no randomness at all**; add A1/A2 or B1/B2 selection only after both paths pass continuity review.

### D. Adopt four named intensity states, with hysteresis and phrase-boundary commits

| State | Intended function | Active roles | Harmonic/form behavior |
|---|---|---|---|
| `calm` | intro, logs/problem setup | motif fragment + air/bed | tonic/pedal; sparse |
| `focused` | trace becomes legible, explanation begins | motif + harmony + light pulse | forward but stable |
| `uplift` | capabilities/reveals/subagent/timeline | fuller harmony + pulse + selected accent | higher register or pre-dominant lift |
| `resolve` | “beautiful,” welcome, CTA/logo | full but simplified texture, then release | fixed BUILD → CADENCE path |

State requests should queue until the next legal boundary. Require a minimum one-phrase dwell before reversing direction, except for the fixed ending trigger. If the video edit emits fine-grained “energy” values, smooth them and map them to states with hysteresis; never let frame-level changes toggle layers audibly.

### E. Make transitions and harmony data-driven

Represent compatibility explicitly. Suggested module schema:

```ts
type Palette = "piano" | "pings" | "strings" | "hybrid";
type Intensity = "calm" | "focused" | "uplift" | "resolve";
type Cadence = "open" | "half" | "authentic" | "plagal" | "none";

type PhraseModule = {
  id: string;
  bars: number;
  bpm: number;
  meter: [number, number];
  entryFunction: "tonic" | "predominant" | "dominant" | "neutral";
  exitFunction: "tonic" | "predominant" | "dominant" | "neutral";
  cadence: Cadence;
  pickupBeats: number;
  allowedNext: string[];
  allowedStates: Intensity[];
  stemsByPalette: Record<Palette, Partial<Record<
    "motif" | "harmony" | "pulse" | "air" | "accent",
    string
  >>>;
  variants?: { id: string; weight: number }[];
};
```

Planner rules:

- same BPM/meter in v1;
- commit layer changes at bars and module changes at phrase exits;
- allow a successor only if listed by `allowedNext` and harmonic entry/exit functions agree;
- account for pickup notes before the visual boundary;
- prohibit `CADENCE_4` except for the ending plan;
- prohibit leaving `resolve` once the final build begins;
- retain reverb/audio tails without delaying the next downbeat;
- use equal-power or authored crossfades, but never use a crossfade to conceal an illegal chord change.

### F. Treat stingers as scarce editorial punctuation

Create at most 2–3 stinger families:

- `insight`: subtle two-note motif confirmation;
- `reveal`: brighter motif completion for the key trace-view reveal;
- `logo`: not a free stinger—integrated into the final cadence.

Each has bar-compatible versions or a known pickup. Set cooldowns and priority. A lower-priority trigger is dropped if it would collide with a higher-priority stinger or cadence. For a fixed video, place stingers in the arrangement plan manually rather than responding to every on-screen event.

### G. Use deterministic constrained variation

Recommended v1 policy:

- seeded pseudo-random generator stored in the arrangement document;
- shuffle bag for equivalent phrase variants;
- no immediate repeat;
- conspicuous accent variant no more than once per section;
- maximum one non-bed variation decision per phrase;
- event log records every choice and its reason;
- exported arrangement resolves all choices to explicit module IDs and timestamps.

This makes an audition reproducible, renderable, and reviewable. The same seed and plan must produce the same event sequence; if audio rendering itself is offline, it should produce the same mix apart from documented DSP nondeterminism.

### H. Plan the fixed video backward from the ending

Interactive scores often need indefinite sustain; this product video does not. Exploit that advantage:

1. Lock end-card/logo onset and desired tail end.
2. Place `CADENCE_4` so its final arrival aligns with the logo/CTA, not after it.
3. Place `BUILD_4` immediately before it.
4. Fill the flexible middle backward with legal 4-bar modules.
5. If the edit is not bar-aligned, first adjust tempo modestly, then use a purpose-written 2-bar bridge; do not time-stretch every asset independently.
6. Make late editorial changes by choosing a known short/long route, not by truncating the cadence.
7. Render a tail (for example, 1.5–3 seconds as composition/mix requires) while ensuring the musical arrival happens on the intended frame.

For the storyboard in `trace-view-video.md`, a plausible narrative map is:

| Story beat | State/form suggestion |
|---|---|
| Logs / “no way I’m reading that” | `OPEN_4`, calm and sparse |
| Tree / step-by-step clarity | `A1_4` → `DISCOVER_4`, focused |
| Prompt/thinking/tool annotations | `B1_4`/`B2_4`, restrained forward pulse |
| Subagent grouping / timeline | `REVEAL_4`, uplift; one important stinger only |
| “Wow that’s beautiful” | `BUILD_4` begins, texture opens |
| “Welcome to Laminar trace view” / CTA / laminar.sh | fixed `CADENCE_4`, motif completion and clean tail |

Exact bars must be fitted to the locked edit duration; the table is a formal plan, not a timing claim.

## Implementation blueprint for this repository

### Repository observations

- `trace-view-video.md` contains the linear story beats and is the natural source for cue markers.
- The existing browser studio is a plain JavaScript application in `song-studio/`, with `songs.js`, `audio-engine.js`, `app.js`, and `styles.css` as its main seams.
- The modular paths below are architectural recommendations. They can be introduced incrementally inside `song-studio/` without adding a framework or moving unrelated trace-generator code.

### Proposed components/modules

Use the actual studio directory if one already exists; otherwise a contained structure such as this keeps engine logic testable without audio UI:

```text
studio/hopeful-song/
  model.ts                 # PhraseModule, Palette, Intensity, CuePlan schemas
  catalog.ts               # authored module metadata; no playback logic
  transition-graph.ts      # validates legal successors/harmonic contracts
  planner.ts               # storyboard markers -> deterministic arrangement
  scheduler.ts             # AudioContext look-ahead scheduling and quantization
  palette-mixer.ts         # role-to-stem mapping, gains, layer ramps
  variation.ts             # seeded PRNG, shuffle bags, recency/cooldowns
  transport.ts             # bars/beats/time conversion, seek, loop, count-in
  ending.ts                # backward placement of BUILD/CADENCE and tail
  Studio.tsx (or current UI entry)
  components/
    PaletteSelector.tsx
    StateLane.tsx
    ArrangementLane.tsx
    TransitionAudition.tsx
    RoleMixer.tsx
    EndingInspector.tsx
  __tests__/
    planner.test.ts
    transition-graph.test.ts
    variation.test.ts
    ending.test.ts
```

If the studio is plain HTML/JavaScript rather than React, preserve the same separations as ES modules instead of introducing a framework.

### Data flow

1. **Catalog load:** validate all phrase metadata, durations, stem roles, and successor IDs.
2. **Cue-plan load:** ingest locked storyboard timestamps and semantic labels.
3. **Plan:** place mandatory opening/build/cadence, then fill legal middle routes; resolve seeded alternates.
4. **Validate:** assert bar math, harmonic compatibility, state dwell, stinger cooldowns, and exact ending arrival.
5. **Schedule:** use a short Web Audio look-ahead scheduler; calculate against `AudioContext.currentTime`, not chained `setTimeout` callbacks.
6. **Mix:** apply palette role gains with short ramps at scheduled boundaries; keep all synchronized stems running if needed for phase/timeline stability.
7. **Export:** save a fully resolved arrangement manifest containing seed, modules, variants, palette, state changes, stingers, gains, and absolute times.

### Studio UI behavior

- Top-level controls: **Palette**, **Arrangement variant/seed**, **Play whole cue**, **Loop transition**, **Compare palettes**, **Jump to ending**.
- Timeline lanes: storyboard markers, phrase modules, intensity states, stingers, and final cadence.
- “Pending state” indicator: e.g. `uplift requested → commits at bar 13`.
- Transition inspector: source exit function, destination entry function, boundary, crossfade, pickup, and pass/fail validation.
- Role mixer: motif/harmony/pulse/air/accent with safe presets; prevent unsupported combinations.
- Fatigue panel: module recurrence counts, shortest recurrence distance, accent/stinger count, and palette density.
- Warnings should be concrete: `B2 → OPEN prohibited (narrative regression)`, `cadence begins 420 ms late`, or `ping accent repeats within 2 bars`.

### Acceptance tests for a future implementation

1. Same seed + cue plan produces byte-equivalent resolved arrangement JSON.
2. Every adjacent module pair is in `allowedNext` and passes harmonic-function validation.
3. Palette changes do not alter module timing, motif rhythm, or cadence arrival.
4. State requests inside a phrase commit only at the configured legal boundary.
5. No immediate phrase-variant repeat; shuffle bag behavior is exhaustive before reset.
6. Stinger cooldown/priority suppresses collisions deterministically.
7. The final cadence occurs exactly on the configured logo marker within an explicit tolerance (recommend ≤ one render sample offline; for browser audition, display measured scheduler deviation separately).
8. No path exits `resolve` or transitions away from the cadence.
9. Missing stem assets degrade by declared role fallback or validation error, never silent random substitution.
10. A 2–3 minute middle-loop stress test stays within configured recurrence and accent-density limits.

### Staged rollout

- **Phase 1 — authored deterministic cue:** one palette, fixed OPEN/A/B/BUILD/CADENCE route, marker-aligned ending.
- **Phase 2 — orchestration independence:** add all four palettes against the same role map; loudness-match and review each.
- **Phase 3 — state audition:** layer changes and two or three legal horizontal routes at phrase boundaries.
- **Phase 4 — constrained variants:** seeded shuffle bags, recency, and stinger priority.
- **Phase 5 — polish:** fatigue metrics, transition inspector, offline resolved-manifest export, and full-video review.

This order prevents “generative” features from hiding weaknesses in the underlying composition.

## Sources

### Kept

- [Audiokinetic Wwise Help — Interactive Music](https://www.audiokinetic.com/en/library/edge/?source=Help&id=interactive_music) — official middleware documentation; system overview.
- [Audiokinetic — Understanding the Interactive Music Hierarchy](https://www.audiokinetic.com/en/library/edge/?source=Help&id=understanding_interactive_music_hierarchy) — official object model for authored adaptive music.
- [Audiokinetic — Understanding Music Segments](https://www.audiokinetic.com/en/library/edge/?source=Help&id=understanding_music_segments) — official source for segment timing/entry/exit concepts.
- [Audiokinetic — Understanding Music Tracks](https://www.audiokinetic.com/en/library/edge/?source=Help&id=understanding_music_tracks) — official source for track/sub-track variation and layering.
- [Audiokinetic — Understanding Music Playlist Containers](https://www.audiokinetic.com/en/library/edge/?source=Help&id=understanding_music_playlist_containers) — official horizontal sequencing source.
- [Audiokinetic — Understanding Music Switch Containers](https://www.audiokinetic.com/en/library/edge/?source=Help&id=understanding_music_switch_containers) — official state/switch-driven selection source.
- [Audiokinetic — Defining Transitions Between Music Objects](https://www.audiokinetic.com/en/library/edge/?source=Help&id=defining_transitions_between_music_objects) — official transition-rule and sync source.
- [Audiokinetic — Using Stingers](https://www.audiokinetic.com/en/library/edge/?source=Help&id=using_stingers) — official event-linked musical punctuation source.
- [Audiokinetic — Understanding States / Switches / RTPCs](https://www.audiokinetic.com/en/library/edge/?source=Help&id=understanding_states) — official control-model source; related Switch and RTPC pages are cited inline.
- [FMOD Studio User Manual — Music](https://www.fmod.com/docs/2.03/studio/music.html) — official documentation for tempo, quantization, transitions, and destinations.
- [FMOD Studio User Manual — Parameters](https://www.fmod.com/docs/2.03/studio/parameters.html) — official parameter/state-control documentation.
- [FMOD Studio Examples](https://www.fmod.com/docs/2.03/studio/examples.html) — official practical examples accompanying the documented concepts.
- [LucasArts, US5315057A, “Dynamic music system”](https://patents.google.com/patent/US5315057A/en) — primary historical description of musically compatible interactive branching/transitions.
- [Mick Gordon, “DOOM: Behind the Music,” GDC 2017](https://www.gdcvault.com/play/1024415/-DOOM-Behind-the-Music) — composer primary production talk on designing a constrained music/content system.
- [Karen Collins, *Game Sound*, MIT Press](https://mitpress.mit.edu/9780262537773/game-sound/) — high-trust academic foundation for dynamic audio in games.
- [Michael Sweet, *Writing Interactive Music for Video Games*](https://www.pearson.com/en-us/subject-catalog/p/writing-interactive-music-for-video-games-a-composers-guide/P200000009925/9780321961587) — established practitioner reference on vertical/horizontal techniques and implementation planning.

### Dropped / not relied upon

- General “adaptive music” blog posts and vendor SEO pages — redundant and lower authority than Wwise/FMOD documentation.
- AI music-generator marketing materials — do not provide evidence for production-safe musical continuity, deterministic rendering, or transition behavior.
- YouTube tutorials by unverified third parties — potentially useful for UI demonstrations, but unnecessary where official manuals cover the feature.
- Wikipedia summaries — useful for orientation but not needed as evidence.

## Gaps and residual risks

- The available runtime did not expose a web-search/fetch tool, so citations were selected from known official/high-trust sources but were not live-checked during this run. Audiokinetic’s `edge` documentation routes may redirect or rename anchors as versions change; verify URLs and pin the project’s Wwise/FMOD version if implementation will directly mirror middleware behavior.
- The current Hopeful Song Studio uses synthesized Web Audio rather than recorded stem assets. Exact phrase lengths and cadence timing still require the locked video duration, frame rate, and final edit markers.
- “Hopeful” cannot be guaranteed by an algorithmic graph alone. A composer/audio designer must author and review the motif, voicings, samples, mix, and all legal transitions, especially strings and high-frequency pings.
- Browser audition timing is not equivalent to deterministic offline audio rendering. If frame/sample-accurate final delivery is required, export the resolved plan to an offline renderer or DAW and validate against the final picture.
- Accessibility and production concerns remain: provide a mute control, monitor integrated loudness and true peak, check speech masking, test laptop speakers/headphones, and confirm asset licensing.

## Concrete finding for parent review

- **High severity — design:** The current “random violin gesture” concept uses the wrong adaptive unit. Replace random note/gesture triggering with authored phrase modules, legal transition boundaries, explicit harmonic metadata, and deterministic constrained selection.
- **High severity — ending:** A fixed product video needs a reserved, authored `BUILD → CADENCE` route aligned backward from the logo/CTA. A continuously generative or indefinitely looping system cannot reliably deliver the planned ending.
- **Medium severity — architecture:** Keep phrase/form independent from palette via role stems, but validate every palette and allowed layer subset; orchestration interchangeability must be authored, not assumed.
- **Medium severity — UX:** Audition transitions and complete arrangement paths with visible state/boundary/seed information. Isolated sample audition is insufficient to judge adaptive music.
- **Path:** This report is written only to `/Users/kolbeyang/.pi/agent/sessions/--Users-kolbeyang-Documents-Programming-lmnr-root-signals-launch-video--/subagent-artifacts/outputs/ddde1ab1-257b-4cec-b19b-fc34ad2aa59d/research/adaptive-music-underscore-design.md`; no repository files were modified.

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "The report gives severity-ranked design findings, identifies the authoritative artifact path, distinguishes sourced findings from recommendations, and provides a repository-oriented implementation blueprint."
    }
  ],
  "changedFiles": [
    "/Users/kolbeyang/.pi/agent/sessions/--Users-kolbeyang-Documents-Programming-lmnr-root-signals-launch-video--/subagent-artifacts/outputs/ddde1ab1-257b-4cec-b19b-fc34ad2aa59d/research/adaptive-music-underscore-design.md"
  ],
  "testsAddedOrUpdated": [],
  "commandsRun": [
    {
      "command": "No shell commands available; inspected package.json, README.md, and trace-view-video.md using the file reader",
      "result": "passed",
      "summary": "Confirmed repository purpose/storyboard and that the visible package metadata does not identify the browser studio entry point."
    },
    {
      "command": "Write research artifact to authoritative runtime output path",
      "result": "passed",
      "summary": "Complete cited report written successfully; no project source files changed."
    }
  ],
  "validationOutput": [
    "Report covers vertical remixing, horizontal resequencing, transition sync, intensity/state models, motifs/stingers, generative versus authored content, constrained variation, harmonic continuity, orchestration independence, repetition/fatigue, and a fixed planned ending.",
    "Blueprint includes four selectable palettes, authored phrase modules, four intensity states, transition validation, deterministic variation, cadence planning, UI audition modes, proposed modules, and future acceptance tests.",
    "Sourced findings and project recommendations are explicitly separated."
  ],
  "residualRisks": [
    "Official source URLs were not live-checked because no web-search/fetch tool was available in this runtime.",
    "Actual Hopeful Song Studio source path and audio assets were not discoverable through the provided file interface.",
    "Exact phrase lengths and cadence timing require the locked edit duration, frame rate, tempo, and final audio assets."
  ],
  "noStagedFiles": true,
  "diffSummary": "Added one research artifact outside the repository worktree; no repository files modified.",
  "reviewFindings": [
    "high: current studio concept - random violin gestures are the wrong unit of adaptivity and should be replaced with authored phrase/layer choices",
    "high: ending design - reserve a deterministic BUILD to CADENCE path aligned to the product-video end card",
    "medium: audition UX - compare full legal arrangement paths and palettes rather than isolated random samples",
    "medium: source verification - live-check official documentation URLs before implementation"
  ],
  "manualNotes": "The report intentionally proposes paths because no existing Hopeful Song Studio source entry point was visible. No files were staged and no repository source was edited."
}
```
