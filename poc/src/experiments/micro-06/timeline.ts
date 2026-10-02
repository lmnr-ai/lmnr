import type {TimelineConfig} from 'dialkit/timeline';

export const MICRO_06_DURATION = 18;
export const MICRO_06_TIMELINE_ID = 'micro-animation-06-timeline-v15';
const ease = [0.45, 0, 0.55, 1] as [number, number, number, number];

export const MICRO_06_TIMELINE = {
  duration: MICRO_06_DURATION,
  agentEnter: {at: 0, duration: 0.6, from: {progress: 0}, to: {progress: 1}, transition: {type: 'easing', duration: 0.6, ease: [0.22,1,0.36,1]}},
  firstThinking: {at: 0.8, duration: 0.58, from: {progress: 0}, to: {progress: 1}, transition: {type: 'easing', duration: 0.58, ease}},
  remainingTrack: {at:1.99,duration:4.64,from:{progress:0},to:{progress:1},transition:{type:'easing',duration:4.64,ease:[0,0,0.6,0.5]}},
  worldFade: {at:6.62,duration:0.5,from:{progress:0},to:{progress:1},transition:{type:'easing',duration:0.5,ease}},
  spinnerExit: {at:6.61,duration:0.45,from:{progress:0},to:{progress:1},transition:{type:'easing',duration:0.45,ease}},
  agentWhiten: {at:6.62,duration:0.5,from:{progress:0},to:{progress:1},transition:{type:'easing',duration:0.5,ease}},
  // DialKit's minimum clip is50ms. Its midpoint switches ownership while both
  // scenes display the same fully cleaned, pre-zoom frame.
  handoff: {at:7.1,duration:0.05,from:{progress:0},to:{progress:1},transition:{type:'easing',duration:0.05,ease:[0,0,1,1]}},
  overviewZoom: {at:7.27,duration:2.3,from:{progress:0},to:{progress:1},transition:{type:'easing',duration:2.3,ease}},
  heroDim: {at:9.99,duration:0.89,from:{progress:0},to:{progress:1},transition:{type:'easing',duration:0.89,ease}},
  // Linear phase includes the final cell's fade tail, not just crest travel.
  blueWave: {at:9.46,duration:4,from:{progress:0},to:{progress:1},transition:{type:'easing',duration:4,ease:[0,0,1,1]}},
} satisfies TimelineConfig;
