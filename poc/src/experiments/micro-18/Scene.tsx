import {useId} from 'react';
import {staticFile} from 'remotion';
import {DitherClouds, type CloudState} from '../micro-09/DitherClouds';
import {DitherPhoto, DitherPuffs} from '../micro-10/DitherPhoto';
import {Micro17Scene} from '../micro-17/Scene';
import {worldState} from '../micro-17/geometry';
import {
  Micro16BudgetContent,
  Micro16WorldContent,
  useMicro16RenderReady,
} from '../micro-16/Scene';
import {Subtitles} from '../micro-16/Subtitles';
import {Flow1WorldContent, useFlow1FontReady} from '../introducing-flow-1/Scene';
import {Subtitles as FlowSubtitles} from '../introducing-flow-1/Subtitles';
import {introducingFlowState} from '../introducing-flow-1/geometry';
import {Micro15Scene} from '../micro-15/Scene';
import type {Ultimate3Sample} from './sample';
import {sampleFlow} from './sample';
import {ConclusionSubtitles} from './Subtitles';
import type {Ultimate3Settings} from './settings';
import {
  COST_NATIVE_TO_WORLD,
  FLOW_PLACEMENT,
  costCameraInSharedWorld,
  flowCameraInSharedWorld,
  flowCloudScreenTransform,
  sharedWorldCamera,
} from './transitions';

const Card = ({kind}: {kind: 'transition'|'placeholder'|'logo'}) => <div className="micro18-card">
  {kind === 'logo' ? <img className="micro18-logo" src={staticFile('micro-18/conclusion-logo.svg')}/> : <span>{kind === 'transition' ? 'TODO: transition' : 'TODO: '}</span>}
</div>;

const SharedCostFlowWorld = ({sample, settings}: {sample: Ultimate3Sample; settings: Ultimate3Settings}) => {
  const id = `micro18-${useId().replace(/:/g, '')}`;
  useMicro16RenderReady();
  useFlow1FontReady();
  const isFlow = sample.chapter === 'flow' && sample.flow;
  const cost = isFlow ? sample.flow!.outgoingCost : sample.cost!;
  const flow = isFlow ? sample.flow! : sampleFlow(0, settings);
  const flowState = introducingFlowState(flow.playback);
  const camera = isFlow
    ? sharedWorldCamera({entryProgress: flow.entryProgress, outgoingCostCamera: cost.camera, flowPlayback: flow.playback})
    : costCameraInSharedWorld(cost.camera);
  const cameraStyle = {
    transform: `translate(${camera.x}px,${camera.y}px) scale(${camera.scale})`,
    '--micro18-camera-scale': camera.scale,
    '--flow1-border': `${1 / camera.scale}px`,
  } as React.CSSProperties;
  const costTransform = `translate(${COST_NATIVE_TO_WORLD.x}px,${COST_NATIVE_TO_WORLD.y}px) scale(${COST_NATIVE_TO_WORLD.scale})`;
  const cloudTransform = isFlow
    ? flowCloudScreenTransform(flow.entryProgress, camera, flowCameraInSharedWorld(flowState.camera))
    : {x: 0, y: 0, scale: 1};

  return <div className="micro18-shared-scene" aria-label="Cost and Introducing Flow-1 shared world"
    data-world-kind="persistent-cost-flow" data-camera-x={camera.x} data-camera-y={camera.y} data-camera-scale={camera.scale}>
    <div className="micro18-shared-world" style={cameraStyle} data-world-origin="0,0" data-shared-camera="true">
      <div className="micro18-shared-grid" data-grid-pitch="100"/>
      <div className="micro18-cost-space" style={{transform: costTransform}} data-native-scale={COST_NATIVE_TO_WORLD.scale}>
        <svg className="micro18-cost-content" viewBox="-2000 -1000 10000 7000">
          <Micro16WorldContent state={cost} id={id}/>
        </svg>
        <div className="micro18-cost-smoke" style={{transform: `translate(${cost.camera.x}px,${cost.camera.y}px)`}}>
          <DitherPuffs puffs={cost.puffs} brightness={.9}/>
          <DitherPhoto bounds={cost.smokeBounds} opacity={cost.smokeOpacity}/>
        </div>
        <svg className="micro18-cost-budget" viewBox="-2000 -1000 10000 7000">
          <Micro16BudgetContent state={cost} id={id}/>
        </svg>
      </div>
      <div className="micro18-flow-content" data-world-x={FLOW_PLACEMENT.x} data-world-y={FLOW_PLACEMENT.y}
        style={{transform: `translate(${FLOW_PLACEMENT.x}px,${FLOW_PLACEMENT.y}px)`, '--flow1-muted-gray': settings.flow.controls.mutedGray} as React.CSSProperties}>
        <Flow1WorldContent state={flowState} time={flow.playback.time} blueDotScale={settings.flow.controls.blueDotScale} numberRowStagger={settings.flow.controls.numberRowStagger} coverMotion={settings.flow.controls.coverMotion}/>
      </div>
    </div>
    {isFlow && <div className="micro18-flow-cloud-layer" data-cloud-attachment={flow.entryProgress < 1 ? 'opening-world' : 'screen'}
      style={{transform: `translate(${cloudTransform.x}px,${cloudTransform.y}px) scale(${cloudTransform.scale})`}}>
      <DitherClouds progress={flowState.cloudProgress} yOffset={settings.flow.controls.cloudYOffset} translateY={flowState.cloudTranslateY}/>
    </div>}
    {isFlow ? <FlowSubtitles progress={flow.playback.progress}/> : <Subtitles progress={cost.progress}/>} 
  </div>;
};

