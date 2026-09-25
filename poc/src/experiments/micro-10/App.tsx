import {useEffect, useRef} from 'react';
import {DialRoot, DialTimeline, useDialKit, useDialTimeline} from 'dialkit';
import {ExperimentPicker} from '../ExperimentPicker';
import {useAutomaticAudio} from '../automatic-audio';
import {DITHER_DEFAULTS} from '../micro-08/dither';
import {MICRO_10_DEFAULTS, sampleMicro10} from './geometry';
import {Micro10Scene} from './Scene';
import {Micro10AudioEngine, micro10AudioEventsBetween} from './sound';
import {MICRO_10_TIMELINE, MICRO_10_TIMELINE_ID} from './timeline';

export const Micro10App = () => {
  const timeline = useDialTimeline('Cloud streamer — Master (seconds)', MICRO_10_TIMELINE, {
    id: MICRO_10_TIMELINE_ID, autoplay: true, loop: true, persist: true,
  });
  const motion = useDialKit('Motion', {
    streamerSpeed: [MICRO_10_DEFAULTS.streamerSpeed, 0, 1200, 10],
    loaderSpeed: [MICRO_10_DEFAULTS.loaderSpeed, 0, 6, .05],
    squishPeriod: [MICRO_10_DEFAULTS.squishPeriod, .2, 5, .05],
    widthAmount: [MICRO_10_DEFAULTS.widthAmount, 0, .45, .01],
    heightAmount: [MICRO_10_DEFAULTS.heightAmount, 0, .45, .01],
    shrinkAmount: [MICRO_10_DEFAULTS.shrinkAmount, 0, .45, .01],
  }, {id: 'micro-animation-10-motion-v3', persist: true});
  const smoke = useDialKit('Smoke puffs', {
    puffRandomSeed: [MICRO_10_DEFAULTS.puffRandomSeed, 0, 9999, 1],
    puffLifetime: [MICRO_10_DEFAULTS.puffLifetime, .2, 8, .05],
    puffTravel: [MICRO_10_DEFAULTS.puffTravel, 0, 1000, 5],
    puffSize: [MICRO_10_DEFAULTS.puffSize, 20, 400, 2],
    puffEndScale: [MICRO_10_DEFAULTS.puffEndScale, 0, 1.5, .01],
    puffXOffset: [MICRO_10_DEFAULTS.puffXOffset, -600, 600, 2],
    puffYOffset: [MICRO_10_DEFAULTS.puffYOffset, -300, 300, 2],
    puffVerticalDrift: [MICRO_10_DEFAULTS.puffVerticalDrift, -400, 400, 2],
    puffFadeStart: [MICRO_10_DEFAULTS.puffFadeStart, 0, .99, .01],
    puffOpacity: [MICRO_10_DEFAULTS.puffOpacity, 0, 1, .01],
    puffBrightness: [MICRO_10_DEFAULTS.puffBrightness, 0, 2, .01],
  }, {id: 'micro-animation-10-smoke-v3', persist: true});
  const dither = useDialKit('Paper dithering — Cloud photo', {
    pixelSize: [DITHER_DEFAULTS.pixelSize, 1, 8, .5],
    colorLevels: [DITHER_DEFAULTS.colorLevels, 2, 16, 1],
    contrast: [DITHER_DEFAULTS.contrast, .5, 2, .05],
    intensity: [DITHER_DEFAULTS.intensity, 0, 1, .01],
  }, {id: 'micro-animation-10-dither-v2', persist: true});
  const mix = useDialKit('Sound mix', {
    tickVolume: [1, 0, 1.5, .01],
    puffVolume: [1, 0, 1.5, .01],
    droneVolume: [1, 0, 1.5, .01],
  }, {id: 'micro-animation-10-sound-mix-v1', persist: true});
  const query = new URLSearchParams(window.location.search);
  const requested = Number(query.get('time'));
  const inspecting = query.has('time') && Number.isFinite(requested);
  const time = inspecting ? Math.max(0, requested) : timeline.time;
  const audio = useRef<Micro10AudioEngine | null>(null);
  const previousTime = useRef(time);
  if (!(audio.current instanceof Micro10AudioEngine)) {
    (audio.current as {dispose?: () => void} | null)?.dispose?.();
    audio.current = new Micro10AudioEngine();
  }

  const playbackWanted = !inspecting && timeline.playing;
  const readyAttempt = useAutomaticAudio(audio.current, playbackWanted);
  useEffect(() => () => audio.current?.dispose(), []);
  useEffect(() => audio.current?.setMix(mix), [mix.droneVolume, mix.puffVolume, mix.tickVolume]);
  useEffect(() => {
    if (playbackWanted && readyAttempt > 0) audio.current?.startDrone();
    else audio.current?.pause();
  }, [playbackWanted, readyAttempt]);
  useEffect(() => {
    const previous = previousTime.current;
    previousTime.current = time;
    if (!playbackWanted || readyAttempt === 0) return;
    const timing = {
      duration: timeline.duration,
      puffOffset: timeline.puffs.at,
      puffInterval: timeline.puffs.duration,
      tickOffset: timeline.tick.at,
      tickInterval: timeline.tick.duration,
    };
    const events = time >= previous
      ? micro10AudioEventsBetween(previous, time, timing)
      : [...micro10AudioEventsBetween(previous, timeline.duration, timing), ...micro10AudioEventsBetween(-1e-6, time, timing)];
    for (const event of events) audio.current?.play(event.kind);
  }, [playbackWanted, readyAttempt, time, timeline.duration, timeline.puffs.at, timeline.puffs.duration, timeline.tick.at, timeline.tick.duration]);

  return <main className="micro10-app">
    <div className="micro10-stage"><Micro10Scene {...sampleMicro10(time, {...motion, ...smoke}, {at: timeline.puffs.at, duration: timeline.puffs.duration})} dither={dither}/></div>
    <ExperimentPicker current="micro-10"/><DialRoot/><DialTimeline/>
  </main>;
};
