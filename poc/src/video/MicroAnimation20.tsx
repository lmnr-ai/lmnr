import {useCurrentFrame} from 'remotion';
import type {Micro15Controls,Micro15Timing} from '../experiments/micro-15/timeline';
import {Micro20Scene} from '../experiments/micro-20/Scene';
import {sampleMicro20Frame} from '../experiments/micro-20/sample';
import {ISSUE_START,MICRO_20_DEFAULTS,MICRO_20_ISSUE_DEFAULTS,MICRO_20_ISSUE_TIMING,PRELUDE_TIMING,type Micro20Controls,type PreludeTiming} from '../experiments/micro-20/timeline';
export type MicroAnimation20Props=Micro20Controls&{preludeTiming:PreludeTiming;issueControls:Micro15Controls;issueTiming:Micro15Timing;issueStart:number};
export const MICRO_20_VIDEO_DEFAULTS:MicroAnimation20Props={...MICRO_20_DEFAULTS,preludeTiming:PRELUDE_TIMING,issueControls:MICRO_20_ISSUE_DEFAULTS,issueTiming:MICRO_20_ISSUE_TIMING,issueStart:ISSUE_START};
export const MicroAnimation20=({preludeTiming,issueControls,issueTiming,issueStart,...controls}:MicroAnimation20Props)=><Micro20Scene sample={sampleMicro20Frame(useCurrentFrame(),controls,preludeTiming,issueControls,issueTiming,issueStart)}/>;