/** The chapter renderer always keeps the cloud canvas in the same outer slot.
 * This prevents a texture/canvas swap at the 17→16 boundary. */
export const Ultimate3Scene = ({sample, settings}: {sample: Ultimate3Sample; settings: Ultimate3Settings}) => {
  let content: React.ReactNode;
  let clouds: CloudState | null = null;
  let suppressNativeClouds = false;

  if (sample.chapter === 'ultimate2' && sample.ultimate2) {
    const state = worldState(sample.ultimate2, settings.ultimate2.controls);
    content = <Micro17Scene playback={sample.ultimate2} controls={settings.ultimate2.controls}/>;
    suppressNativeClouds = true;
    if (state.cloudEnter > 0) clouds = {progress: state.cloudProgress, yOffset: 27,
      translateY: state.cloudTranslateY, translateX: state.cloudTranslateX};
  } else if ((sample.chapter === 'cost' && sample.cost) || (sample.chapter === 'flow' && sample.flow)) {
    content = <SharedCostFlowWorld sample={sample} settings={settings}/>;
    if (sample.chapter === 'cost' && sample.cost) {
      suppressNativeClouds = true;
      // Start at Ultimate 2's exact settled y=27 pose, then continuously adopt
      // Cost's y=37 geometry while Cost performs its normal cloud exit.
      clouds = {...sample.cost.cloud, yOffset: 27 + 10 * sample.cost.progress.cloudSweep};
    }
  } else if (sample.chapter === 'issues' && sample.issues) {
    content = sample.issues.placeholder ? <Card kind="transition"/> : <Micro15Scene {...sample.issues.sample}/>;
  } else if (sample.chapter === 'conclusion') {
    const stage = sample.conclusion === 'logo' ? 'logo' : 'placeholder';
    content = <><Card kind={stage}/><ConclusionSubtitles stage={stage}/></>;
  } else {
    content = <Card kind="placeholder"/>;
  }

  return <div className={`micro18-frame${suppressNativeClouds ? ' micro18-cloud-handoff' : ''}`}>
    {content}
    {clouds && <DitherClouds {...clouds}/>} 
  </div>;
};
