import { Composition } from 'remotion';
import { createSampler } from '../anim/timeline';
import { TraceView } from './TraceView';
import { SlidesVideo } from './SlidesVideo';
import { MicroAnimation01 } from './MicroAnimation01';
import { MicroAnimation02 } from './MicroAnimation02';
import { MicroAnimation03 } from './MicroAnimation03';
import { MicroAnimation04 } from './MicroAnimation04';
import { MicroAnimation05 } from './MicroAnimation05';
import { MicroAnimation06 } from './MicroAnimation06';
import { MicroAnimation07 } from './MicroAnimation07';
import { MicroAnimation08 } from './MicroAnimation08';
import { MicroAnimation09 } from './MicroAnimation09';
import { MicroAnimation10, MICRO_10_VIDEO_DEFAULTS } from './MicroAnimation10';
import { MicroAnimation11, MICRO_11_VIDEO_DEFAULTS } from './MicroAnimation11';
import { MICRO_08_DURATION } from '../experiments/micro-08/timeline';
import { MICRO_09_DURATION } from '../experiments/micro-09/timeline';
import { MICRO_06_DURATION } from '../experiments/micro-06/timeline';
import { MICRO_07_DURATION } from '../experiments/micro-07/timeline';
import { MICRO_10_DURATION } from '../experiments/micro-10/timeline';
import { MICRO_11_DURATION } from '../experiments/micro-11/timeline';
import { MICRO_12_DURATION } from '../experiments/micro-12/timeline';
import { MicroAnimation12, MICRO_12_VIDEO_DEFAULTS } from './MicroAnimation12';
import {MicroAnimation14, MICRO_14_VIDEO_DEFAULTS} from './MicroAnimation14';
import {micro14DurationFrames} from '../experiments/micro-14/timeline';
import {MicroAnimation15, MICRO_15_VIDEO_DEFAULTS} from './MicroAnimation15';
import {micro15DurationFrames} from '../experiments/micro-15/timeline';
import {MicroAnimation16, MICRO_16_VIDEO_DEFAULTS} from './MicroAnimation16';
import {micro16DurationFrames} from '../experiments/micro-16/timeline';
import {MicroAnimation17, MICRO_17_VIDEO_DEFAULTS} from './MicroAnimation17';
import {micro17DurationFrames} from '../experiments/micro-17/timeline';
import {MicroAnimation18, MICRO_18_VIDEO_DEFAULTS, micro18DurationFrames} from './MicroAnimation18';
import {Ultimate3Silk, SILK_VIDEO_DEFAULTS, silkMetadata} from './Ultimate3Silk';
import {MicroAnimation20, MICRO_20_VIDEO_DEFAULTS} from './MicroAnimation20';
import {micro20DurationFrames} from '../experiments/micro-20/timeline';
import {IntroducingFlow1} from './IntroducingFlow1';
import {INTRODUCING_FLOW_1_DURATION} from '../experiments/introducing-flow-1/timeline';
import tuned from '../../tuned.json';

const FPS = 60;

// Ask the shared core how long the timeline actually is. Physics springs
// resolve their own settle time, so this is not just TIMELINE.duration.
const { duration } = createSampler(tuned);

