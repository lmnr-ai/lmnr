#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
export const hashFile=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
export function command(program,args){const r=spawnSync(program,args,{encoding:'utf8',maxBuffer:8*1024*1024});if(r.status!==0)throw Error(r.stderr);return r.stdout;}
export const videoPacketHash=file=>command('ffmpeg',['-v','error','-i',file,'-map','0:v:0','-c','copy','-f','hash','-hash','sha256','-']).trim();
/** Normal presentation-time decode. Search is DIAGNOSTIC; acceptance never shifts samples.
 * One sample (20.83us) permits decoder/sample-clock rounding, not frame-sized residual delay. */
export function verifySilkVideo(video,wav,offset,frames){
 const duration=frames/30,n=frames*1600,start=Math.round(offset*48000);
 const probe=JSON.parse(command('ffprobe',['-v','error','-show_entries','format=duration:stream=codec_type,codec_name,time_base,start_time,sample_rate,channels,duration,nb_frames','-of','json',video]));
 const v=probe.streams.find(s=>s.codec_type==='video'),audio=probe.streams.find(s=>s.codec_type==='audio');
 if(!v||!audio||Number(v.nb_frames)!==frames||Math.abs(Number(v.duration)-duration)>.00001||Number(audio.sample_rate)!==48000||audio.channels!==2||audio.codec_name!=='aac'||Math.abs(Number(audio.duration)-duration)>.001||Math.abs(Number(v.start_time))>1/48000||Math.abs(Number(audio.start_time))>1/48000)throw Error('Video/audio presentation format, start or duration mismatch');
 const packets=JSON.parse(command('ffprobe',['-v','error','-select_streams','a:0','-read_intervals','%+0.05','-show_packets','-of','json',video])).packets;
 const first=packets[0],skip=first?.side_data_list?.find(s=>s.side_data_type==='Skip Samples')?.skip_samples;
 if(audio.time_base!=='1/48000'||first?.pts!==-1024||skip!==1024||packets[1]?.pts!==0)throw Error('AAC priming is not presentation-compensated: require PTS -1024 / Skip Samples 1024 then PTS 0');
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'silk-presentation-')),decoded=path.join(tmp,'decoded.f32');
 try{
  command('ffmpeg',['-v','error','-nostdin','-y','-i',video,'-vn','-ac','2','-ar','48000','-f','f32le',decoded]);
  const d=fs.readFileSync(decoded),s=fs.readFileSync(wav),a=new Float32Array(d.buffer,d.byteOffset,d.length/4),b=new Float32Array(s.buffer,s.byteOffset+44,(s.length-44)/4);
  if(a.length/2<n||a.length/2>n+1024||start+n>b.length/2)throw Error('Decoded/source sample extent mismatch');
  const correlate=(lag,sourceStart=start)=>{let aa=0,bb=0,ab=0;for(let i=Math.max(0,lag);i<Math.min(n,n+lag);i+=97){const j=sourceStart+i-lag;if(j<sourceStart||j>=sourceStart+n)continue;for(let c=0;c<2;c++){const x=a[2*i+c],y=b[2*j+c];aa+=x*x;bb+=y*y;ab+=x*y;}}return ab/Math.sqrt(aa*bb);};
  let best={lag:0,correlation:-1};for(let lag=-4096;lag<=4096;lag+=16){const correlation=correlate(lag);if(correlation>best.correlation)best={lag,correlation};}const center=best.lag;for(let lag=center-16;lag<=center+16;lag++){const correlation=correlate(lag);if(correlation>best.correlation)best={lag,correlation};}
  let err=0,power=0,peak=0,nonfinite=0;for(const x of a){if(!Number.isFinite(x))nonfinite++;peak=Math.max(peak,Math.abs(x));}
  // Error and correlation use original presentation samples at lag ZERO, including onset.
  for(let i=0;i<n;i++)for(let c=0;c<2;c++){const x=a[2*i+c],y=b[2*(start+i)+c];err+=(x-y)**2;power+=y*y;}
  const presentationCorrelation=correlate(0),signalToErrorDb=10*Math.log10(power/err),wrong=offset?correlate(0,0):null;
  const silent=power===0;
  if(nonfinite||peak>=1||(silent?peak>1e-7:!Number.isFinite(presentationCorrelation)||presentationCorrelation<.995||Math.abs(best.lag)>1||signalToErrorDb<30||wrong!==null&&wrong>.5))throw Error(`Presentation audio mismatch: residual lag ${best.lag}, zero-lag correlation ${presentationCorrelation}, SNR ${signalToErrorDb}`);
  // A valid master-zero mix has no signal from which to estimate lag; do not invent one.
  return {frames,globalOffsetSeconds:offset,probe,firstAudioPackets:packets.slice(0,3),silent,residualLagSamples:silent?null:best.lag,presentationCorrelation:silent?null:presentationCorrelation,diagnosticBestCorrelation:silent?null:best.correlation,wrongZeroOffsetCorrelation:silent?null:wrong,decodedPeak:peak,nonfinite,rmsError:Math.sqrt(err/(n*2)),signalToErrorDb:silent?null:signalToErrorDb,decodedSamples:a.length/2};
 }finally{if(fs.existsSync(decoded))fs.unlinkSync(decoded);fs.rmdirSync(tmp);}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),out=path.join(root,'out/ultimate3-silk'),results=[];
 for(const name of ['default-sfx-only','retimed-music-enabled-excerpt']){
  const video=path.join(out,`${name}.mp4`),receipt=JSON.parse(fs.readFileSync(`${video}.mux.json`));
  for(const [file,hash] of Object.entries(receipt.inputs))if(hashFile(path.join(root,file))!==hash)throw Error(`Stale mux input identity: ${file}`);
  if(hashFile(video)!==receipt.videoSha256)throw Error('Final movie changed since validated mux');
  if(videoPacketHash(video)!==receipt.picturePacketHash)throw Error('Picture packets differ from validated input');
  results.push({name,...verifySilkVideo(video,path.join(root,receipt.wav),receipt.startFrame/30,receipt.frames),...receipt});
 }
 const report={passed:true,codecNote:'Supersedes earlier incorrect harmless-priming claim. Normal presentation decode has <=1-sample residual lag; encoder priming is compensated by negative packet PTS and explicit skip metadata. AAC is lossy; no manual sample shift is used for acceptance.',results};
 fs.writeFileSync(path.join(out,'validation.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}
