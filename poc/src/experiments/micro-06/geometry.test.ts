import assert from 'node:assert/strict';
import {BLOCKS,CELL,FIRST_THINKING_LENGTH,LENGTH,SEGMENTS,WAYPOINTS,REVEAL_BOUNDS,blockOutline,pointAt,pose} from './geometry';
import {sampleSnail} from './sample';
import {MICRO_06_DURATION} from './timeline';
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-8,`${a} ≈ ${b}`);
assert.equal(BLOCKS.filter(b=>b.id.endsWith('-chat')).length,4);
assert.equal(BLOCKS.at(-1)!.id,'final-chat');
assert.deepEqual(WAYPOINTS.at(-1),{x:BLOCKS.at(-1)!.x+60,y:BLOCKS.at(-1)!.y+60});
assert.equal(BLOCKS.filter(b=>b.id.includes('thinking-blue')).length,4);
assert.ok(!BLOCKS.some(b=>b.id==='start'));
for(const b of BLOCKS.filter(b=>b.label==='Bash')){
  assert.equal(Math.max(b.w,b.h),2*CELL,`Bash length: ${b.id}`);
  assert.equal(Math.min(b.w,b.h),CELL,`Bash width: ${b.id}`);
}
assert.equal(BLOCKS.find(b=>b.id==='thinking-blue')!.label,'Thinking');
assert.equal(BLOCKS.find(b=>b.id==='thinking-blue')!.textX,32);
assert.ok(BLOCKS.filter(b=>b.id.includes('thinking')&&b.id!=='thinking-blue').every(b=>b.label==='Thinking...')); 
for(let cycle=0;cycle<3;cycle++){
  const blocks=BLOCKS.filter(b=>b.id.startsWith(`repeat-${cycle}-`));
  assert.deepEqual(blocks.map(b=>b.id.replace(`repeat-${cycle}-`,'')),['chat','thinking-blue','turn-top','read','turn-right','thinking-red','turn-left','write','bash-icon','bash']);
}
// Rectangles may touch at edges, but must never overlap or reveal a future crossing.
for(let i=0;i<BLOCKS.length;i++)for(let j=i+1;j<BLOCKS.length;j++){
  const a=BLOCKS[i],b=BLOCKS[j];
  assert.ok(Math.min(a.x+a.w,b.x+b.w)<=Math.max(a.x,b.x)||Math.min(a.y+a.h,b.y+b.h)<=Math.max(a.y,b.y),`overlap: ${a.id}, ${b.id}`);
}
let distance=0;
for(const s of SEGMENTS){assert.deepEqual(pointAt(distance),s.start);distance+=s.length;assert.deepEqual(pointAt(distance),s.end);}
for(let d=0;d<=LENGTH;d++){
  const s=pose(d/LENGTH),p=s.point;
  assert.ok(BLOCKS.some(b=>p.x>=b.x&&p.x<=b.x+b.w&&p.y>=b.y&&p.y<=b.y+b.h),`gap at ${d}: ${JSON.stringify(p)}`);
  near(s.camera.x+p.x,640);near(s.camera.y+p.y,360);
}
for(const b of BLOCKS){
  assert.ok(b.x>=REVEAL_BOUNDS.x&&b.y>=REVEAL_BOUNDS.y&&b.x+b.w<=REVEAL_BOUNDS.x+REVEAL_BOUNDS.width&&b.y+b.h<=REVEAL_BOUNDS.y+REVEAL_BOUNDS.height);
}
assert.equal(FIRST_THINKING_LENGTH,300);
for(const t of [1.38,1.5,1.7,1.9,1.99])near(pose(sampleSnail(t).travelProgress).distance,FIRST_THINKING_LENGTH);
let previous=0;
for(let frame=0;frame<=MICRO_06_DURATION*30;frame++){
  const d=pose(sampleSnail(frame/30).travelProgress).distance;assert.ok(d>=previous);previous=d;
}
assert.equal(MICRO_06_DURATION,18);
near(previous,LENGTH);
near(pose(sampleSnail(6.63).travelProgress).distance,LENGTH);
assert.ok(pose(sampleSnail(6.3).travelProgress).distance<LENGTH);
assert.ok(SEGMENTS.some(s=>s.end.y<s.start.y),'upward detour');
assert.ok(WAYPOINTS.at(-1)!.x>WAYPOINTS[0].x&&WAYPOINTS.at(-1)!.y>WAYPOINTS[0].y);
const outlines: Record<string,string> = {
  'turn-top':'M0 0H60A60 60 0 0 1 120 60V120H0Z',
  'turn-right':'M0 0H120V60A60 60 0 0 1 60 120H0Z',
  'turn-left':'M0 60A60 60 0 0 1 60 0H120V120H0Z',
  'bash-icon':'M0 0H120V120H60A60 60 0 0 1 0 60Z',
  'repeat-0-chat':'M0 0H60A60 60 0 0 1 120 60V120H0Z',
  'repeat-0-turn-top':'M0 0H120V120H60A60 60 0 0 1 0 60Z',
  'repeat-0-turn-right':'M0 0H60A60 60 0 0 1 120 60V120H0Z',
  'repeat-1-chat':'M0 0H120V120H60A60 60 0 0 1 0 60Z',
  'repeat-1-turn-top':'M0 0H120V60A60 60 0 0 1 60 120H0Z',
  'repeat-1-turn-right':'M0 60A60 60 0 0 1 60 0H120V120H0Z',
};
for(const [id,expected] of Object.entries(outlines))assert.equal(blockOutline(BLOCKS.find(b=>b.id===id)!),expected,id);
const turns=WAYPOINTS.flatMap((p,i)=>{
  if(i===0||i===WAYPOINTS.length-1)return [];
  const a=WAYPOINTS[i-1],b=WAYPOINTS[i+1];
  return (p.x-a.x)*(b.y-p.y)-(p.y-a.y)*(b.x-p.x)!==0?[p]:[];
});
const icons=BLOCKS.filter(b=>b.asset);
for(const p of turns)assert.ok(icons.some(b=>b.x+60===p.x&&b.y+60===p.y),`turn outside icon: ${JSON.stringify(p)}`);
for(const b of icons){
  if(b.id!=='final-chat')assert.ok(turns.some(p=>p.x===b.x+60&&p.y===b.y+60),`icon on straight: ${b.id}`);
  assert.ok(blockOutline(b).includes('A60 60'),`missing exterior rounding: ${b.id}`);
}
assert.equal(sampleSnail(0).agentScale,0);
assert.ok(sampleSnail(.3).agentScale>0&&sampleSnail(.3).agentScale<1);
near(sampleSnail(.6).agentScale,1);
near(sampleSnail(.8).agentScale,1);
assert.equal(sampleSnail(.6).travelProgress,0);
assert.equal(CELL,120);
console.log(`PASS: 3 added cycles; ordered chat/blocks; no overlaps; ${LENGTH+1} on-track centered samples; mask bounds; pause; upward detour; full duration`);