export const RemotionRoot = () => (
  <>
  <Composition
    id="TraceView"
    component={TraceView}
    durationInFrames={Math.ceil(duration * FPS)}
    fps={FPS}
    width={1920}
    height={1080}
  />
  <Composition
    id="MicroAnimation01"
    component={MicroAnimation01}
    durationInFrames={120}
    fps={30}
    width={1280}
    height={720}
  />
  <Composition
    id="MicroAnimation02"
    component={MicroAnimation02}
    durationInFrames={180}
    fps={30}
    width={1280}
    height={720}
  />
  <Composition
    id="MicroAnimation03"
    component={MicroAnimation03}
    durationInFrames={180}
    fps={30}
    width={1280}
    height={720}
  />
  <Composition
    id="MicroAnimation04"
    component={MicroAnimation04}
    durationInFrames={300}
    fps={30}
    width={1280}
    height={720}
  />
  <Composition
    id="MicroAnimation05"
    component={MicroAnimation05}
    durationInFrames={300}
    fps={30}
    width={1280}
    height={720}
  />
  <Composition
    id="MicroAnimation06"
    component={MicroAnimation06}
    durationInFrames={MICRO_06_DURATION * 30}
    fps={30}
    width={1280}
    height={720}
  />
  <Composition
    id="MicroAnimation07"
    component={MicroAnimation07}
    durationInFrames={MICRO_07_DURATION * 30}
    fps={30}
    width={1280}
    height={720}
  />
  <Composition
    id="MicroAnimation08"
    component={MicroAnimation08}
    durationInFrames={MICRO_08_DURATION * 30}
    fps={30}
    width={1280}
    height={720}
  />
  <Composition
    id="MicroAnimation09"
    component={MicroAnimation09}
    defaultProps={{
      seed: 209,
      cloudYOffset: 27,
      signalsYOffset: -36,
      clockFrequency: 4,
      triangleProbability: 0.2,
      stateChangeProbability: 0.4,
      colorChangeProbability: 0.83,
      isolationWeight: 9.25,
    }}
    durationInFrames={MICRO_09_DURATION * 30}
    fps={30}
    width={1280}
    height={720}
  />
  <Composition
    id="MicroAnimation10"
    component={MicroAnimation10}
    defaultProps={MICRO_10_VIDEO_DEFAULTS}
    durationInFrames={MICRO_10_DURATION * 30}
    fps={30}
    width={1280}
    height={720}
  />
  <Composition
    id="MicroAnimation11"
    component={MicroAnimation11}
    defaultProps={MICRO_11_VIDEO_DEFAULTS}
    durationInFrames={MICRO_11_DURATION * 30}
    fps={30}
    width={1280}
    height={720}
  />
  <Composition
    id="MicroAnimation12"
    component={MicroAnimation12}
    defaultProps={MICRO_12_VIDEO_DEFAULTS}
    durationInFrames={MICRO_12_DURATION * 30}
    fps={30}
    width={1280}
    height={720}
  />
  <Composition
    id="MicroAnimation14"
    component={MicroAnimation14}
    defaultProps={MICRO_14_VIDEO_DEFAULTS}
    durationInFrames={micro14DurationFrames(MICRO_14_VIDEO_DEFAULTS.timelineDuration)}
    calculateMetadata={({props}) => ({durationInFrames: micro14DurationFrames(props.timelineDuration)})}
    fps={30}
    width={1280}
    height={720}
  />
  <Composition
    id="MicroAnimation15"
    component={MicroAnimation15}
    defaultProps={MICRO_15_VIDEO_DEFAULTS}
    durationInFrames={micro15DurationFrames(MICRO_15_VIDEO_DEFAULTS.timelineDuration)}
    calculateMetadata={({props}) => ({durationInFrames: micro15DurationFrames(props.timelineDuration, props.timing)})}
    fps={30}
    width={1280}
    height={720}
  />
  <Composition
    id="MicroAnimation16"
    component={MicroAnimation16}
    defaultProps={MICRO_16_VIDEO_DEFAULTS}
    durationInFrames={micro16DurationFrames(MICRO_16_VIDEO_DEFAULTS.timing)}
    calculateMetadata={({props}) => ({durationInFrames: micro16DurationFrames(props.timing)})}
    fps={30}
    width={1280}
    height={720}
  />
  <Composition
    id="MicroAnimation17"
    component={MicroAnimation17}
    defaultProps={MICRO_17_VIDEO_DEFAULTS}
    durationInFrames={micro17DurationFrames(MICRO_17_VIDEO_DEFAULTS.timing)}
    calculateMetadata={({props}) => ({durationInFrames: micro17DurationFrames(props.timing)})}
    fps={30}
    width={1280}
    height={720}
  />
  <Composition
    id="MicroAnimation18"
    component={MicroAnimation18}
    defaultProps={MICRO_18_VIDEO_DEFAULTS}
    durationInFrames={micro18DurationFrames(MICRO_18_VIDEO_DEFAULTS)}
    calculateMetadata={({props}) => ({durationInFrames: micro18DurationFrames(props)})}
    fps={30}
    width={1280}
    height={720}
  />
  <Composition
    id="MicroAnimation20"
    component={MicroAnimation20}
    defaultProps={MICRO_20_VIDEO_DEFAULTS}
    durationInFrames={micro20DurationFrames(MICRO_20_VIDEO_DEFAULTS)}
    calculateMetadata={({props}) => ({durationInFrames: micro20DurationFrames(props)})}
    fps={30}
    width={1280}
    height={720}
  />
  <Composition
    id="Ultimate3Silk"
    component={Ultimate3Silk}
    defaultProps={SILK_VIDEO_DEFAULTS}
    durationInFrames={micro18DurationFrames(SILK_VIDEO_DEFAULTS)}
    calculateMetadata={silkMetadata}
    fps={30}
    width={1280}
    height={720}
  />
  <Composition
    id="MicroAnimation13"
    component={IntroducingFlow1}
    durationInFrames={INTRODUCING_FLOW_1_DURATION * 30}
    fps={30}
    width={1280}
    height={720}
  />
  <Composition
    id="DanDanSlides"
    component={SlidesVideo}
    durationInFrames={1625}
    fps={30}
    width={960}
    height={540}
  />
  </>
);
