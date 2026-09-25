import {assertSilkHeadroom,silkStemPeaks} from './headroom';
import {DEFAULT_SILK_MIX,SAMPLE_RATE,SILK_BUSES,normalizeSilkMix,type SilkMix,type SilkStems,type SilkBus} from './types';
/** Offset playback of the shared PCM, not another synthesizer. One context, six buffer copies
 * per settings build, and gain-only mix edits. No asynchronous completion owns a playhead. */
export class SilkTransport {
  private context?:AudioContext;
  private stems?:SilkStems;
  private buffers=new Map<SilkBus,AudioBuffer>();
  private gains=new Map<SilkBus,GainNode>();
  private sources:AudioBufferSourceNode[]=[];
  private mix:SilkMix={...DEFAULT_SILK_MIX};
  private epoch=0;
  private disposed=false;
  private enabled=false;
  private time=0;
  private playing=false;
  private driftUpdates=0;
  private driftSign=0;
  private mixError:string|null=null;
  get headroomError(){return this.mixError;}
  private anchor?:{clock:number;offset:number};
  constructor(private createContext=()=>new AudioContext({sampleRate:SAMPLE_RATE}),private now=()=>performance.now()/1000){}
  get activeSources(){return this.sources.length;}
  get bufferCopies(){return this.buffers.size;}
  get isEnabled(){return this.enabled;}
  private stop(){this.epoch++;for(const source of this.sources){source.onended=null;try{source.stop();}catch{}source.disconnect();}this.sources=[];this.anchor=undefined;this.driftUpdates=0;}
  invalidate(){this.stop();this.stems=undefined;this.buffers.clear();this.mixError=null;}
  setStems(stems:SilkStems){this.invalidate();this.stems=stems;this.setMix(this.mix);}
  setMix(mix:SilkMix){
    this.mix=normalizeSilkMix(mix);this.mixError=null;
    try{if(this.stems)assertSilkHeadroom(silkStemPeaks(this.stems),this.mix);}
    catch(error){this.mixError=(error as Error).message;this.stop();return;}
    this.applyGains();this.startLatest();
  }
  private applyGains(){for(const [bus,gain] of this.gains)gain.gain.setValueAtTime(this.mix.master*this.mix[bus],this.context!.currentTime);}
  update(time:number,playing:boolean){
    if(this.disposed)return;
    // Compare against the ORIGINAL playback anchor, never absorb an offset into each tick.
    // Three same-direction >25ms errors distinguish a persistent small seek from <=18ms
    // tested RAF jitter. >75ms jumps resync immediately. A 40ms seek settles in three updates.
    let seek=!this.playing&&time!==this.time;
    if(this.playing&&playing&&this.anchor){
      const drift=time-(this.anchor.offset+this.now()-this.anchor.clock),sign=Math.sign(drift);
      this.driftUpdates=Math.abs(drift)>.025?(sign===this.driftSign?this.driftUpdates+1:1):0;
      this.driftSign=sign;seek=Math.abs(drift)>.075||this.driftUpdates>=3;
    }
    if(seek||playing!==this.playing)this.stop();
    this.time=time;this.playing=playing;
    if(!playing){if(this.sources.length)this.stop();return;}
    this.startLatest();
  }
  /** Explicit editor seeks can invalidate even sub-frame offsets. */
  seek(time:number,playing=this.playing){this.stop();this.time=time;this.playing=playing;this.startLatest();}
  async enable(){
    if(this.disposed)return;
    this.enabled=true;
    this.context??=this.createContext();
    const token=this.epoch;
    await this.context.resume();
    if(this.disposed||token!==this.epoch||!this.enabled)return;
    this.startLatest();
  }
  disable(){this.enabled=false;this.stop();}
  private startLatest(){
    const ctx=this.context;
    if(this.disposed||this.mixError||!this.enabled||!this.playing||!this.stems||!ctx||ctx.state!=='running'||this.sources.length)return;
    const duration=this.stems.agent[0].length/SAMPLE_RATE;
    if(this.time<0||this.time>=duration)return;
    for(const bus of SILK_BUSES){
      if(!this.buffers.has(bus)){
        const buffer=ctx.createBuffer(2,this.stems[bus][0].length,SAMPLE_RATE);
        for(let c=0;c<2;c++)buffer.copyToChannel(this.stems[bus][c] as Float32Array<ArrayBuffer>,c);
        this.buffers.set(bus,buffer);
      }
      if(!this.gains.has(bus)){const gain=ctx.createGain();gain.connect(ctx.destination);this.gains.set(bus,gain);}
    }
    this.applyGains();
    const when=ctx.currentTime+.015,offset=Math.min(duration,this.time+.015);
    this.anchor={clock:this.now()+.015,offset};
    for(const bus of SILK_BUSES){const source=ctx.createBufferSource();source.buffer=this.buffers.get(bus)!;source.connect(this.gains.get(bus)!);source.start(when,offset);this.sources.push(source);}
  }
  dispose(){this.disposed=true;this.enabled=false;this.invalidate();for(const gain of this.gains.values())gain.disconnect();this.gains.clear();void this.context?.close();this.context=undefined;}
}
