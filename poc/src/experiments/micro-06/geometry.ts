export const CELL = 120;
export const CENTER = {x: 640, y: 360};
export type Point = {x: number; y: number};

// Figma 4720:9774, translated one cell left after removing the starting tile.
// REVIEW: deliberate orthogonal turns, not rounded shortcuts through blank cells.
const BASE_WAYPOINTS: Point[] = [
  {x: 540, y: 300}, {x: 900, y: 300}, {x: 900, y: 660},
  {x: 420, y: 660}, {x: 420, y: 1020}, {x: 660, y: 1020},
];
type Direction = 'right' | 'down' | 'up';
const vectors: Record<Direction, Point> = {right:{x:1,y:0},down:{x:0,y:1},up:{x:0,y:-1}};
// Each cycle preserves chat → blue → icon → Read → icon → red → icon → Write → icon → Bash.
// No leftward movement; the upward detour occupies a new column, avoiding crossings.
const DIRECTIONS: Direction[][] = [
  ['down','right','down','right','down'],
  ['right','up','right','down','right'],
  ['down','right','down','right','down'],
];
export const WAYPOINTS: Point[] = [...BASE_WAYPOINTS];
const extensionBlocks: Block[] = [];
const blueprint: Omit<Block,'x'|'y'>[] = [
  {id:'thinking-blue',w:360,h:120,label:'Thinking...',colors:['#6492d8','#3d81eb'],textX:20},
  {id:'turn-top',w:120,h:120,asset:'icon-b.svg'},
  {id:'read',w:240,h:120,label:'Read',colors:['#ef9e6b','#ee7955']},
  {id:'turn-right',w:120,h:120,asset:'icon-d.svg'},
  {id:'thinking-red',w:360,h:120,label:'Thinking...',colors:['#f2747d','#ef8d8f'],textX:20},
  {id:'turn-left',w:120,h:120,asset:'icon-c.svg'},
  {id:'write',w:240,h:120,label:'Write',colors:['#68ba92','#1cac66']},
  {id:'bash-icon',w:120,h:120,asset:'icon-a.svg'},
  {id:'bash',w:240,h:120,label:'Bash',colors:['#f2b6dc','#f694d2']},
];
let cursor = {...WAYPOINTS[WAYPOINTS.length-1]};
for (const [cycle,directions] of DIRECTIONS.entries()) {
  // Every Bash is exactly two cells; extend straight from its last cell
  // into the next chat tile before turning.
  const previousDirection=cycle===0?vectors.right:vectors[DIRECTIONS[cycle-1][4]];
  const gap=CELL;
  cursor = {x:cursor.x+previousDirection.x*gap,y:cursor.y+previousDirection.y*gap};
  WAYPOINTS.push({...cursor});
  extensionBlocks.push({id:`repeat-${cycle}-chat`,x:cursor.x-60,y:cursor.y-60,w:120,h:120,asset:'icon-e.svg'});
  for (let pair=0;pair<5;pair++) {
    const direction=directions[pair], v=vectors[direction];
    const text=blueprint[pair*2], icon=blueprint[pair*2+1];
    const start={x:cursor.x+v.x*CELL,y:cursor.y+v.y*CELL};
    const end={x:start.x+v.x*(text.w-CELL),y:start.y+v.y*(text.w-CELL)};
    extensionBlocks.push({...text,id:`repeat-${cycle}-${text.id}`,
      x:Math.min(start.x,end.x)-60,y:Math.min(start.y,end.y)-60,
      w:direction==='right'?text.w:CELL,h:direction==='right'?CELL:text.w,
      vertical:direction!=='right',reverse:direction==='up'});
    cursor=end;
    if(icon){
      cursor={x:cursor.x+v.x*CELL,y:cursor.y+v.y*CELL};
      extensionBlocks.push({...icon,id:`repeat-${cycle}-${icon.id}`,x:cursor.x-60,y:cursor.y-60});
    }
    WAYPOINTS.push({...cursor});
  }
}
// Finish on a purple chat, directly after the final two-cell Bash.
const finalDirection=vectors[DIRECTIONS[DIRECTIONS.length-1][4]];
cursor={x:cursor.x+finalDirection.x*CELL,y:cursor.y+finalDirection.y*CELL};
WAYPOINTS.push({...cursor});
extensionBlocks.push({id:'final-chat',x:cursor.x-60,y:cursor.y-60,w:CELL,h:CELL,asset:'icon-e.svg'});

