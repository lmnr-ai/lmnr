# Approved voiceover — A / subtle

The user listened to three treatments of their latest DJI Mic recording and
selected **A (subtle)**. Use this approved file as the replacement narration
source for the next integration pass:

**[voice_A_subtle.wav](../../public/audio/voiceover/voice_A_subtle.wav)**

## Asset and verification

- Source recording: `Signals-launch-video-09-29-09-56.m4a` (the latest Downloads M4A when selected).
- Stereo 48 kHz, 24-bit PCM WAV; duration **70.101333 seconds**.
- Measured final loudness: **−16.03 LUFS**, true peak **−1.54 dBTP**.
- SHA-256: `af92601ff5a34753d0c637b023280a8374fdc35ff6f7fecca7bf720f51d40640`.
- Copied byte-for-byte from the user-approved Downloads WAV; source hash verified.
- [processing.json](processing.json) records filters, normalization, source/output hashes and measured format/loudness. `verified_loudness.input_*` describes the delivered WAV; `output_*` describes the diagnostic loudnorm simulation, not another applied processing pass.

The chain is highpass 80 Hz → −2 dB at 250 Hz → +2 dB at 3.5 kHz → +2 dB
high shelf at 9 kHz → deesser 0.3 → gentle 2:1 compression → loudness
normalization. No denoise in this version. Normalization was measured and
refined from the original input to reach the target; effects were not stacked.

## Next agent: integrate, do not simply replace the mixed soundtrack

1. This is **speech only**, not a music/foley mix and not a timeline-aligned export.
   It has **not yet been transcribed, split, aligned, or wired into playback**.
2. This is a different take from the currently integrated
   `Signals-launch-09-29-10-04.m4a`. Establish its phrase boundaries rather than
   reusing the old take's source timestamps. Do not time-stretch narration.
3. Follow the editable phrase/transport pipeline documented in
   `handoff/voiceover-issues4/`, `handoff/voiceover-captions/`, and
   `handoff/voiceover-soak/`. Preserve existing recordings, prepared sources,
   score/foley, historical mixes, original cut, and custom timeline settings.
4. Create newly named prepared assets/manifests and keep preview/export audio
   consistent. Check voice/bed balance: this WAV is already normalized; do not
   blindly add another mastering pass or duplicate the existing voice track.
5. Validate phrase alignment, arbitrary/reverse seeking, silent paused inspection,
   one audio owner, and a fresh MP4 export before calling integration complete.

The subsequent [latest Ultimate3 handoff](../latest-ultimate3/README.md) also
synchronizes the separate `signals-launch-video` checkout's latest visual and
timing changes. The existing audio integration is intentionally unchanged;
this approved replacement recording still needs integration.

## Integration (editable-v8)

The A/subtle take now drives the editable cut (`?experiment=micro-18`). The picture is the
[latest Ultimate3](../latest-ultimate3/README.md) cut unchanged: 2315 frames, chapters
0 / 22.41 / 36.11 / 51.302 / 70.61s. `processing.json` is left as delivered.

- **Split.** Whisper (medium.en) located the 23 phrases; each cut sits in silence on the
  speech envelope (about 70ms pre-roll, 120ms tail), or at the quietest frame between words
  on tight joins (n03|n04, n18|n19, n20|n21). There is no time-stretch and no second mastering
  pass: each trim is sample-identical to the WAV. n08's label follows the take ("Powerful
  LLMs find deep issues,"). Captions already matched the script.
- **Placement.** Each phrase's speech onset lands on the 10-04 take's (editable-v7) onset,
  so the picture cues are unchanged. The one exception is n12, which stays at 41.75s so the
  flow-1 reveal does not move ("surpassing" starts 45ms earlier). No phrases overlap; the
  closest gap is 0.11s (n14→n15).
- **Balance.** Gated, these trims measure 1dB under the 10-04 trims (-15.9 vs -14.9 LUFS), so
  the bed drops from -5.5dB to -6.5dB instead of re-mastering the voice.
- **Bed.** It is rescored to the latest settings (cloud entry and faster explanation typing).
- [placements.json](placements.json) holds the source `a`/`b` and timeline `at` for each phrase;
  [default-settings.json](default-settings.json) holds the current `VOICEOVER_DEFAULTS`.
- `node scripts/build-ultimate3-issues4-vo.mjs editable-v8 voiceover-subtle-a voice_A_subtle.wav`
  wrote `public/audio/voiceover/editable-v8/`. `scripts/export-ultimate3-editable-vo.ts` now
  reads the current edition.
- Storage holding editable-v5/v6/v7 generated phrase slots switches to these phrases one by
  one. Authored slots stay, with durations capped to the new trims; historical cuts stay literal.

Published render: `lam-2305/ultimate3-subtle-a-arabesque-voiceover.mp4`. It uses the same mix
chain as voiceover-soak and measures -14.9 LUFS, -1.0 dBTP.
