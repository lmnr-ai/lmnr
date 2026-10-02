// Figma 4724:10384 / hero 4724:10520. Coordinates stay in the 1280×720 frame.
export const OVERVIEW = {
  columns:15, rows:9, pitch:150, tileSize:148,
  origin:{x:-484,y:-314}, center:{x:640,y:360},
  heroColumn:7, heroRow:4, radius:6, initialScale:10,
  tile:'#1a1a1a', background:'#141414', inactive:'#3d3d3d',
} as const;
export const OVERVIEW_TILES = Array.from({length:OVERVIEW.columns*OVERVIEW.rows},(_,index)=>{
  const column=index%OVERVIEW.columns,row=Math.floor(index/OVERVIEW.columns);
  return {id:`agent-${row}-${column}`,column,row,
    x:OVERVIEW.origin.x+column*OVERVIEW.pitch,y:OVERVIEW.origin.y+row*OVERVIEW.pitch,
    hero:column===OVERVIEW.heroColumn&&row===OVERVIEW.heroRow};
});
export const clampProgress=(value:number)=>Math.max(0,Math.min(1,value));
export type HandoffProgress = {worldFade:number;spinnerExit:number;agentWhiten:number;handoff:number;overviewZoom:number};
export const INITIAL_HANDOFF: HandoffProgress = {worldFade:0,spinnerExit:0,agentWhiten:0,handoff:0,overviewZoom:0};

// One pure contract for live DialKit and random-access export. Handoff implies
// cleanup even if authoring clips are reordered; zoom never starts before it.
export function matchHandoff(progress:HandoffProgress){
  // Ownership changes at the midpoint of the50ms handoff clip. Both sides
  // remain visually identical until overviewZoom begins.
  const overview=clampProgress(progress.handoff)>=0.5;
  return {
    owner:overview?'overview' as const:'snail' as const,
    worldOpacity:overview?0:1-clampProgress(progress.worldFade),
    spinnerScale:overview?0:1-clampProgress(progress.spinnerExit),
    whiteMix:overview?1:clampProgress(progress.agentWhiten),
    scale:OVERVIEW.initialScale**(1-(overview?clampProgress(progress.overviewZoom):0)),
  };
}
export function projectOverview(x:number,y:number,scale:number){
  return {x:OVERVIEW.center.x+(x-OVERVIEW.center.x)*scale,y:OVERVIEW.center.y+(y-OVERVIEW.center.y)*scale};
}
