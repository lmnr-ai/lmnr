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
