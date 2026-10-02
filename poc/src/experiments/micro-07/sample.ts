import {computeClipState,computeStaticTimeline,parseTimelineConfig} from 'dialkit/timeline';
import {MICRO_07_TIMELINE} from './timeline';
import {travelProgress,elbowProgress} from './geometry';
const {clips}=computeStaticTimeline(parseTimelineConfig(MICRO_07_TIMELINE),{});
export function sampleSnail(time:number){const progress=(key:string)=>(computeClipState(clips.find(c=>c.key===key)!,time,time) as {current:{progress:number}}).current.progress;
  const travel=travelProgress({firstThinking:progress('firstThinking'),firstRead:progress('firstRead'),secondThinking:progress('secondThinking'),firstWrite:progress('firstWrite'),remainingTrack:progress('remainingTrack')});
  return {time,agentScale:progress('agentEnter'),travelProgress:travel,elbowRise:elbowProgress(travel),
    reasoning:{bubbleEnter:progress('bubbleEnter'),cameraReturn:progress('cameraReturn'),redThinkingLift:progress('redThinkingLift'),readLift:progress('readLift'),thinkingLift:progress('thinkingLift'),highlight:progress('highlight')}};
}
