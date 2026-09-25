import {CELL,ELBOW,LENGTH,STRAIGHT_LENGTH,WAYPOINTS,type Block} from './geometry';

export type RevealRect={x:number;y:number;width:number;height:number};
export type RevealCircle={cx:number;cy:number;r:number};
export type BlockReveal={rects:RevealRect[];circles:RevealCircle[];complete:boolean};

/** Block-local visited area. Applied inside the lift, never across neighbors. */
export function blockReveal(block:Block,distance:number):BlockReveal {
  const d=Math.max(0,Math.min(LENGTH,distance));
  const empty:BlockReveal={rects:[],circles:[],complete:false};
  const full:BlockReveal={rects:[{x:block.x,y:block.y,width:block.w,height:block.h}],circles:[],complete:true};
  if(d===0)return empty;

  if(block.id==='elbow-icon'){
    const entry=block.x-WAYPOINTS[0].x;
    if(d<=entry)return empty;
    if(d<STRAIGHT_LENGTH){
      // Do not accelerate the reveal across the full square before the turn.
      // Its leading edge stays at the actual agent center on approach.
      return {rects:[{x:block.x,y:block.y,width:d-entry,height:block.h}],circles:[],complete:false};
    }
    const rise=d-STRAIGHT_LENGTH;
    if(rise>=CELL/2)return full;
    // Keep the visited left half. Reveal the turn disk beneath the loader,
    // then uncover the right half upwards. Top-right and bottom-right areas
    // outside the disk cannot peek out ahead of the circular loader.
    return {
      rects:[{x:block.x,y:block.y,width:CELL/2,height:block.h},
        {x:ELBOW.x,y:ELBOW.y-rise,width:CELL/2,height:rise}],
      circles:[{cx:ELBOW.x,cy:ELBOW.y,r:CELL/2}],complete:false,
    };
  }

  // Placement, not label orientation: square icons on the upward leg also
  // reveal bottom-to-top even though they don't have a `vertical` text flag.
  if(block.y+block.h<=ELBOW.y-CELL/2){
    const entry=STRAIGHT_LENGTH+ELBOW.y-(block.y+block.h);
    const height=Math.max(0,Math.min(block.h,d-entry));
    if(height===0)return empty;
    if(height===block.h)return full;
    return {rects:[{x:block.x,y:block.y+block.h-height,width:block.w,height}],circles:[],complete:false};
  }

  const width=Math.max(0,Math.min(block.w,d-(block.x-WAYPOINTS[0].x)));
  if(width===0)return empty;
  if(width===block.w)return full;
  return {rects:[{x:block.x,y:block.y,width,height:block.h}],circles:[],complete:false};
}
