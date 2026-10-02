import assert from 'node:assert/strict';
import {BLOCKS,CELL,ELBOW,LENGTH,STRAIGHT_LENGTH,WAYPOINTS} from './geometry';
import {blockReveal,type BlockReveal} from './routeMask';

const first=BLOCKS[0];
const elbow=BLOCKS.find(block=>block.id==='elbow-icon')!;
const terminalIcon=BLOCKS.find(block=>block.id==='terminal-icon')!;
function covers(region:BlockReveal,x:number,y:number){
 return region.rects.some(r=>r.width>0&&r.height>0&&x>=r.x&&x<=r.x+r.width&&y>=r.y&&y<=r.y+r.height)
  ||region.circles.some(c=>(x-c.cx)**2+(y-c.cy)**2<=c.r**2);
}
for(const block of BLOCKS){
 assert.deepEqual(blockReveal(block,0),{rects:[],circles:[],complete:false});
 // Previously visited points cannot become hidden again, including at the turn.
 const points=[];
 for(let x=6;x<block.w;x+=12)for(let y=6;y<block.h;y+=12)points.push({x:block.x+x,y:block.y+y,seen:false});
 for(let d=0;d<=LENGTH;d+=10){
  const region=blockReveal(block,d);
  for(const point of points){
   const visible=covers(region,point.x,point.y);
   assert.ok(!point.seen||visible,`${block.id} lost visible point at ${d}`);
   point.seen=visible;
  }
 }
}
assert.equal(blockReveal(first,1).rects[0].width,CELL/2+1);
assert.ok(blockReveal(first,300).complete);
for(const block of BLOCKS.filter(b=>b.y===first.y&&b.id!=='elbow-icon')){
 const halfway=block.x+block.w/2-WAYPOINTS[0].x;
 assert.ok(Math.abs(blockReveal(block,halfway).rects[0].width-block.w/2)<1e-8);
}
// No premature exposure to the right of the loader during the approach.
const approaching=blockReveal(elbow,STRAIGHT_LENGTH-15);
assert.equal(approaching.rects[0].width,45);
assert.ok(!covers(approaching,ELBOW.x+45,ELBOW.y-55));
// At the turn, left corners remain visible; right corners outside the loader
// disk do NOT show through. This caught the old accelerated full-square reveal.
const turning=blockReveal(elbow,STRAIGHT_LENGTH);
assert.ok(covers(turning,elbow.x+5,elbow.y+5));
assert.ok(!covers(turning,ELBOW.x+55,ELBOW.y-55));
assert.ok(!covers(turning,ELBOW.x+55,ELBOW.y+55));
assert.ok(covers(turning,ELBOW.x+40,ELBOW.y));
const rising=blockReveal(elbow,STRAIGHT_LENGTH+30);
assert.ok(covers(rising,elbow.x+5,elbow.y+5));
assert.ok(covers(rising,ELBOW.x+55,ELBOW.y-25));
assert.ok(!covers(rising,ELBOW.x+55,ELBOW.y-55));
assert.ok(blockReveal(elbow,STRAIGHT_LENGTH+60).complete);
assert.ok(blockReveal(elbow,LENGTH).complete);
const iconEntry=STRAIGHT_LENGTH+ELBOW.y-(terminalIcon.y+terminalIcon.h);
assert.equal(blockReveal(terminalIcon,iconEntry).rects.length,0);
assert.deepEqual(blockReveal(terminalIcon,iconEntry+60).rects,[{x:terminalIcon.x,y:terminalIcon.y+60,width:120,height:60}]);
for(const id of ['later-thinking-blue','later-read','later-thinking-red'])assert.ok(blockReveal(BLOCKS.find(b=>b.id===id)!,STRAIGHT_LENGTH).complete);
const seeks=[LENGTH,0,300,STRAIGHT_LENGTH,STRAIGHT_LENGTH+1,10,LENGTH,300];
const snapshots=seeks.map(d=>BLOCKS.map(b=>blockReveal(b,d)));
for(let i=seeks.length-1;i>=0;i--)assert.deepEqual(BLOCKS.map(b=>blockReveal(b,seeks[i])),snapshots[i]);
console.log('PASS: block-local monotonic reveals, no elbow corner peeking, upward icons, random seeks');
