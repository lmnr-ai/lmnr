import type {CSSProperties} from 'react';
import {staticFile} from 'remotion';
import type {Micro03Values} from './timeline';

const FLOW = staticFile('micro-03/flow.svg');
const JET_IMAGE = staticFile('micro-03/jet-image.png');


const COMPLETE: Micro03Values = {
  atmosphere: 1,
  flow: 1,
  flight: 1,
  atmosphereOutro: 0,
  flowOutro: 0,
  streamsOutro: 0,
  planeOutro: 0,
};
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const lerp = (from: number, to: number, progress: number) => from + (to - from) * progress;
const stagedBlur = (
  start: number,
  animate: number,
  end: number,
  introProgress: number,
  outroProgress: number,
) => lerp(lerp(start, animate, introProgress), end, outroProgress);

const StreamLines = () => (
  <>
    <i className="micro03-stream micro03-stream-white" />
    <i className="micro03-stream micro03-stream-orange-thin" />
    <i className="micro03-stream micro03-stream-hairline" />
    <i className="micro03-stream micro03-stream-orange" />
  </>
);

interface Micro03SceneProps {
  values?: Micro03Values;
  time?: number;
  flowEnterBlur?: number;
  flowAnimateBlur?: number;
  flowExitBlur?: number;
  planeStartBlur?: number;
  planeAnimateBlur?: number;
  planeEndBlur?: number;
  trailNearStartBlur?: number;
  trailNearAnimateBlur?: number;
  trailNearEndBlur?: number;
  trailMiddleStartBlur?: number;
  trailMiddleAnimateBlur?: number;
  trailMiddleEndBlur?: number;
  trailFarStartBlur?: number;
  trailFarAnimateBlur?: number;
  trailFarEndBlur?: number;
  leftCloudY?: number;
}

