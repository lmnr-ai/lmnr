import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DEFAULT_SILK_MIX,SILK_BUSES,type SilkStems} from './types';
import {assertSilkHeadroom,silkStemPeaks} from './headroom';
import {mixSilkPCM} from './render';
import {pcmPeak} from './dsp';
import {SilkTransport} from './transport';
test('real default stems: all gains2/music0 is 1.1302075 peak, rejected consistently before live installation or download',()=>{
 const stems=Object.fromEntries(SILK_BUSES.map(bus=>{const b=fs.readFileSync(new URL(`../../../public/ultimate-3-silk/default/${bus}.wav`,import.meta.url)),samples=(b.length-44)/8,l=new Float32Array(samples),r=new Float32Array(samples);for(let i=0;i<samples;i++){l[i]=b.readFloatLE(44+i*8);r[i]=b.readFloatLE(48+i*8);}return [bus,[l,r]];})) as unknown as SilkStems;
 const unsafe={master:2,agent:2,material:2,air:2,sparkle:2,typing:2,music:0};
 const sum=[new Float32Array(stems.agent[0].length),new Float32Array(stems.agent[0].length)] as const;
 for(const bus of SILK_BUSES)for(let c=0;c<2;c++)for(let i=0;i<sum[c].length;i++)sum[c][i]+=stems[bus][c][i]*unsafe.master*unsafe[bus];
 assert.ok(Math.abs(pcmPeak(sum)-1.1302075386047363)<1e-7);
 assert.throws(()=>mixSilkPCM(stems,unsafe),/conservative headroom/);
 const transport=new SilkTransport();transport.setMix(unsafe);transport.setStems(stems);assert.match(transport.headroomError!,/conservative headroom/);assert.equal(transport.bufferCopies,0);
 for(const mix of [DEFAULT_SILK_MIX,{...DEFAULT_SILK_MIX,music:1},{...DEFAULT_SILK_MIX,master:2}]){assert.ok(assertSilkHeadroom(silkStemPeaks(stems),mix)<1);assert.ok(pcmPeak(mixSilkPCM(stems,mix))<1);transport.setMix(mix);assert.equal(transport.headroomError,null);}
 assert.equal(silkStemPeaks(stems),silkStemPeaks(stems),'cached generation evidence');transport.dispose();
});
test('bound is intentionally conservative, not measured peak or cancellation-aware',()=>{
 const stems=Object.fromEntries(SILK_BUSES.map(bus=>[bus,[new Float32Array(2),new Float32Array(2)]])) as unknown as SilkStems;
 stems.agent[0][0]=.6;stems.sparkle[0][1]=.6; // Exact mix peak .6; peaks do not overlap.
 assert.throws(()=>mixSilkPCM(stems,DEFAULT_SILK_MIX),/conservative headroom/);
});
