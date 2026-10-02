import {DialRoot,DialTimeline,useDialKit,useDialTimeline} from 'dialkit';
import {ExperimentPicker} from '../ExperimentPicker';
import {Micro07Sequence} from './Sequence';
import {sampleSnail} from './sample';
import {travelProgress,elbowProgress} from './geometry';
import {MICRO_07_TIMELINE,MICRO_07_TIMELINE_ID} from './timeline';

export const Micro07App=()=>{
  // TODO(production): DialKit's clip.current values are the scrubbable authoring preview.
  // Replace them with equivalent real Motion animations using the tuned timeline
  // timings and transitions, then remove useDialTimeline and <DialTimeline />.
  const timeline=useDialTimeline('Snail Straight — Master (seconds)',MICRO_07_TIMELINE,{id:MICRO_07_TIMELINE_ID,autoplay:false,loop:true,persist:true});
  // Grid cells are 120px; block-local reveal clips follow the agent's route distance.
  const appearance=useDialKit('Snail appearance',{palette:{type:'select',options:['vibrant','metal'],default:'vibrant'},spinnerSpeed:[1.9,0.1,3,0.05],highlightPadding:[2,0,6,.5]},{id:'micro-animation-07-appearance-v2',persist:true});
  const query=new URLSearchParams(window.location.search);
  const requested=Number(query.get('time'));
  // Explicit deterministic inspection mode, never a wall-clock animation fallback.
  const sampled=query.has('time')&&Number.isFinite(requested)?sampleSnail(Math.max(0,requested)):null;
  const travel=travelProgress({firstThinking:timeline.firstThinking.current.progress,firstRead:timeline.firstRead.current.progress,secondThinking:timeline.secondThinking.current.progress,firstWrite:timeline.firstWrite.current.progress,remainingTrack:timeline.remainingTrack.current.progress});
  const props=sampled??{time:timeline.time,agentScale:timeline.agentEnter.current.progress,travelProgress:travel,elbowRise:elbowProgress(travel),
    reasoning:{bubbleEnter:timeline.bubbleEnter.current.progress,cameraReturn:timeline.cameraReturn.current.progress,redThinkingLift:timeline.redThinkingLift.current.progress,readLift:timeline.readLift.current.progress,thinkingLift:timeline.thinkingLift.current.progress,highlight:timeline.highlight.current.progress}};
  return <main className="micro06-app">
    <div className="micro06-stage"><Micro07Sequence {...props} palette={(query.get('palette')??appearance.palette)==='metal'?'metal':'vibrant'} spinnerSpeed={sampled?1.9:appearance.spinnerSpeed} highlightPadding={sampled?2:appearance.highlightPadding}/></div>
    <ExperimentPicker current="micro-07"/><DialRoot/><DialTimeline/>
  </main>;
};
