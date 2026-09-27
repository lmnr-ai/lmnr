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
import {Subtitles as IssueSubtitles} from '../micro-20/Subtitles';
import {Micro20Scene} from '../micro-20/Scene';
import type {Ultimate3Sample} from './sample';
import {sampleFlow} from './sample';
import {ConclusionSubtitles} from './Subtitles';
import {costEndpoint, type Ultimate3Settings} from './settings';
import {sampleMicro16} from '../micro-16/sample';
import {
  COST_NATIVE_TO_WORLD,
  FLOW_PLACEMENT,
  costCameraInSharedWorld,
  flowCameraInSharedWorld,
  flowCloudScreenTransform,
  sharedWorldCamera,
  issueSurfacePlacement,
  flowIssuesCamera,
  projectScreenRect,
} from './transitions';

const Card = ({kind}: {kind: 'placeholder'|'logo'}) => <div className="micro18-card">
  {kind === 'logo' ? <img className="micro18-logo" src={staticFile('micro-18/conclusion-logo.svg')}/> : <span>{'TODO: '}</span>}
</div>;

const SharedCostFlowIssuesWorld = ({sample, settings}: {sample: Ultimate3Sample; settings: Ultimate3Settings}) => {
  const id = `micro18-${useId().replace(/:/g, '')}`;
  useMicro16RenderReady();
  useFlow1FontReady();
  const issues = sample.issues;
  const isFlow = sample.chapter === 'flow' && sample.flow;
  const cost = issues ? sampleMicro16(costEndpoint(settings), settings.cost.controls, settings.cost.timing) : isFlow ? sample.flow!.outgoingCost : sample.cost!;
  const flow = issues ? sampleFlow(settings.allocations.flow, settings) : isFlow ? sample.flow! : sampleFlow(0, settings);
  const flowState = introducingFlowState(flow.playback);
  const outgoing = flowCameraInSharedWorld(flowState.camera);
  const issuePlacement = issueSurfacePlacement(outgoing);
  const camera = issues ? flowIssuesCamera(outgoing, issues.entering ? issues.entryProgress : 1) : isFlow
    ? sharedWorldCamera({entryProgress: flow.entryProgress, outgoingCostCamera: cost.camera, flowPlayback: flow.playback})
    : costCameraInSharedWorld(cost.camera);
  const cameraStyle = {
    transform: `translate(${camera.x}px,${camera.y}px) scale(${camera.scale})`,
    '--micro18-camera-scale': camera.scale,
    '--flow1-border': `${1 / camera.scale}px`,
  } as React.CSSProperties;
  const costTransform = `translate(${COST_NATIVE_TO_WORLD.x}px,${COST_NATIVE_TO_WORLD.y}px) scale(${COST_NATIVE_TO_WORLD.scale})`;
  const cloudTransform = issues
    ? flowCloudScreenTransform(0, camera, outgoing)
    : isFlow ? flowCloudScreenTransform(flow.entryProgress, camera, outgoing) : {x: 0, y: 0, scale: 1};
  // Freeze the outgoing screen plane onto its terminal world pose, including
  // early trims whose clouds have not exited. Cull only once the plane is offscreen.
  const cloudBounds = projectScreenRect({x: 0, y: 0, width: 1280, height: 720}, cloudTransform);
  const outgoingCloudsVisible = issues?.entering && cloudBounds.x < 1280 && cloudBounds.y < 720
    && cloudBounds.x + cloudBounds.width > 0 && cloudBounds.y + cloudBounds.height > 0;

  return <div className="micro18-shared-scene" aria-label="Cost, Introducing Flow-1 and Issue clusters 3 shared world"
    data-world-kind="persistent-cost-flow" data-camera-x={camera.x} data-camera-y={camera.y} data-camera-scale={camera.scale}>
    <div className="micro18-shared-world" style={cameraStyle} data-world-origin="0,0" data-shared-camera="true">
      {/* CSS grid edges become source20's SVG stroke centers by arrival.
          The half-screen-pixel inset is continuous and avoids a border flash. */}
      {(!issues || issues.entering) && <div className="micro18-shared-grid" data-grid-pitch="100" style={issues ? {height: Math.max(20000, issuePlacement.y + 12000),
        transform: `translate(${-issues.entryProgress * .5 / camera.scale}px,${-issues.entryProgress * .5 / camera.scale}px)`} : undefined}/>}
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
      {issues && <div className="micro18-issues-surface" data-entry={issues.entering} data-native-time={issues.nativeTime}
        style={{transform: `translate(${issuePlacement.x}px,${issuePlacement.y}px) scale(${issuePlacement.scale})`}}>
        <Micro20Scene sample={issues.source20} sharedEntry={issues.entering} showSubtitles={false}/>
      </div>}
    </div>
    {(isFlow || outgoingCloudsVisible) && <div className="micro18-flow-cloud-layer" data-cloud-attachment={issues ? 'outgoing-world' : flow.entryProgress < 1 ? 'opening-world' : 'screen'}
      style={{transform: `translate(${cloudTransform.x}px,${cloudTransform.y}px) scale(${cloudTransform.scale})`}}>
      <DitherClouds progress={flowState.cloudProgress} yOffset={settings.flow.controls.cloudYOffset} translateY={flowState.cloudTranslateY}/>
    </div>}
    {issues ? <IssueSubtitles narration={issues.entering ? null : issues.source20.narration} opacity={issues.source20.subtitleOpacity}/> : isFlow ? <FlowSubtitles progress={flow.playback.progress}/> : <Subtitles progress={cost.progress}/>} 
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
  } else if ((sample.chapter === 'cost' && sample.cost) || (sample.chapter === 'flow' && sample.flow) || (sample.chapter === 'issues' && sample.issues)) {
    content = <SharedCostFlowIssuesWorld sample={sample} settings={settings}/>;
    if (sample.chapter === 'cost' && sample.cost) {
      suppressNativeClouds = true;
      // Start at Ultimate 2's exact settled y=27 pose, then continuously adopt
      // Cost's y=37 geometry while Cost performs its normal cloud exit.
      clouds = {...sample.cost.cloud, yOffset: 27 + 10 * sample.cost.progress.cloudSweep};
    }
  } else if (sample.chapter === 'conclusion') {
    const stage = sample.conclusion === 'logo' ? 'logo' : 'placeholder';
    content = <>{stage === 'placeholder' && sample.conclusionSource
      ? <Micro20Scene sample={sample.conclusionSource} showSubtitles={false}/>
      : <Card kind={stage}/>}<ConclusionSubtitles stage={stage}/></>;
  } else {
    content = <Card kind="placeholder"/>;
  }

  return <div className={`micro18-frame${suppressNativeClouds ? ' micro18-cloud-handoff' : ''}`}>
    {content}
    {clouds && <DitherClouds {...clouds}/>} 
  </div>;
};
