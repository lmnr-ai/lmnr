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

### Integration boundary

The new recording is delivered alongside the latest editable animation for subsequent narration alignment. It has **not** been substituted blindly into the existing per-phrase `editable-v11` schedule, stretched to the picture, or mixed into the existing soundtrack. The existing preview narration, historical audio, saved edits, and prior cuts remain intact. No new flattened MP4 is claimed by this handoff.