export const Micro03Scene = ({
  values = COMPLETE,
  time = 3,
  flowEnterBlur = 15,
  flowAnimateBlur = 0,
  flowExitBlur = 6,
  planeStartBlur = 10.6,
  planeAnimateBlur = 4.6,
  planeEndBlur = 7.2,
  trailNearStartBlur = 7,
  trailNearAnimateBlur = 0,
  trailNearEndBlur = 9,
  trailMiddleStartBlur = 9,
  trailMiddleAnimateBlur = 0,
  trailMiddleEndBlur = 9,
  trailFarStartBlur = 12,
  trailFarAnimateBlur = 1,
  trailFarEndBlur = 13.9,
  leftCloudY = -60,
}: Micro03SceneProps) => {
  const atmosphere = clamp(values.atmosphere);
  const flow = clamp(values.flow);
  const flight = clamp(values.flight);
  const atmosphereOutro = clamp(values.atmosphereOutro);
  const flowOutro = clamp(values.flowOutro);
  const streamsOutro = clamp(values.streamsOutro);
  const planeOutro = clamp(values.planeOutro);
  const flowBlur = stagedBlur(
    flowEnterBlur,
    flowAnimateBlur,
    flowExitBlur,
    flow,
    flowOutro,
  );
  const planeBlur = stagedBlur(
    planeStartBlur,
    planeAnimateBlur,
    planeEndBlur,
    flight,
    planeOutro,
  );
  const trailNearBlur = stagedBlur(
    trailNearStartBlur,
    trailNearAnimateBlur,
    trailNearEndBlur,
    flight,
    streamsOutro,
  );
  const trailMiddleBlur = stagedBlur(
    trailMiddleStartBlur,
    trailMiddleAnimateBlur,
    trailMiddleEndBlur,
    flight,
    streamsOutro,
  );
  const trailFarBlur = stagedBlur(
    trailFarStartBlur,
    trailFarAnimateBlur,
    trailFarEndBlur,
    flight,
    streamsOutro,
  );
  const flightIntroEnd = 0.46 + 2.17;
  const flightOutroStart = 3.21;
  const cruiseDistance = 40;
  const cruiseSpeed = cruiseDistance / (flightOutroStart - flightIntroEnd);
  const cruiseProgress = clamp(
    (time - flightIntroEnd) / (flightOutroStart - flightIntroEnd),
  );
  const introX = -1100 + flight * 1080;
  const cruiseX = -20 + cruiseProgress * cruiseDistance;
  const outroElapsed = Math.max(0, time - flightOutroStart);
  const flightX = time < flightIntroEnd
    ? introX
    : time < flightOutroStart
      ? cruiseX
      : 20 + outroElapsed * cruiseSpeed + planeOutro * 650;
  // The plane PNG supplies the exact same alpha silhouette for both the
  // aircraft pixels and its highlight, avoiding two independently transformed masks.
  const jetMask = {
    WebkitMaskImage: `url("${JET_IMAGE}")`,
    maskImage: `url("${JET_IMAGE}")`,
  } as CSSProperties;

  return (
    <div className="micro03-scene">
      <svg className="micro03-filter-defs" aria-hidden="true">
        <defs>
          <filter
            id="micro03-plane-x-blur"
            x="-100%"
            y="-20%"
            width="300%"
            height="140%"
            colorInterpolationFilters="sRGB"
          >
            <feGaussianBlur stdDeviation={`${planeBlur} 0`} />
          </filter>
        </defs>
      </svg>
      <div className="micro03-blue-glow" style={{opacity: atmosphere * (1 - atmosphereOutro)}} />
      <div
        className="micro03-left-cloud-wrap"
        style={{
          opacity: atmosphere * (1 - atmosphereOutro),
          top: `${leftCloudY / 7.2}cqh`,
        }}
      >
        <div className="micro03-left-cloud" />
      </div>

      <img
        className="micro03-flow"
        src={FLOW}
        style={{
          opacity: flow * (1 - flowOutro),
          filter: `blur(${flowBlur}px)`,
        }}
      />

      <div className="micro03-white-cloud" style={{opacity: atmosphere * (1 - atmosphereOutro)}} />
      <div className="micro03-cloud-glow" style={{opacity: atmosphere * (1 - atmosphereOutro)}} />
      <div className="micro03-cloud-orange" style={{opacity: atmosphere * (1 - atmosphereOutro)}} />
      <div className="micro03-cloud-shadow-wrap" style={{opacity: atmosphere * (1 - atmosphereOutro)}}>
        <div className="micro03-cloud-shadow" />
      </div>

      <div
        className="micro03-flight"
        style={{transform: `translateX(${flightX}px)`}}
      >
        <div className="micro03-streams" style={{opacity: 1 - streamsOutro}}>
          <div
            className="micro03-stream-depth"
            style={{
              filter: `blur(${trailFarBlur}px)`,
              WebkitMaskImage: 'linear-gradient(to right, #000 0cqw, #000 534cqw, transparent 552cqw)',
              maskImage: 'linear-gradient(to right, #000 0cqw, #000 534cqw, transparent 552cqw)',
            }}
          >
            <StreamLines />
          </div>
          <div
            className="micro03-stream-depth"
            style={{
              filter: `blur(${trailMiddleBlur}px)`,
              WebkitMaskImage: 'linear-gradient(to right, transparent 528cqw, #000 546cqw, #000 568cqw, transparent 582cqw)',
              maskImage: 'linear-gradient(to right, transparent 528cqw, #000 546cqw, #000 568cqw, transparent 582cqw)',
            }}
          >
            <StreamLines />
          </div>
          <div
            className="micro03-stream-depth"
            style={{
              filter: `blur(${trailNearBlur}px)`,
              WebkitMaskImage: 'linear-gradient(to right, transparent 562cqw, #000 582cqw, #000 100%)',
              maskImage: 'linear-gradient(to right, transparent 562cqw, #000 582cqw, #000 100%)',
            }}
          >
            <StreamLines />
          </div>
        </div>

        <div className="micro03-plane" style={{filter: 'url(#micro03-plane-x-blur)'}}>
          <div className="micro03-plane-rotation">
            <div className="micro03-plane-mask" style={jetMask}>
              <img src={JET_IMAGE} />
              <div className="micro03-plane-light" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
