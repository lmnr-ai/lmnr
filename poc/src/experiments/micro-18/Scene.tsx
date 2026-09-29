import {Micro22Scene, Micro22Subtitles} from '../micro-22/Scene';
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
import {Flow2Graph} from '../introducing-flow-1-2/Scene';
import {flow2WorldState} from '../introducing-flow-1-2/geometry';
import {Subtitles as Flow21Subtitles} from '../introducing-flow-1-2/Subtitles';
import {Subtitles as IssueSubtitles} from '../micro-20/Subtitles';
import {Micro20Scene} from '../micro-20/Scene';
import type {Ultimate3Sample} from './sample';
import {sampleFlow} from './sample';
import {ConclusionSubtitles} from './Subtitles';
import {VoiceoverCaptions} from './VoiceoverCaptions';
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
  const flowState = flow.playback21 ? flow2WorldState(flow.playback21) : introducingFlowState(flow.playback);
  const outgoing = flowCameraInSharedWorld(flowState.camera);
  const issuePlacement = issueSurfacePlacement(outgoing);
  const camera = issues ? flowIssuesCamera(outgoing, issues.entering ? issues.entryProgress : 1) : isFlow
    ? sharedWorldCamera({entryProgress: flow.entryProgress, outgoingCostCamera: cost.camera, flowPlayback: flow.playback, flowPlayback21: flow.playback21})
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
  // Restore the pre-midnight chapter attachment: clouds arrive with Flow's
  // opening world and leave with its terminal world if the chapter is trimmed.
  const cloudBounds = projectScreenRect({x: 0, y: 0, width: 1280, height: 720}, cloudTransform);
  const outgoingCloudsVisible = issues?.entering && cloudBounds.x < 1280 && cloudBounds.y < 720
    && cloudBounds.x + cloudBounds.width > 0 && cloudBounds.y + cloudBounds.height > 0;

  return <div className="micro18-shared-scene" aria-label="Cost, Introducing flow-1 and Issue clusters 3 shared world"
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
        <Flow1WorldContent modelName="flow-1" state={flowState} time={flow.playback.time} blueDotScale={settings.flow.controls.blueDotScale} numberRowStagger={settings.flow.controls.numberRowStagger} coverMotion={settings.flow.controls.coverMotion}
          benchmarkContent={flow.playback21 ? <Flow2Graph playback={flow.playback21} beadStaggerSeconds={settings.flow.controls.beadStaggerSeconds}/> : undefined}/>
      </div>
      {issues && <div className="micro18-issues-surface" data-entry={issues.entering} data-native-time={issues.nativeTime}
        style={{transform: `translate(${issuePlacement.x}px,${issuePlacement.y}px) scale(${issuePlacement.scale})`}}>
        {issues.source22 ? <Micro22Scene sample={issues.source22} sharedEntry={issues.entering} showSubtitles={false}/> : <Micro20Scene sample={issues.source20} sharedEntry={issues.entering} showSubtitles={false}/>}
      </div>}
    </div>
    {(isFlow || outgoingCloudsVisible) && <div className="micro18-flow-cloud-layer" data-cloud-attachment={issues ? 'outgoing-world' : flow.entryProgress < 1 ? 'opening-world' : 'screen'}
      style={{transform: `translate(${cloudTransform.x}px,${cloudTransform.y}px) scale(${cloudTransform.scale})`}}>
      <DitherClouds progress={flowState.cloudProgress} yOffset={settings.flow.controls.cloudYOffset} translateY={flowState.cloudTranslateY}/>
    </div>}
    {/* The narrated cut draws one script-verbatim caption track instead. */}
    {settings.voiceover ? null : issues ? (issues.source22 ? (!issues.entering && <Micro22Subtitles sample={issues.source22}/>) : <IssueSubtitles narration={issues.entering ? null : issues.source20.narration} opacity={issues.source20.subtitleOpacity}/>) : isFlow ? (flow.playback21 ? <Flow21Subtitles progress={flow.playback21.progress}/> : <FlowSubtitles modelName="flow-1" progress={flow.playback.progress}/>) : <Subtitles progress={cost.progress}/>}
  </div>;
};

/** Keep the canonical canvas in one slot across Ultimate2 → Cost;
 * Flow owns its separate world-attached cloud plane, as before the frame-cloud rewrite. */
export const Ultimate3Scene = ({sample, settings}: {sample: Ultimate3Sample; settings: Ultimate3Settings}) => {
  let content: React.ReactNode;
  let clouds: CloudState | null = null;

  if (sample.chapter === 'ultimate2' && sample.ultimate2) {
    const state = worldState(sample.ultimate2, settings.ultimate2.controls, settings.ultimate2.streamBlocksRemoved);
    content = <Micro17Scene playback={sample.ultimate2} controls={settings.ultimate2.controls} blocksRemoved={settings.ultimate2.streamBlocksRemoved} showClouds={false} showSubtitles={!settings.voiceover}/>;
    if (state.cloudEnter > 0) clouds = {progress: state.cloudProgress, yOffset: 27,
      translateY: state.cloudTranslateY, translateX: state.cloudTranslateX};
  } else if ((sample.chapter === 'cost' && sample.cost) || (sample.chapter === 'flow' && sample.flow) || (sample.chapter === 'issues' && sample.issues)) {
    content = <SharedCostFlowIssuesWorld sample={sample} settings={settings}/>;
    if (sample.chapter === 'cost' && sample.cost) {
      // Preserve the settled y=27 handoff, then use Cost's native cloud sweep.
      clouds = {...sample.cost.cloud, yOffset: 27 + 10 * sample.cost.progress.cloudSweep};
    }
  } else if (sample.chapter === 'conclusion') {
    const stage = sample.conclusion === 'logo' ? 'logo' : 'placeholder';
    content = <>{stage === 'placeholder' && sample.conclusionSource22 ? <Micro22Scene sample={sample.conclusionSource22} showSubtitles={false}/> : stage === 'placeholder' && sample.conclusionSource
      ? <Micro20Scene sample={sample.conclusionSource} showSubtitles={false}/>
      : <Card kind={stage}/>}{!settings.voiceover && <ConclusionSubtitles stage={stage}/>}</>;
  } else {
    content = <Card kind="placeholder"/>;
  }

  return <div className="micro18-frame">
    {content}
    {clouds && <DitherClouds {...clouds}/>} 
    {settings.voiceover && <VoiceoverCaptions time={sample.time} voiceover={settings.voiceover}/>}
  </div>;
};
