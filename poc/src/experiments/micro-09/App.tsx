import {DialRoot, DialTimeline, useDialKit, useDialTimeline} from 'dialkit';
import {ExperimentPicker} from '../ExperimentPicker';
import {DITHER_DEFAULTS} from '../micro-08/dither';
import {Micro09Scene} from './Scene';
import {sampleMicro09} from './sample';
import {SPARKLE_DEFAULTS} from './sparkle';
import {MICRO_09_TIMELINE, MICRO_09_TIMELINE_ID} from './timeline';

export const Micro09App = () => {
  const timeline = useDialTimeline('Cloud reveal — Master (seconds)', MICRO_09_TIMELINE, {
    id: MICRO_09_TIMELINE_ID, autoplay: false, loop: false, persist: true,
  });
  const sparkle = useDialKit('Sparkle', {
    seed: [209, 0, 9999, 1],
    clockFrequency: [SPARKLE_DEFAULTS.clockFrequency, 1, 30, 1],
    triangleProbability: [SPARKLE_DEFAULTS.triangleProbability, 0, 1, .01],
    stateChangeProbability: [SPARKLE_DEFAULTS.stateChangeProbability, 0, 1, .01],
    colorChangeProbability: [SPARKLE_DEFAULTS.colorChangeProbability, 0, 1, .01],
    isolationWeight: [SPARKLE_DEFAULTS.isolationWeight, 0, 12, .25],
  }, {id: 'micro-animation-09-sparkle-v8', persist: true});
  const cloudLayout = useDialKit('Cloud layout', {
    finalYOffset: [27, -400, 400, 1],
  }, {id: 'micro-animation-09-cloud-layout-v3', persist: true});
  const textLayout = useDialKit('Signals text', {
    yOffset: [-36, -300, 300, 1],
  }, {id: 'micro-animation-09-text-layout-v2', persist: true});
  const dither = useDialKit('Paper dithering — Clouds', {
    pixelSize: [DITHER_DEFAULTS.pixelSize, 1, 8, .5],
    colorLevels: [DITHER_DEFAULTS.colorLevels, 2, 16, 1],
    contrast: [DITHER_DEFAULTS.contrast, .5, 2, .05],
    intensity: [DITHER_DEFAULTS.intensity, 0, 1, .01],
  }, {id: 'micro-animation-09-dither-v1', persist: true});
  const query = new URLSearchParams(window.location.search);
  const requested = Number(query.get('time'));
  const sampled = query.has('time') && Number.isFinite(requested)
    ? sampleMicro09(requested)
    : {time: timeline.time, progress: timeline.clouds.current.progress};
  const requestedSeed = Number(query.get('seed'));
  const seed = query.has('seed') && Number.isFinite(requestedSeed) ? requestedSeed : sparkle.seed;
  const numberFromQuery = (key: string, fallback: number) => {
    const value = Number(query.get(key));
    return query.has(key) && Number.isFinite(value) ? value : fallback;
  };
  const cloudYOffset = numberFromQuery('cloudYOffset', cloudLayout.finalYOffset);
  const signalsYOffset = numberFromQuery('signalsYOffset', textLayout.yOffset);
  const sparkleControls = {
    clockFrequency: numberFromQuery('clockFrequency', sparkle.clockFrequency),
    triangleProbability: numberFromQuery('triangleProbability', sparkle.triangleProbability),
    stateChangeProbability: numberFromQuery('stateChangeProbability', sparkle.stateChangeProbability),
    colorChangeProbability: numberFromQuery('colorChangeProbability', sparkle.colorChangeProbability),
    isolationWeight: numberFromQuery('isolationWeight', sparkle.isolationWeight),
  };
  return <main className="micro09-app">
    <div className="micro09-stage"><Micro09Scene {...sampled} seed={seed} sparkle={sparkleControls} cloudYOffset={cloudYOffset} signalsYOffset={signalsYOffset} dither={dither}/></div>
    <ExperimentPicker current="micro-09"/><DialRoot/><DialTimeline/>
  </main>;
};
