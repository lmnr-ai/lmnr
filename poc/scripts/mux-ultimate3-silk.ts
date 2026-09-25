#!/usr/bin/env node
// Supported final export step. Picture is copied, NEVER retimed; canonical WAV replaces
// Remotion's intermediate audio. Requires a picture rendered with these props/frame range.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateSilkExport,type SilkExportProps} from '../src/experiments/ultimate-3-silk/export';
import {hashFile,command,videoPacketHash,verifySilkVideo} from './verify-ultimate3-silk-video.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const arg=(name:string)=>{const i=process.argv.indexOf(name);return i<0?undefined:process.argv[i+1];};
const required=(name:string)=>{const value=arg(name);if(!value)throw Error(`Required ${name}`);return path.resolve(value);};
const propsFile=required('--props'),picture=required('--picture'),out=required('--out');
if(picture===out)throw Error('Keep intermediate picture and final output paths distinct for provenance.');
const props=JSON.parse(fs.readFileSync(propsFile,'utf8')) as SilkExportProps;
const read=async(file:string)=>{const b=fs.readFileSync(path.join(root,'public',file));return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength) as ArrayBuffer;};
const validated=await validateSilkExport(props,read),startFrame=Number(arg('--start-frame')??0),frames=Number(arg('--frames')??validated.frames);
if(!Number.isSafeInteger(startFrame)||!Number.isSafeInteger(frames)||startFrame<0||frames<=0||startFrame+frames>validated.frames)throw Error('Invalid global frame range');
const assets=path.join(root,'public',props.audioDirectory),manifestFile=path.join(assets,'manifest.json'),manifest=JSON.parse(fs.readFileSync(manifestFile,'utf8'));
const wav=path.join(root,'public',validated.audioPath),musicSource=path.join(root,'src/experiments/micro-18/ultimate3-music.ts');
if(hashFile(musicSource)!==manifest.musicSourceSha256)throw Error('Music source changed: rebuild current-settings PCM');
const inputs=Object.fromEntries([propsFile,manifestFile,wav,musicSource,path.join(assets,'settings.json'),path.join(assets,'mix.json'),picture].map(file=>[path.relative(root,file),hashFile(file)]));
const picturePacketHash=videoPacketHash(picture);
const probe=JSON.parse(command('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=nb_frames,start_time,duration','-of','json',picture])).streams[0];
if(Number(probe.nb_frames)!==frames||Math.abs(Number(probe.duration)-frames/30)>.00001||Number(probe.start_time)!==0)throw Error('Picture must be the exact requested frame range, presented from zero');
fs.mkdirSync(path.dirname(out),{recursive:true});const temporary=`${out}.mux-${process.pid}.mp4`;
const args=['-v','error','-nostdin','-y','-i',picture,'-ss',String(startFrame/30),'-i',wav,'-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-b:a','192k','-ar','48000','-t',String(frames/30),'-movflags','+faststart',temporary];
try{
 command('ffmpeg',args);
 const measurement=verifySilkVideo(temporary,wav,startFrame/30,frames);
 if(videoPacketHash(temporary)!==picturePacketHash)throw Error('Final mux changed picture packets');
 await validateSilkExport(props,read);
 for(const [file,hash] of Object.entries(inputs))if(hashFile(path.join(root,file))!==hash)throw Error(`Input changed during mux: ${file}`);
 const receipt={version:1,props:path.relative(root,propsFile),wav:path.relative(root,wav),picture:path.relative(root,picture),startFrame,frames,inputs,picturePacketHash,videoSha256:hashFile(temporary),command:['ffmpeg',...args],measurement};
 fs.renameSync(temporary,out);fs.writeFileSync(`${out}.mux.json`,JSON.stringify(receipt,null,2)+'\n');
 console.log(JSON.stringify({out,...receipt},null,2));
}finally{if(fs.existsSync(temporary))fs.unlinkSync(temporary);}
