# Agent clicks (live preview)

`ratchet-click.ts` contains the shared transient-only recipe and pure event sampler. `use-ratchet-clicks.ts` handles playback/unlock/pause; `micro-16/cost-ratchet.ts` derives Cost tracks from authored source timing and screen-space positions.

| Agent | Note | Steady cadence |
| --- | --- | --- |
| Ultimate 2 | G3 / MIDI 55 | 9.54 clicks/s |
| Cost yellow | G4 / MIDI 67 | 16.47 clicks/s |
| Cost purple | G2 / MIDI 43 | 7.65 clicks/s |

The base is the supplied “soft pawl no whirr” preset: speed .16, volume .41, click level .25, tone .25, 62ms decay, brightness .3, Q1.5 and three teeth/turn. The video recipe intentionally excludes the soundboard's sustained low-body oscillator, even though the original preset has nonzero power. It contains no noise, whirr, or reverb source.

- Ultimate 2 replaces stream ticks only; puffs and other effects remain. Its existing Tick Volume controls the new sound. The three-second stream fade remains, with frequency ramp-down and source/chapter trim guards.
- Cost has `ratchetVolume`; Ultimate 3 has `costRatchetVolume`. Yellow passes each have compact ramps. Purple rightward movement decelerates, stationary gaps have zero cadence, descent accelerates/decelerates, and the later budget agent slows with depletion.
- Stereo pan follows camera-relative horizontal position, capped at 85% left/right. Vertical travel does not artificially sweep stereo position.
- Cadence integrates absolute authored time, independent of frame partitioning. Reverse/large seeks and paused inspection do not replay missed ticks. Each strike lasts 62ms plus a short source cutoff; silence between stopped motion segments has no underlying drone.

These effects are wired into standalone Micro16/Micro17 and their Micro18 chapters. They do not add an audio soundtrack to Remotion exports. Human listening approval is separate from numerical PCM and browser event checks.
