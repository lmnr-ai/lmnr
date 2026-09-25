import assert from 'node:assert/strict';
import {OVERVIEW,OVERVIEW_TILES} from './overview';
import {BLUE_WAVE,DEFAULT_WAVE_ENVELOPE,INITIAL_ACTIVITY,sampleOverviewTile,tileFlash,waveArrival} from './wave';
import {sampleSnail} from './sample';
const hero=OVERVIEW_TILES.find(tile=>tile.hero)!;
assert.equal(sampleOverviewTile(hero,INITIAL_ACTIVITY).dot,'#ffffff');
assert.equal(sampleOverviewTile(hero,{heroDim:1,blueWave:0}).dot,OVERVIEW.inactive);
assert.notEqual(sampleOverviewTile(hero,{heroDim:0.5,blueWave:0}).dot,OVERVIEW.inactive);
for(const tile of OVERVIEW_TILES){
  const initial=sampleOverviewTile(tile,INITIAL_ACTIVITY);
  assert.equal(initial.flash,0);assert.equal(initial.activated,false);
  const arrival=waveArrival(tile);
  const envelopeTail=DEFAULT_WAVE_ENVELOPE.fadeIn+DEFAULT_WAVE_ENVELOPE.fadeOut;
  const phase=(crest:number)=>(crest+1)*(1-envelopeTail)/(arrival.extent+2);
  const at=(crest:number)=>sampleOverviewTile(tile,{heroDim:1,blueWave:phase(crest)});
  assert.equal(at(arrival.cell-0.001).flash,0);
  assert.ok(at(arrival.cell+0.001).flash<0.001);
  const peak=arrival.cell+DEFAULT_WAVE_ENVELOPE.fadeIn*(arrival.extent+2)/(1-envelopeTail);
  assert.equal(at(peak).fill,BLUE_WAVE.flash);
  assert.ok(at(peak+200).flash<at(peak+1).flash);
  assert.equal(at(arrival.dot-0.001).activated,false);
  assert.equal(at(arrival.dot+0.001).activated,true);
  for(const fadeIn of [0,0.025,0.05])for(const fadeOut of [0.005,0.1,0.17]){
    const tuned=sampleOverviewTile(tile,{heroDim:1,blueWave:1},{fadeIn,fadeOut});
    assert.equal(tuned.fill,OVERVIEW.tile,'all supported envelopes settle by clip end');
    assert.equal(tuned.activated,true);
  }
  const final=sampleOverviewTile(tile,{heroDim:1,blueWave:1});
  assert.equal(final.fill,OVERVIEW.tile);assert.equal(final.dot,BLUE_WAVE.dot);
  assert.equal(final.dotOpacity,tile.hero?1:0.4);assert.equal(final.activated,true);
}
const first=OVERVIEW_TILES[0],last=OVERVIEW_TILES.at(-1)!;
assert.ok(waveArrival(first).dot<waveArrival(hero).dot);
assert.ok(waveArrival(hero).dot<waveArrival(last).dot);
assert.equal(waveArrival(OVERVIEW_TILES[1]).dot,waveArrival(OVERVIEW_TILES[15]).dot);
assert.deepEqual(sampleSnail(7.1).overviewActivity,INITIAL_ACTIVITY);
assert.deepEqual(sampleSnail(9.45).overviewActivity,{heroDim:0,blueWave:0});
assert.deepEqual(sampleSnail(539/30).overviewActivity,{heroDim:1,blueWave:1});
const times=[10.1,9.46,24.9,12,13.6,7.1];
const forward=times.map(time=>sampleOverviewTile(hero,sampleSnail(time).overviewActivity));
for(let i=times.length-1;i>=0;i--)assert.deepEqual(sampleOverviewTile(hero,sampleSnail(times[i]).overviewActivity),forward[i]);
assert.equal(tileFlash(-0.01),0);
assert.equal(tileFlash(0),0);
assert.equal(tileFlash(0,{fadeIn:0,fadeOut:0.1}),1);
assert.equal(tileFlash(DEFAULT_WAVE_ENVELOPE.fadeIn),1);
assert.equal(tileFlash(DEFAULT_WAVE_ENVELOPE.fadeIn+DEFAULT_WAVE_ENVELOPE.fadeOut),0);
assert.ok(tileFlash(0.01,{fadeIn:0.02,fadeOut:0.1})>tileFlash(0.01,{fadeIn:0.05,fadeOut:0.1}));
assert.ok(tileFlash(0.08,{fadeIn:0.035,fadeOut:0.45})>tileFlash(0.08,{fadeIn:0.035,fadeOut:0.06}));
console.log('PASS: hero dim, diagonal direction, eased tile envelope/dials, dot-center arrival, final colors/alpha, random seeks');
