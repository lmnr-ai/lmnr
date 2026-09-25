import {computeClipState,computeStaticTimeline,parseTimelineConfig} from 'dialkit/timeline';
import {MICRO_06_TIMELINE} from './timeline';
import {travelProgress} from './geometry';
const {clips}=computeStaticTimeline(parseTimelineConfig(MICRO_06_TIMELINE),{});
export function sampleSnail(time:number){
  const progress=(key:string)=>(computeClipState(clips.find(c=>c.key===key)!,time,time) as {current:{progress:number}}).current.progress;
  return {time,agentScale:progress('agentEnter'),travelProgress:travelProgress(progress('firstThinking'),progress('remainingTrack')),
    overviewActivity:{heroDim:progress('heroDim'),blueWave:progress('blueWave')},
    handoffProgress:{worldFade:progress('worldFade'),spinnerExit:progress('spinnerExit'),agentWhiten:progress('agentWhiten'),handoff:progress('handoff'),overviewZoom:progress('overviewZoom')}};
}
