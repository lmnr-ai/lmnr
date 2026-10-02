# Latest Ultimate 3 + October 2 narration

Prepared on `feat/LAM-2316-turbopuffer-sound-design` after fetching and pulling its latest remote head, `5ce52252371062f97711006b033b0a70ae6b6b03`.

## Audio

- `original.m4a`: untouched latest Downloads recording, originally `Signals-launch-video-10-02-09-47.m4a`.
- `voice_A_subtle.wav`: production master, stereo 48 kHz / 24-bit PCM, 73.898667 seconds.
- `voice_A_subtle.m4a`: AAC 320 kbps listening copy. Also saved in Downloads as `Signals-launch-video-10-02-09-47-A-subtle.m4a`.
- `voice_processing_report.json`: exact filters, measured normalization parameters, verified WAV loudness and hash.
- `process_voice.py`: the same processing script used for earlier recordings. Only its approved `voice_A_subtle` configuration was selected for this delivery; no B/C variants were rendered.
- `provenance.json`: source and processed media hashes.

Processing: 80 Hz high-pass, -2 dB at 250 Hz, +2 dB at 3.5 kHz, +2 dB high shelf at 9 kHz, de-esser intensity 0.3, and 2:1 compression with 10 ms attack / 100 ms release / unity makeup. Two-pass loudness normalization targets -16 LUFS and at most -1.5 dBTP. The final WAV measures **-15.96 LUFS / -1.54 dBTP**. No trimming, tempo/pitch change, or special “with Laminar” gain boost was applied. The AAC copy is derived from the processed WAV, not from an additional processing pass.

## Latest editable animation

The actual animation source is updated in `poc/src/experiments/`, not merely included as a screenshot or flattened video.

- Open `?experiment=micro-18` in the existing preview; use a fresh browser profile or import `preview-settings.json` to see the shared current defaults without overwriting saved edits.
- `preview-settings.json` serializes `CURRENT_VOICEOVER_DEFAULTS`; `animation.json` records the separate soundtrack/mix and frame settings.
- 1280×720, 30 fps, **2212 frames**; paper off; **Glide · minimal (linger)**, master 6.98.
- Approved 31-clip Main defaults; 1.5 seconds transferred from Ultimate 2's ending into Cost's opening; native **Clouds Slide Out** and **Yellow Agent Zip** authoring.
- Intelligence: flow-1 **74.1%**, Opus 5 **84.8**, Sonnet 5 **77.3**, GPT-6 Sol **72.8**. Flow/Sol spacing matches Gemini/Luna; Opus's point has top clearance to avoid clipping its label.
- Subtitle: **“Matching GPT-6-Sol in intelligence, while analyzing 20 times more traces per dollar.”**
- Pricing: **888 vs 38** traces per dollar, retaining the **20×** headline and the left-aligned 28-dot final row.
- `clip.current`, DialKit timelines, springs/curves, reverse seeking, and the exact production handoff comment remain intact.

### Integration: editable-v12

The take is now cut into the preview and export as **`editable-v12`** (`public/audio/voiceover/voice_A_subtle-2026-10-02.wav`, `chain: 'anull'`, bed -6.5 dB: it measures -15.9 LUFS against the old take's -16.0).

- `placements.json` holds the 23 trims (`a`/`b` in the take, silences cut) and timeline slots. Every phrase keeps its editable-v11 speech onset except two:
  - **n12** "Matching GPT-6 Sol in trace analysis intelligence," starts at **33.91**, where the peers' bead bar ends; Flow's dot can't land earlier. "Matching" leads it by 72 ms, as before.
  - **n13** moves **+0.3 s** to 37.60, and the Flow comparison clips move with it. `comparison.returnToGrid` starts 0.25 s later and is 0.25 s shorter, so the grid return still ends at 41.33 after n13 finishes. The frame count is unchanged at **2212**.
- n23's trim starts at 70.95. The take's first 0.44 s there was silence, so "with Laminar" lands on the old 67.185 onset.
- `default-settings.json` serializes `CURRENT_VOICEOVER_DEFAULTS` (the picture in `preview-settings.json` plus these slots). Saved browser settings move once (`voiceoverTakeVersion: 2`, with a backup in `ultimate3-before-voiceover-take-v2`). Only phrases still on their editable-v11 slots and an untouched comparison move; edits and imports stay literal.
- **Glide · minimal (linger)** is rebuilt as `editable-v12-glide-minimal-linger/`. Music cues differ only in Flow (34.76–41.33): the last bead drop moves to 34.76, the comparison cues move +0.3, and the return to 40.32.
- Mix: -16.3 LUFS and -1.09 dBTP, with the bed at -22.7 LUFS. "with Laminar" clears the bed by 8.8 dB (6.3 before). n21 and n23 were spoken 1.4–2.2 dB softer in this take, so they sit closer to the bed. No phrase gain was applied.
- The subtitle still reads "Matching GPT-6-Sol in intelligence…", but the narration says "in trace analysis intelligence".
- The other Glide beds stay on disk in `editable-v11-*` with the earlier take. They are off the soundtrack menu because their ducking is keyed to the old phrases.
- Video: https://svwyososwvsgouxwfdlc.supabase.co/storage/v1/object/public/lmnr-coding-agent/lam-2316/ultimate3-glide-minimal-linger-oct2-voiceover.mp4
