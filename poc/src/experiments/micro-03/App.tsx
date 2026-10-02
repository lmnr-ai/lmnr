import {DialRoot, DialTimeline, useDialKit, useDialTimeline} from 'dialkit';
import {ExperimentPicker} from '../ExperimentPicker';
import {Micro03Scene} from './Scene';
import {MICRO_03_TIMELINE, MICRO_03_TIMELINE_ID} from './timeline';

export const Micro03App = () => {
  // TODO(production): DialKit's clip.current values are the scrubbable authoring preview.
  // Replace them with equivalent real Motion animations using the tuned timeline
  // timings and transitions, then remove useDialTimeline and <DialTimeline />.
  const timeline = useDialTimeline('Micro animation 03 — Master (seconds)', MICRO_03_TIMELINE, {
    id: MICRO_03_TIMELINE_ID,
    autoplay: false,
    loop: true,
    persist: true,
  });
  const flowBlur = useDialKit('Flow blur', {
    enter: [15, 0, 30, 0.1],
    animate: [0, 0, 30, 0.1],
    exit: [6, 0, 30, 0.1],
  }, {id: 'micro-animation-03-flow-blur-v2', persist: true});
  const planeBlur = useDialKit('Plane blur', {
    startBlur: [10.6, 0, 30, 0.1],
    animateBlur: [4.6, 0, 30, 0.1],
    endBlur: [7.2, 0, 30, 0.1],
  }, {id: 'micro-animation-03-plane-blur-v3', persist: true});
  const trailNearBlur = useDialKit('Trail near blur', {
    startBlur: [7, 0, 30, 0.1],
    animateBlur: [0, 0, 30, 0.1],
    endBlur: [9, 0, 30, 0.1],
  }, {id: 'micro-animation-03-trail-near-blur-v2', persist: true});
  const trailMiddleBlur = useDialKit('Trail middle blur', {
    startBlur: [9, 0, 30, 0.1],
    animateBlur: [0, 0, 30, 0.1],
    endBlur: [9, 0, 30, 0.1],
  }, {id: 'micro-animation-03-trail-middle-blur-v2', persist: true});
  const trailFarBlur = useDialKit('Trail far blur', {
    startBlur: [12, 0, 30, 0.1],
    animateBlur: [1, 0, 30, 0.1],
    endBlur: [13.9, 0, 30, 0.1],
  }, {id: 'micro-animation-03-trail-far-blur-v2', persist: true});
  const atmosphereAppearance = useDialKit('Atmosphere position', {
    leftCloudY: [-60, -900, 500, 1],
  }, {id: 'micro-animation-03-atmosphere-position-v2', persist: true});

  return (
    <main className="micro03-app">
      <div className="micro03-stage">
        <Micro03Scene
          time={timeline.time}
          values={{
            atmosphere: timeline.atmosphere.current.progress,
            flow: timeline.flow.current.progress,
            flight: timeline.flight.current.progress,
            atmosphereOutro: timeline.atmosphereOutro.current.progress,
            flowOutro: timeline.flowOutro.current.progress,
            streamsOutro: timeline.streamsOutro.current.progress,
            planeOutro: timeline.planeOutro.current.progress,
          }}
          flowEnterBlur={flowBlur.enter}
          flowAnimateBlur={flowBlur.animate}
          flowExitBlur={flowBlur.exit}
          planeStartBlur={planeBlur.startBlur}
          planeAnimateBlur={planeBlur.animateBlur}
          planeEndBlur={planeBlur.endBlur}
          trailNearStartBlur={trailNearBlur.startBlur}
          trailNearAnimateBlur={trailNearBlur.animateBlur}
          trailNearEndBlur={trailNearBlur.endBlur}
          trailMiddleStartBlur={trailMiddleBlur.startBlur}
          trailMiddleAnimateBlur={trailMiddleBlur.animateBlur}
          trailMiddleEndBlur={trailMiddleBlur.endBlur}
          trailFarStartBlur={trailFarBlur.startBlur}
          trailFarAnimateBlur={trailFarBlur.animateBlur}
          trailFarEndBlur={trailFarBlur.endBlur}
          leftCloudY={atmosphereAppearance.leftCloudY}
        />
      </div>
      <ExperimentPicker current="micro-03" />
      <DialRoot />
      <DialTimeline />
    </main>
  );
};
