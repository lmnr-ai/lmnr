import {useCurrentFrame, useVideoConfig} from 'remotion';
import {DITHER_DEFAULTS, type DitherState} from '../experiments/micro-08/dither';
import {MICRO_10_DEFAULTS, sampleMicro10, type Micro10Controls} from '../experiments/micro-10/geometry';
import {Micro10Scene} from '../experiments/micro-10/Scene';

export type MicroAnimation10Props = Micro10Controls & DitherState;

export const MicroAnimation10 = (props: MicroAnimation10Props) => {
  const {fps} = useVideoConfig();
  const controls = {
    streamerSpeed: props.streamerSpeed,
    loaderSpeed: props.loaderSpeed,
    squishPeriod: props.squishPeriod,
    widthAmount: props.widthAmount,
    heightAmount: props.heightAmount,
    shrinkAmount: props.shrinkAmount,
    puffRandomSeed: props.puffRandomSeed,
    puffLifetime: props.puffLifetime,
    puffTravel: props.puffTravel,
    puffSize: props.puffSize,
    puffEndScale: props.puffEndScale,
    puffXOffset: props.puffXOffset,
    puffYOffset: props.puffYOffset,
    puffVerticalDrift: props.puffVerticalDrift,
    puffFadeStart: props.puffFadeStart,
    puffOpacity: props.puffOpacity,
    puffBrightness: props.puffBrightness,
  };
  const dither = {
    pixelSize: props.pixelSize,
    colorLevels: props.colorLevels,
    contrast: props.contrast,
    intensity: props.intensity,
  };
  return <Micro10Scene {...sampleMicro10(useCurrentFrame() / fps, controls)} dither={dither}/>;
};

export const MICRO_10_VIDEO_DEFAULTS: MicroAnimation10Props = {...MICRO_10_DEFAULTS, ...DITHER_DEFAULTS};
