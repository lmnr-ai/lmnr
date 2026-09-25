import {Micro06Scene,type Micro06SceneProps} from './Scene';
import {AgentOverviewScene} from './OverviewScene';
import {INITIAL_ACTIVITY,type OverviewActivity,type WaveEnvelope} from './wave';
import {INITIAL_HANDOFF,matchHandoff,type HandoffProgress} from './overview';

export type Micro06SequenceProps=Micro06SceneProps&{handoffProgress?:HandoffProgress;overviewActivity?:OverviewActivity;waveEnvelope?:WaveEnvelope};
export const Micro06Sequence=({handoffProgress=INITIAL_HANDOFF,overviewActivity=INITIAL_ACTIVITY,waveEnvelope,...snail}:Micro06SequenceProps)=>{
  const match=matchHandoff(handoffProgress);
  return match.owner==='overview'
    ? <AgentOverviewScene scale={match.scale} activity={overviewActivity} waveEnvelope={waveEnvelope}/>
    : <Micro06Scene {...snail} worldOpacity={match.worldOpacity} spinnerScale={match.spinnerScale} whiteMix={match.whiteMix}/>;
};
