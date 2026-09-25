import {computeClipState, computeStaticTimeline, parseTimelineConfig} from 'dialkit/timeline';
import {MICRO_11_TIMELINE} from './timeline';
import type {Micro11Transition} from './geometry';

const {clips} = computeStaticTimeline(parseTimelineConfig(MICRO_11_TIMELINE), {});

// Same clip evaluator as the live timeline; supports arbitrary export/scrub order.
export function sampleMicro11Transition(time: number): Micro11Transition {
  const progress = (key: string) => (computeClipState(clips.find(clip => clip.key === key)!, time, time) as {current: {progress: number}}).current.progress;
  return {
    smallGridFade: progress('smallGridFade'),
    zoomOut: progress('zoomOut'),
    streamCollapse: progress('streamCollapse'),
    loaderFade: progress('loaderFade'),
    dotDim: progress('dotDim'),
  };
}