export const SEGMENTS = WAYPOINTS.slice(1).map((end, i) => {
  const start = WAYPOINTS[i];
  return {start, end, length: Math.hypot(end.x - start.x, end.y - start.y)};
});
export const LENGTH = SEGMENTS.reduce((sum, s) => sum + s.length, 0);
// Stop half a tile before the yellow corner during the authored pause. The
// remaining clip traverses the withheld half-tile first, preserving full route.
export const FIRST_THINKING_LENGTH = SEGMENTS[0].length-CELL/2;
export function travelProgress(firstThinking: number, remainingTrack: number) {
  return (clamp(firstThinking) * FIRST_THINKING_LENGTH + clamp(remainingTrack) * (LENGTH - FIRST_THINKING_LENGTH)) / LENGTH;
}
export const PATH = WAYPOINTS.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join(' ');
export const clamp = (x: number) => Math.max(0, Math.min(1, x));
export function pointAt(distance: number): Point {
  let remaining = Math.max(0, Math.min(LENGTH, distance));
  for (const s of SEGMENTS) {
    if (remaining <= s.length) {
      const t = remaining / s.length;
      return {x: s.start.x + (s.end.x - s.start.x) * t, y: s.start.y + (s.end.y - s.start.y) * t};
    }
    remaining -= s.length;
  }
  return WAYPOINTS[WAYPOINTS.length - 1];
}

// Every segment, including the first Thinking block, uses the same forward motion.
export function pose(travel: number) {
  const distance = clamp(travel) * LENGTH;
  const point = pointAt(distance);
  const agent = CENTER;
  return {
    distance, point, agent,
    camera: {x: agent.x - point.x, y: agent.y - point.y},
  };
}

export type Block = {id: string; x: number; y: number; w: number; h: number; asset?: string; label?: string; colors?: [string,string]; vertical?: boolean; reverse?: boolean; textX?: number};
const baseBlocks: Block[] = [
  {id:'thinking-blue',x:600,y:240,w:360,h:120,label:'Thinking',colors:['#6492d8','#3d81eb'],textX:32},
  {id:'turn-top',x:960,y:240,w:120,h:120,asset:'icon-b.svg'},
  {id:'read',x:960,y:360,w:120,h:240,label:'Read',colors:['#ef9e6b','#ee7955'],vertical:true},
  {id:'turn-right',x:960,y:600,w:120,h:120,asset:'icon-d.svg'},
  {id:'thinking-red',x:600,y:600,w:360,h:120,label:'Thinking...',colors:['#f2747d','#ef8d8f'],textX:20},
  {id:'turn-left',x:480,y:600,w:120,h:120,asset:'icon-c.svg'},
  {id:'write',x:480,y:720,w:120,h:240,label:'Write',colors:['#68ba92','#1cac66'],vertical:true},
  {id:'bash-icon',x:480,y:960,w:120,h:120,asset:'icon-a.svg'},
  {id:'bash',x:600,y:960,w:240,h:120,label:'Bash',colors:['#f2b6dc','#f694d2']},
].map(block => ({...block, x: block.x - CELL})) as Block[];
export const BLOCKS = [...baseBlocks,...extensionBlocks];
// Clip only the exterior corner of a turn; connected edges stay full-width.
// Local path coordinates preserve upright artwork instead of rotating its symbol.
export function blockOutline(block: Block): string {
  const index = WAYPOINTS.findIndex(p=>p.x===block.x+block.w/2&&p.y===block.y+block.h/2);
  if(index===WAYPOINTS.length-1){
    const previous=WAYPOINTS[index-1],end=WAYPOINTS[index];
    if(end.y>previous.y)return 'M0 0H120V60A60 60 0 0 1 0 60Z';
    if(end.y<previous.y)return 'M0 60A60 60 0 0 1 120 60V120H0Z';
    if(end.x>previous.x)return 'M0 0H60A60 60 0 0 1 60 120H0Z';
    return 'M60 0H120V120H60A60 60 0 0 1 60 0Z';
  }
  if(index<=0) return 'M0 0H120V120H0Z';
  const prev=WAYPOINTS[index-1],p=WAYPOINTS[index],next=WAYPOINTS[index+1];
  const incoming={x:Math.sign(p.x-prev.x),y:Math.sign(p.y-prev.y)};
  const outgoing={x:Math.sign(next.x-p.x),y:Math.sign(next.y-p.y)};
  if(incoming.x*outgoing.y-incoming.y*outgoing.x===0)return 'M0 0H120V120H0Z';
  const x=incoming.x-outgoing.x,y=incoming.y-outgoing.y;
  if(x>0&&y<0)return 'M0 0H60A60 60 0 0 1 120 60V120H0Z';
  if(x>0&&y>0)return 'M0 0H120V60A60 60 0 0 1 60 120H0Z';
  if(x<0&&y>0)return 'M0 0H120V120H60A60 60 0 0 1 0 60Z';
  return 'M0 60A60 60 0 0 1 60 0H120V120H0Z';
}
export const REVEAL_BOUNDS = {
  x:Math.min(...BLOCKS.map(b=>b.x))-CELL,
  y:Math.min(...BLOCKS.map(b=>b.y))-CELL,
  width:Math.max(...BLOCKS.map(b=>b.x+b.w))-Math.min(...BLOCKS.map(b=>b.x))+2*CELL,
  height:Math.max(...BLOCKS.map(b=>b.y+b.h))-Math.min(...BLOCKS.map(b=>b.y))+2*CELL,
};
