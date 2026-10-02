# Ultimate 3 — Silk sound design: audio credits

The rotor, restrained physical accents, glass component and chapter-aware SFX arrangement are original project synthesis. No legacy effect audio, reference-video audio, downloaded replacement soundtrack, paid service or model-generated audio is used.

## Sampled ornaments — attribution required with distributed film/audio

Contains modified **Salamander Grand Piano / Yamaha C5 samples by Alexander Holm**, licensed **CC BY 3.0 Unported**: https://creativecommons.org/licenses/by/3.0/ . No endorsement is implied.

Existing local Tonejs distribution: https://github.com/Tonejs/audio/tree/efd8296360f9526e379bfbe5c1698ff54d6a1d34/salamander . Pinned commit: `efd8296360f9526e379bfbe5c1698ff54d6a1d34`.
Upstream credit/license README: https://raw.githubusercontent.com/Tonejs/audio/efd8296360f9526e379bfbe5c1698ff54d6a1d34/salamander/README .

`piano/manifest.json` preserves source filenames, URLs and SHA-256 hashes, authoritative prepared-PCM hashes and preparation details. Four verified local MP3 notes (F#5, A5, D#6, F#6) were decoded once with ffmpeg into mono 48kHz little-endian float32, retaining their first second. Browser and CLI use identical prepared bytes, not independent MP3 decoders. The renderer removes the hammer onset plus 9ms, transposes at most one semitone, filters toward upper string partials, blends a quiet synthetic glass component, adds soft envelopes, pan and short reflections. Pitch-reference calibration is fixed, not per-cue/per-film normalization. These are transformed samples, not a newly recorded acoustic performance or wholly synthesized piano.

Credit must accompany the prepared piano assets, sparkle stem and any full mix/film containing that stem. Suggested short credit:

> Contains modified Salamander Grand Piano samples by Alexander Holm, CC BY 3.0. Samples filtered, transposed, shortened and arranged into sound-design ornaments.

## Optional music (OFF by default)

The existing project's Schubert **Sängers Morgenlied D.163** arrangement is retained through `ultimate3SangersMusicPlan`; no new score was composed. The optional music stem uses original oscillator synthesis, not these piano samples. Its PCM adapter preserves the existing arrangement, partial frequencies, envelopes, pans and chapter orchestration multipliers. It is an **uncompressed PCM interpretation**, not bit-identical legacy WebAudio: triangle generation and filter phase differ. The original music engine is untouched. A short-film-safe 80ms terminal fade fits the normalized film endpoint instead of extending the picture for the original finale's overhang. Parent approved these technical differences, not the unheard final timbre.

This notice does not license project artwork or other unrelated assets under CC BY.
