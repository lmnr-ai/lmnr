import {DialRoot,DialTimeline,useDialKit,useDialTimeline} from 'dialkit';
import {ExperimentPicker} from '../ExperimentPicker';
import {Micro06Sequence} from './Sequence';
import {sampleSnail} from './sample';
import {travelProgress} from './geometry';
import {DEFAULT_WAVE_ENVELOPE} from './wave';
import {MICRO_06_TIMELINE,MICRO_06_TIMELINE_ID} from './timeline';

export const Micro06App=()=>{
  // TODO(production): DialKit's clip.current values are the scrubbable authoring preview.
  // Replace them with equivalent real Motion animations using the tuned timeline
  // timings and transitions, then remove useDialTimeline and <DialTimeline />.
  const timeline=useDialTimeline('Snail — Master (seconds)',MICRO_06_TIMELINE,{id:MICRO_06_TIMELINE_ID,autoplay:false,loop:true,persist:true});
  // Grid and mask widths deliberately locked together at Figma's 120px.
  const appearance=useDialKit('Snail appearance',{palette:{type:'select',options:['vibrant','metal'],default:'vibrant'},spinnerSpeed:[1.9,0.1,3,0.05]},{id:'micro-animation-06-appearance-v5',persist:true});
  // Percent of the blueWave clip: preserves the envelope when retiming it.
  const wave=useDialKit('Blue wave — % of clip',{
    'Tile fade in':[3.5,0,5,0.25],
    'Tile fade out':[45,0.5,50,0.25],
  },{id:'micro-animation-06-wave-envelope-v2',persist:true});
  const query=new URLSearchParams(window.location.search);
  const requested=Number(query.get('time'));
  // Explicit deterministic inspection mode, never a wall-clock animation fallback.
  const sampled=query.has('time')&&Number.isFinite(requested)?sampleSnail(Math.max(0,requested)):null;
  const props=sampled??{time:timeline.time,agentScale:timeline.agentEnter.current.progress,travelProgress:travelProgress(timeline.firstThinking.current.progress,timeline.remainingTrack.current.progress),
    overviewActivity:{heroDim:timeline.heroDim.current.progress,blueWave:timeline.blueWave.current.progress},
    handoffProgress:{worldFade:timeline.worldFade.current.progress,spinnerExit:timeline.spinnerExit.current.progress,agentWhiten:timeline.agentWhiten.current.progress,handoff:timeline.handoff.current.progress,overviewZoom:timeline.overviewZoom.current.progress}};
  return <main className="micro06-app">
    <div className="micro06-stage"><Micro06Sequence {...props} waveEnvelope={sampled?DEFAULT_WAVE_ENVELOPE:{fadeIn:wave['Tile fade in']/100,fadeOut:wave['Tile fade out']/100}} palette={(query.get('palette')??appearance.palette)==='metal'?'metal':'vibrant'} spinnerSpeed={sampled?1.9:appearance.spinnerSpeed}/></div>
    <ExperimentPicker current="micro-06"/><DialRoot/><DialTimeline/>
  </main>;
};
