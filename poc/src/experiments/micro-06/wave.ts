import {clampProgress,OVERVIEW,OVERVIEW_TILES} from './overview';

export const BLUE_WAVE={flash:'#23272c',dot:'#85bcff',tail:0.22} as const;
// Durations are fractions of the authored blueWave clip (4s by default).
export const DEFAULT_WAVE_ENVELOPE={fadeIn:0.035,fadeOut:0.45};
export type WaveEnvelope=typeof DEFAULT_WAVE_ENVELOPE;
const smooth=(p:number)=>{const t=clampProgress(p);return t*t*(3-2*t);};
export function tileFlash(age:number,envelope:WaveEnvelope=DEFAULT_WAVE_ENVELOPE){
  if(age<0)return 0;
  const enter=Math.max(0,envelope.fadeIn),exit=Math.max(0,envelope.fadeOut);
  if(enter>0&&age<enter)return smooth(age/enter);
  return exit>0?1-smooth((age-enter)/exit):0;
}
export type OverviewActivity={heroDim:number;blueWave:number};
export const INITIAL_ACTIVITY:OverviewActivity={heroDim:0,blueWave:0};
type Tile=typeof OVERVIEW_TILES[number];
export function mixColor(from:string,to:string,progress:number){
  const p=clampProgress(progress);
  return '#'+[1,3,5].map(offset=>Math.round(parseInt(from.slice(offset,offset+2),16)*(1-p)+parseInt(to.slice(offset,offset+2),16)*p).toString(16).padStart(2,'0')).join('');
}
// y grows downwards in SVG: a top-left→bottom-right crest has x+y=constant.
// Trigger the whole square on first contact with its top-left corner. The dot
// switches once that same crest reaches the center. Offscreen cells participate.
export function waveArrival(tile:Tile){
  const span=(OVERVIEW.columns+OVERVIEW.rows-2)*OVERVIEW.pitch;
  return {
    cell:(tile.column+tile.row)*OVERVIEW.pitch,
    dot:(tile.column+tile.row)*OVERVIEW.pitch+OVERVIEW.tileSize,
    extent:span+OVERVIEW.tileSize,
  };
}
export function sampleOverviewTile(tile:Tile,activity:OverviewActivity,envelope:WaveEnvelope=DEFAULT_WAVE_ENVELOPE){
  const arrival=waveArrival(tile);
  // Start just before all artwork; reserve a full trailing fade after final dot.
  // Envelope can consume up to50% of the clip. Map crest travel into the
  // remaining phase so the final offscreen cell still settles exactly.
  const envelopeTail=Math.min(0.5,Math.max(0,envelope.fadeIn)+Math.max(0,envelope.fadeOut));
  const crest=-1+clampProgress(activity.blueWave)*(arrival.extent+2)/(1-envelopeTail);
  const age=(crest-arrival.cell)*(1-envelopeTail)/(arrival.extent+2);
  const flash=tileFlash(age,envelope);
  const activated=crest>=arrival.dot;
  return {
    fill:mixColor(OVERVIEW.tile,BLUE_WAVE.flash,flash),flash,activated,
    dot:activated?BLUE_WAVE.dot:tile.hero?mixColor('#ffffff',OVERVIEW.inactive,activity.heroDim):OVERVIEW.inactive,
    dotOpacity:activated&&!tile.hero?0.4:1,
  };
}
