import assert from 'node:assert/strict';
import {OVERVIEW,OVERVIEW_TILES,INITIAL_HANDOFF,matchHandoff,projectOverview} from './overview';
import {sampleSnail} from './sample';
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-8,`${a} ≈ ${b}`);
const at=(time:number)=>matchHandoff(sampleSnail(time).handoffProgress);
assert.equal(OVERVIEW_TILES.length,135);
assert.equal(new Set(OVERVIEW_TILES.map(tile=>tile.id)).size,135);
assert.equal(OVERVIEW_TILES.filter(tile=>tile.hero).length,1);
const hero=OVERVIEW_TILES.find(tile=>tile.hero)!;
assert.deepEqual({x:hero.x,y:hero.y},{x:566,y:286});
assert.deepEqual(projectOverview(hero.x+74,hero.y+74,10),{x:640,y:360});
assert.deepEqual(projectOverview(hero.x,hero.y,10),{x:-100,y:-380});
assert.deepEqual(projectOverview(hero.x+148,hero.y+148,10),{x:1380,y:1100});
assert.equal(OVERVIEW.radius*OVERVIEW.initialScale,60);
for(const tile of OVERVIEW_TILES){
  assert.equal(tile.x,-484+150*tile.column);assert.equal(tile.y,-314+150*tile.row);
  assert.deepEqual(projectOverview(tile.x,tile.y,1),{x:tile.x,y:tile.y});
}
assert.deepEqual(at(6.6),matchHandoff(INITIAL_HANDOFF));
assert.ok(at(6.8).worldOpacity>0&&at(6.8).worldOpacity<1);
assert.ok(at(6.8).spinnerScale>0&&at(6.8).spinnerScale<1);
assert.equal(at(7.1).owner,'snail');
assert.equal(at(7.13).owner,'overview');
// Equivalent seam descriptors on both sides: one opaque white radius60 dot.
for(const time of [7.12,7.13,7.27]){
  const state=at(time);
  near(state.worldOpacity,0);near(state.spinnerScale,0);near(state.whiteMix,1);near(state.scale,10);
}
let previous=10;
for(let frame=Math.ceil(7.13*30);frame<540;frame++){
  const state=at(frame/30);
  assert.equal(state.owner,'overview');assert.ok(state.scale<=previous);assert.ok(state.scale>=1);previous=state.scale;
}
near(at(9.57).scale,1);near(at(539/30).scale,1);
const times=[14.9,0,8.2,7.1,4,9.57,7.13,6.8];
const samples=times.map(time=>sampleSnail(time));
for(let i=times.length-1;i>=0;i--)assert.deepEqual(sampleSnail(times[i]),samples[i]);
assert.equal(matchHandoff({...INITIAL_HANDOFF,overviewZoom:1}).scale,10);
console.log('PASS: overview geometry, offscreen initial edges, retimed seam, monotonic zoom, final frame, random/reverse seeking');
