import type {Block} from './geometry';

export type SnailPalette = 'vibrant' | 'metal';
export const SCENE_PALETTES = {
  vibrant: {background:'#1a1a1a',grid:'#333'},
  // micro-04 scene background and corner-guide lines, respectively.
  metal: {background:'#101010',grid:'#2c3b3b'},
} satisfies Record<SnailPalette,{background:string;grid:string}>;
// Match micro-04's tuned -5 lightness offset, not its untuned scene fallback.
const metal = (h:number,s:number,l:number,extraDarken=0) => `hsl(${h} ${s}% ${Math.max(0,l-5-extraDarken)}%)`;
const teal = metal(180,14,19.6078);
type BlockPaint = {colors?:string[];angle?:number;symbol?:string;stops?:number[]};
export function blockPaint(block:Block,palette:SnailPalette):BlockPaint{
  if(palette==='vibrant')return {colors:block.colors,angle:undefined,symbol:undefined};
  if(block.asset){
    const chat=block.asset==='icon-d.svg'||block.asset==='icon-e.svg';
    return {
      colors:chat?[metal(241.2245,21.3974,55.098),teal]:[metal(44.6809,19.6653,53.1373),teal],
      angle:chat?135.939:131.845,
      symbol:chat?'micro-04/middle-symbol.svg':'micro-04/time-symbol.svg',
    };
  }
  if(block.label==='Thinking...')return {colors:[metal(180,13.7615,21.3725),metal(180,13.0435,18.0392)]};
  if(block.label==='Bash')return {colors:[metal(180,11.811,24.902),metal(180,13.9785,18.2353)]};
  // Figma 4718:4980: luminous teal → sage → bronze orb, at the tuned -5 lightness.
  if(block.label==='Write')return {
    colors:[metal(183.3333,30.3371,65.098,8),metal(158.5714,5.9829,54.1176,8),metal(21.0811,14.8594,48.8235,8)],
    stops:[.11002,.55501,1],angle:136.20745662642335,
  };
  // Read — Figma 4719:5171: sage → dusty rose grid-tail gradient.
  return {colors:[metal(160,8.4112,41.9608,8),metal(3.4615,26.8041,61.9608,8)],stops:[.050203,.93876],angle:117.54476901581951};
}

// CSS linear-gradient angles use magic corners; SVG's simple diagonal is not
// equivalent. These endpoints reproduce micro-04's square icon gradients.
export function gradientEndpoints(angle:number,width=1,height=1){
  const radians=angle*Math.PI/180,dx=Math.sin(radians),dy=-Math.cos(radians);
  const extent=(Math.abs(dx)*width+Math.abs(dy)*height)/2;
  return {x1:.5-dx*extent/width,y1:.5-dy*extent/height,x2:.5+dx*extent/width,y2:.5+dy*extent/height};
}
