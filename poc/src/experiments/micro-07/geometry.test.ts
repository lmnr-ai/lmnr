import assert from 'node:assert/strict';
import {BLOCKS,CELL,ELBOW,INTRO_BLOCKS,INTRO_STOPS,FIRST_THINKING_LENGTH,LENGTH,SEGMENTS,STRAIGHT_LENGTH,VERTICAL_LENGTH,blockOutline,pointAt,pose,travelProgress,elbowProgress} from './geometry';
import {sampleSnail} from './sample';
import {MICRO_07_DURATION,MICRO_07_TIMELINE} from './timeline';
assert.equal(SEGMENTS.length,2);
assert.equal(SEGMENTS[0].start.y,SEGMENTS[0].end.y);
assert.equal(SEGMENTS[1].start.x,SEGMENTS[1].end.x);
assert.equal(VERTICAL_LENGTH,6*CELL);
assert.equal(SEGMENTS[1].length,VERTICAL_LENGTH);
assert.equal(FIRST_THINKING_LENGTH,300);
assert.deepEqual(pointAt(STRAIGHT_LENGTH),ELBOW);
assert.equal(pointAt(LENGTH).y,ELBOW.y-VERTICAL_LENGTH);
assert.equal(MICRO_07_DURATION,18);
const intro={firstThinking:1,firstRead:1,secondThinking:1,firstWrite:1};
assert.equal(pose(travelProgress({...intro,remainingTrack:1})).distance,LENGTH);
assert.equal(pose(travelProgress({...intro,remainingTrack:0})).distance,INTRO_STOPS[3]);
const turnFraction=(STRAIGHT_LENGTH-INTRO_STOPS[3])/(LENGTH-INTRO_STOPS[3]);
for(const delta of [-.00001,0,.00001]){
 const travel=travelProgress({...intro,remainingTrack:turnFraction+delta});
 assert.ok(Math.abs(travel*LENGTH-(STRAIGHT_LENGTH+delta*(LENGTH-INTRO_STOPS[3])))<1e-8);
 assert.ok(Math.abs(elbowProgress(travel)-Math.max(0,delta*(LENGTH-INTRO_STOPS[3])/VERTICAL_LENGTH))<1e-8);
}
const target=BLOCKS.find(block=>block.id==='later-thinking-blue')!;
assert.equal(target.w,360);assert.equal(target.y,240);
for(const repeat of [0,1])for(const suffix of ['turn-top','read','turn-right','thinking-red','turn-left','write','bash-icon','bash']){
 assert.ok(!BLOCKS.some(block=>block.id===`repeat-${repeat}-${suffix}`),`removed repeat ${repeat} ${suffix}`);
}
// The route begins with a word; every following entry alternates icon/word,
// including the elbow and vertical segment. Pair removals cannot break this.
for(const [index,block] of BLOCKS.entries()){
 assert.equal(Boolean(block.asset),index%2===1,`icon/word alternation at ${block.id}`);
 assert.equal(Boolean(block.label),index%2===0,`word/icon alternation at ${block.id}`);
}
const predecessor=BLOCKS[BLOCKS.indexOf(target)-1];
assert.equal(predecessor.id,'repeat-1-chat');
assert.ok(!BLOCKS.some(block=>['repeat-0-chat','repeat-0-thinking-blue','repeat-1-thinking-blue'].includes(block.id)));
assert.equal(predecessor.x+predecessor.w,target.x,'removed pairs leave no gap');
for(const [index,block] of BLOCKS.filter(block=>block.y===240).entries()){
 const next=BLOCKS.filter(block=>block.y===240)[index+1];
 if(next)assert.equal(block.x+block.w,next.x,`contiguous after ${block.id}`);
}
assert.equal(blockOutline(BLOCKS.find(block=>block.id==='elbow-icon')!),'M0 0H120V60A60 60 0 0 1 60 120H0Z');
assert.deepEqual(INTRO_BLOCKS.map(block=>block.id),['thinking-blue','read','thinking-red','write']);
assert.deepEqual(INTRO_STOPS,[300,660,1140,1500]);
for(const [index,times] of [[.74,1,1.62],[2.14,2.2,2.4],[2.93,3.1,3.23],[3.86,3.9,3.91]].entries()){
 for(const time of times){
  const distance=sampleSnail(time).travelProgress*LENGTH;
  assert.ok(Math.abs(distance-INTRO_STOPS[index])<1e-8,`stop ${index} at ${time}`);
  assert.ok(Math.abs(pointAt(distance).x-(INTRO_BLOCKS[index].x+INTRO_BLOCKS[index].w))<1e-8);
 }
}
// Locked user defaults, with one explicitly merged traversal interval.
const expected={agentEnter:[0,.23],firstThinking:[.48,.26],firstRead:[1.63,.51],secondThinking:[2.41,.52],firstWrite:[3.24,.62],remainingTrack:[3.92,2.75],bubbleEnter:[6.28,.35],cameraReturn:[6.95,1.25],redThinkingLift:[7.01,.27],readLift:[7.44,.25],thinkingLift:[7.81,.29],highlight:[8.4,1.1]};
const boundaries=[0,18];
for(const key of Object.keys(expected) as (keyof typeof expected)[]){
 const clip=MICRO_07_TIMELINE[key];const [at,duration]=expected[key];
 assert.equal(clip.at,at);assert.equal(clip.duration,duration);assert.equal(clip.transition.duration,duration);
 assert.deepEqual(clip.from,{progress:0});assert.deepEqual(clip.to,{progress:1});
 const ease=key==='remainingTrack'?[.26,.08,1,1]:key==='highlight'?[0,0,1,1]:['agentEnter','bubbleEnter'].includes(key)?[.22,1,.36,1]:[.45,0,.55,1];
 assert.deepEqual(clip.transition.ease,ease);
 boundaries.push(at,at+duration/2,at+duration);
}
assert.ok(!('elbowRise' in MICRO_07_TIMELINE));
const snapshots=boundaries.map(sampleSnail);
for(let i=boundaries.length-1;i>=0;i--)assert.deepEqual(sampleSnail(boundaries[i]),snapshots[i]);
assert.equal(sampleSnail(6.67).travelProgress,1);
assert.equal(sampleSnail(6.67).elbowRise,1);
for(const [key,at,duration] of [['bubbleEnter',6.28,.35],['cameraReturn',6.95,1.25],['redThinkingLift',7.01,.27],['readLift',7.44,.25],['thinkingLift',7.81,.29],['highlight',8.4,1.1]] as const){
 assert.equal(sampleSnail(at-.001).reasoning[key],0);
 assert.ok(sampleSnail(at+duration/2).reasoning[key]>0);
 assert.equal(sampleSnail(at+duration+.001).reasoning[key],1);
}
console.log('PASS: requested defaults, four stops, continuous merged traversal, camera release, deterministic clips');
