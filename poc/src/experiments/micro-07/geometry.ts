export const CELL=120;
export const CENTER={x:640,y:360};
export type Point={x:number;y:number};
export type Block={id:string;x:number;y:number;w:number;h:number;asset?:string;label?:string;colors?:[string,string];vertical?:boolean;reverse?:boolean;textX?:number};

const horizontal:Omit<Block,'x'|'y'>[]=[
  {id:'thinking-blue',w:360,h:CELL,label:'Thinking',colors:['#6492d8','#3d81eb'],textX:32},
  {id:'turn-top',w:CELL,h:CELL,asset:'icon-b.svg'},
  {id:'read',w:240,h:CELL,label:'Read',colors:['#ef9e6b','#ee7955']},
  {id:'turn-right',w:CELL,h:CELL,asset:'icon-d.svg'},
  {id:'thinking-red',w:360,h:CELL,label:'Thinking...',colors:['#f2747d','#ef8d8f'],textX:20},
  {id:'turn-left',w:CELL,h:CELL,asset:'icon-c.svg'},
  {id:'write',w:240,h:CELL,label:'Write',colors:['#68ba92','#1cac66']},
  {id:'bash-icon',w:CELL,h:CELL,asset:'icon-a.svg'},
  {id:'bash',w:240,h:CELL,label:'Bash',colors:['#f2b6dc','#f694d2']},
];
const blocks:Block[]=[];let x=480;
const add=(spec:Omit<Block,'x'|'y'>,id=spec.id)=>{blocks.push({...spec,id,x,y:240});x+=spec.w;};
// The earlier track remains straight. The final authored run begins at the
// later horizontal blue Thinking block, then turns upward at the red elbow.
for(let cycle=0;cycle<3;cycle++){
  // Omit the middle repeat entirely, including its purple/blue opening pair.
  // Retain the final purple icon directly before the lifting blue Thinking.
  if(cycle===2)add({id:'chat',w:CELL,h:CELL,asset:'icon-e.svg'},'repeat-1-chat');
  const specs=cycle===0?horizontal:[];
  for(const spec of specs)add(spec,cycle?`repeat-${cycle-1}-${spec.id}`:spec.id);
}
add({id:'later-thinking-blue',w:360,h:CELL,label:'Thinking',colors:['#6492d8','#3d81eb'],textX:32});
add({id:'later-icon-read',w:CELL,h:CELL,asset:'icon-b.svg'});
add({id:'later-read',w:240,h:CELL,label:'Read',colors:['#ef9e6b','#ee7955'],textX:32});
add({id:'later-icon-red',w:CELL,h:CELL,asset:'icon-d.svg'});
add({id:'later-thinking-red',w:360,h:CELL,label:'Thinking...',colors:['#f2747d','#ef8d8f'],textX:32});
const elbowCellX=x;add({id:'elbow-icon',w:CELL,h:CELL,asset:'icon-c.svg'});
export const ELBOW={x:elbowCellX+60,y:300};
// The terminal three cells rise from the elbow. Their vertical labels stay
// upright through CSS rather than rotating the glyphs.
blocks.push(
  {id:'terminal-bash',x:elbowCellX,y:0,w:CELL,h:240,label:'Bash',colors:['#f2b6dc','#f694d2'],vertical:true},
  {id:'terminal-icon',x:elbowCellX,y:-120,w:CELL,h:CELL,asset:'icon-a.svg'},
  {id:'terminal-thinking-blue',x:elbowCellX,y:-480,w:CELL,h:360,label:'Thinking',colors:['#6492d8','#3d81eb'],vertical:true},
);
export const BLOCKS=blocks;
// Continue another three cells beyond the authored vertical blocks so the
// loader exits above the viewport while leaving the completed trace behind.
export const VERTICAL_LENGTH=6*CELL;
export const WAYPOINTS:Point[]=[{x:540,y:300},ELBOW,{x:ELBOW.x,y:ELBOW.y-VERTICAL_LENGTH}];
export const STRAIGHT_LENGTH=ELBOW.x-WAYPOINTS[0].x;
export const LENGTH=STRAIGHT_LENGTH+VERTICAL_LENGTH;
export const SEGMENTS=[{start:WAYPOINTS[0],end:WAYPOINTS[1],length:STRAIGHT_LENGTH},{start:WAYPOINTS[1],end:WAYPOINTS[2],length:VERTICAL_LENGTH}];
// Circle centers stop at each word block's trailing edge, just like the
// original first-Thinking stop. Square icon cells are not separate stops.
export const INTRO_BLOCKS=BLOCKS.filter(block=>block.label&&!block.vertical).slice(0,4);
export const INTRO_STOPS=INTRO_BLOCKS.map(block=>block.x+block.w-WAYPOINTS[0].x);
export const FIRST_THINKING_LENGTH=INTRO_STOPS[0];
export const PATH=`M${WAYPOINTS[0].x} ${WAYPOINTS[0].y}L${ELBOW.x} ${ELBOW.y}L${WAYPOINTS[2].x} ${WAYPOINTS[2].y}`;
export const clamp=(value:number)=>Math.max(0,Math.min(1,value));
export type TravelClips={firstThinking:number;firstRead:number;secondThinking:number;firstWrite:number;remainingTrack:number};
export function travelProgress(clips:TravelClips){
 const intro=[clips.firstThinking,clips.firstRead,clips.secondThinking,clips.firstWrite];
 const distance=intro.reduce((sum,p,index)=>sum+clamp(p)*(INTRO_STOPS[index]-(INTRO_STOPS[index-1]??0)),0);
 return (distance+clamp(clips.remainingTrack)*(LENGTH-INTRO_STOPS[3]))/LENGTH;
}
// Camera release follows actual route position, not a separate authoring clip.
export function elbowProgress(travel:number){return clamp((clamp(travel)*LENGTH-STRAIGHT_LENGTH)/VERTICAL_LENGTH);}
export function pointAt(distance:number):Point{const d=Math.max(0,Math.min(LENGTH,distance));return d<=STRAIGHT_LENGTH?{x:540+d,y:300}:{x:ELBOW.x,y:300-(d-STRAIGHT_LENGTH)};}
export function pose(travel:number){const distance=clamp(travel)*LENGTH,point=pointAt(distance);return{distance,point,agent:CENTER,camera:{x:CENTER.x-point.x,y:CENTER.y-point.y}};}
// Only the actual elbow clips its exterior corner; straight cells remain square.
export function blockOutline(block:Block){return block.id==='elbow-icon'?'M0 0H120V60A60 60 0 0 1 60 120H0Z':'M0 0H120V120H0Z';}
export const REVEAL_BOUNDS={x:360,y:-600,width:x-240,height:1020};
