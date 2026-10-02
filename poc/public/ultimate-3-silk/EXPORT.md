# Ultimate 3 — Silk: exact current-settings export

Default is **SFX-only (music off)**. The original `MicroAnimation18` composition and its legacy offline export are separate and unchanged.

1. In `?experiment=ultimate-3-silk`, set the Main/detail timing and all seven Silk gains. Open **Silk mix & downloads**, choose **Prepare export project JSON**, then save the prepared JSON somewhere you choose. This is `{settings, mix}` for the displayed authoring state; it is not the old Settings JSON (which contains no mix).
2. From `poc`, generate a **new** public asset directory:

   ```sh
   pnpm exec tsx scripts/render-ultimate3-silk.ts \
     --project /absolute/path/ultimate3-silk-project.json \
     --out public/ultimate-3-silk/exports/my-edit
   ```

   Or supply `--settings settings.json --mix mix.json --out ...` explicitly. Never substitute default WAVs for edited settings. The CLI writes aligned pre-fader stems, the SFX-only/current mixes, verified manifest, cue manifest, settings/mix, and `remotion-props.json`. A mix with music >0 includes the approved shared uncompressed Sangers PCM interpretation, not the legacy browser engine. The shared conservative headroom policy below and excessive resource requirements fail explicitly.
3. Render a matching **intermediate picture** (installed Chrome, WebGL ANGLE). Its Remotion audio is NOT the final delivery audio:

   ```sh
   pnpm exec remotion render src/video/index.ts Ultimate3Silk \
     out/ultimate3-silk/my-edit-picture.mp4 \
     --props=public/ultimate-3-silk/exports/my-edit/remotion-props.json \
     --browser-executable='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
     --gl=angle --concurrency=2
   ```

   Metadata and the composition validate normalized settings/recipe/score/assets/mix identity AND the current WAV's SHA-256 and format before mounting audio. Retiming against the default directory, an unmatched music gain, a missing file, or corrupted/stale WAV fails clearly. Do not rebuild a directory while a render is using it; create a fresh directory instead.

4. **Required final mux**, copying picture packets unchanged and encoding the validated canonical WAV:

   ```sh
   pnpm exec tsx scripts/mux-ultimate3-silk.ts \
     --props public/ultimate-3-silk/exports/my-edit/remotion-props.json \
     --picture out/ultimate3-silk/my-edit-picture.mp4 \
     --out out/ultimate3-silk/my-edit.mp4
   ```

   Only this final file is deliverable. Inputs/settings/score/mix/WAV hashes are verified before and after mux; video packet SHA must be unchanged. The command validates normal decoded presentation sync before publishing and writes `<output>.mux.json` with exact provenance and measurements. Keep the intermediate picture and receipt for reproducibility. The intermediate's audio is ignored, not adjusted or reused.

   For an excerpt, render that exact global range with Remotion (e.g. `--frames=900-1199`), then pass **both** `--start-frame 900 --frames 300` to the mux command. Picture must already be the300-frame excerpt with local start0; audio is read from global30s of the matching canonical WAV, never from WAV zero.

   The former direct Remotion MP4s had a **real uncompensated2048-sample/42.667ms delay**, not harmless priming. Final AAC now begins with PTS=-1024 and Skip Samples=1024 followed by PTS0; ordinary ffmpeg/player presentation decode has zero measured residual lag. Verification requires <=1sample (20.83µs, decoder rounding allowance), zero-lag correlation>=.995 and signal/error>=30dB, without manually removing a lag. AAC remains lossy; container tail padding is checked separately. A truly silent mix has no measurable lag and is checked for silence plus packet/timestamp validity.

For the default edition: run `pnpm exec tsx scripts/render-ultimate3-silk.ts`, then the render command with `--props=public/ultimate-3-silk/default/remotion-props.json`. Use a separate intermediate picture path and finish with the same required mux command. Default output is intentionally labelled **SFX-only (music off)**.

Browser WAVs use the exact same PCM renderer: **Prepare current mix WAV**, **Prepare SFX-only WAV**, and each raw stem. A prepared Save link belongs to the displayed settings/mix and is revoked on any edit or unmount; only one link/Blob is retained. Preparing a new file replaces the old link. Sliders change live GainNodes, not full PCM buffers. Mix summation/export is performed only when requested.

**Shared fail-closed headroom policy:** once per immutable PCM generation, compute each bus's absolute stereo peak. A mix is valid only if `master × sum(busGain × busPeak) < 1 - 1e-6`; the1e-6 reserve covers float32 gain/addition rounding. This is a **conservative bound, not the measured exact mixed peak**: it can reject mathematically safe non-overlapping or cancelling mixtures. The same bound applies before live gains/AudioBuffer installation, current/SFX WAV downmix and export validation. Invalid requested gains stay visible/persisted for correction, but playback stops and a clear warning appears. Safe corrections recover automatically; there is no limiter, normalization or fallback to another mix. Raw pre-fader stems and project JSON remain available. The optional music-enabled reference WAV is omitted if that different reference mix fails the bound; it does not invalidate a safe requested current mix. Browser downloads are not automatically published anywhere.

Carry `CREDITS.md` with redistributed sample-containing audio/video: Alexander Holm / Salamander Grand Piano / CC BY 3.0. Prepared source hashes, modifications and the uncompressed optional-music/24-bit-in-float interpretation are recorded in manifests. This document and automated validation establish reproducibility, not listening acceptance.
