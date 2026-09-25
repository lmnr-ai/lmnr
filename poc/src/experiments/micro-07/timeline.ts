import type {TimelineConfig} from 'dialkit/timeline';
export const MICRO_07_DURATION=18;
export const MICRO_07_TIMELINE_ID='micro-animation-07-timeline-v8';
const ease=[0.45,0,0.55,1] as [number,number,number,number];
export const MICRO_07_TIMELINE={duration:MICRO_07_DURATION,
  agentEnter:{at:0,duration:.23,from:{progress:0},to:{progress:1},transition:{type:'easing',duration:.23,ease:[.22,1,.36,1]}},
  firstThinking:{at:.48,duration:.26,from:{progress:0},to:{progress:1},transition:{type:'easing',duration:.26,ease}},
  firstRead:{at:1.63,duration:.51,from:{progress:0},to:{progress:1},transition:{type:'easing',duration:.51,ease}},
  secondThinking:{at:2.41,duration:.52,from:{progress:0},to:{progress:1},transition:{type:'easing',duration:.52,ease}},
  firstWrite:{at:3.24,duration:.62,from:{progress:0},to:{progress:1},transition:{type:'easing',duration:.62,ease}},
  // One continuous traversal through the elbow, with no easing restart.
  remainingTrack:{at:3.92,duration:2.75,from:{progress:0},to:{progress:1},transition:{type:'easing',duration:2.75,ease:[.26,.08,1,1]}},
  bubbleEnter:{at:6.28,duration:.35,from:{progress:0},to:{progress:1},transition:{type:'easing',duration:.35,ease:[.22,1,.36,1]}},
  cameraReturn:{at:6.95,duration:1.25,from:{progress:0},to:{progress:1},transition:{type:'easing',duration:1.25,ease}},
  redThinkingLift:{at:7.01,duration:.27,from:{progress:0},to:{progress:1},transition:{type:'easing',duration:.27,ease}},
  readLift:{at:7.44,duration:.25,from:{progress:0},to:{progress:1},transition:{type:'easing',duration:.25,ease}},
  thinkingLift:{at:7.81,duration:.29,from:{progress:0},to:{progress:1},transition:{type:'easing',duration:.29,ease}},
  highlight:{at:8.4,duration:1.1,from:{progress:0},to:{progress:1},transition:{type:'easing',duration:1.1,ease:[0,0,1,1]}},
} satisfies TimelineConfig;
