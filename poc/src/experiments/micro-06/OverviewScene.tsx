import {OVERVIEW,OVERVIEW_TILES} from './overview';
import {DEFAULT_WAVE_ENVELOPE,INITIAL_ACTIVITY,sampleOverviewTile,type OverviewActivity,type WaveEnvelope} from './wave';

// Independent scene: future agent activity belongs here, not in Snail's route.
export const AgentOverviewScene=({scale=1,activity=INITIAL_ACTIVITY,waveEnvelope=DEFAULT_WAVE_ENVELOPE}:{scale?:number;activity?:OverviewActivity;waveEnvelope?:WaveEnvelope})=>{
  const hero=sampleOverviewTile(OVERVIEW_TILES.find(tile=>tile.hero)!,activity,waveEnvelope);
  return <svg
  className="micro06-scene" viewBox="0 0 1280 720" aria-label="Agent overview"
  data-scene="overview" data-overview-scale={scale}>
  <rect width="1280" height="720" fill={OVERVIEW.background}/>
  <g transform={`translate(640 360) scale(${scale}) translate(-640 -360)`}>
    {OVERVIEW_TILES.map(tile=>{
      const state=sampleOverviewTile(tile,activity,waveEnvelope);
      return <g key={tile.id} data-agent-id={tile.id} data-hero={tile.hero||undefined} data-activated={state.activated}>
        <rect x={tile.x} y={tile.y} width={OVERVIEW.tileSize} height={OVERVIEW.tileSize} fill={state.fill}/>
        {!tile.hero&&<circle cx={tile.x+OVERVIEW.tileSize/2} cy={tile.y+OVERVIEW.tileSize/2} r={OVERVIEW.radius} fill={state.dot} fillOpacity={state.dotOpacity}/>}
      </g>;
    })}
  </g>
  {/* Project the hero separately to use the exact same primitive/transform as
      Snail at scale10. Nested SVG scale causes tiny edge raster differences. */}
  <g transform={`translate(640 360) scale(${scale/OVERVIEW.initialScale})`} data-overview-hero="true">
    <circle r={OVERVIEW.radius*OVERVIEW.initialScale} fill={hero.dot}/>
  </g>
</svg>;
};
