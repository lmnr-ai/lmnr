#!/usr/bin/env node
// From poc: pnpm exec tsx scripts/render-ultimate3-silk.ts [--settings file.json] [--mix file.json] [--out public/ultimate-3-silk/default]
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {ULTIMATE_3_DEFAULTS,normalizeSettings} from '../src/experiments/micro-18/settings';
import {verifyPianoAssets,PIANO_MANIFEST} from '../src/experiments/ultimate-3-silk/assets';
import {buildSilkPlan,renderSilkPCM,mixSilkPCM} from '../src/experiments/ultimate-3-silk/render';
import {encodeSilkWav,pcmPeak} from '../src/experiments/ultimate-3-silk/dsp';
import {assertSilkHeadroom,silkStemPeaks} from '../src/experiments/ultimate-3-silk/headroom';
import {assertSilkResources} from '../src/experiments/ultimate-3-silk/resources';
import {SILK_BUSES,normalizeSilkMix,mixIdentity,MUSIC_RENDERER,type StereoPCM} from '../src/experiments/ultimate-3-silk/types';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const arg=(name:string)=>{const i=process.argv.indexOf(name);return i<0?undefined:process.argv[i+1];};
const readJSON=async(file:string)=>JSON.parse(await fs.readFile(path.resolve(file),'utf8'));
if(!arg('--out') && (arg('--project') || arg('--settings') || arg('--mix')))throw new Error('For edited settings/mix, provide --out public/ultimate-3-silk/exports/<name>; never implicitly replace default assets.');
const project=arg('--project')?await readJSON(arg('--project')!):undefined;
const settings=normalizeSettings(arg('--settings')?await readJSON(arg('--settings')!):project?.settings??ULTIMATE_3_DEFAULTS);
const mix=normalizeSilkMix(arg('--mix')?await readJSON(arg('--mix')!):project?.mix??{});
const out=path.resolve(arg('--out')??path.join(root,'public/ultimate-3-silk/default'));
const assets=await verifyPianoAssets(async name=>{const b=await fs.readFile(path.join(root,'public/ultimate-3-silk/piano',name));return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength) as ArrayBuffer;});
const musicSourcePath=path.join(root,'src/experiments/micro-18/ultimate3-music.ts');
const musicSourceSha256=createHash('sha256').update(await fs.readFile(musicSourcePath)).digest('hex');
const plan=buildSilkPlan(settings);console.time('Silk PCM');const stems=renderSilkPCM(plan,assets);console.timeEnd('Silk PCM');
if(createHash('sha256').update(await fs.readFile(musicSourcePath)).digest('hex')!==musicSourceSha256)throw new Error('Original music source changed during build; rebuild without overwriting authored settings.');
assertSilkHeadroom(silkStemPeaks(stems),mix); // Refuse the requested mix before writing any assets.
await fs.mkdir(out,{recursive:true});
const hash=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
const files:Record<string,unknown>={};
async function write(name:string,pcm:StereoPCM,measure=false){
  const bytes=encodeSilkWav(pcm),file=path.join(out,name);await fs.writeFile(file,bytes);
  let loudness:unknown;
  if(measure){const result=spawnSync('ffmpeg',['-hide_banner','-nostdin','-i',file,'-af','loudnorm=I=-23:TP=-3:LRA=11:print_format=json','-f','null','-'],{maxBuffer:4*1024*1024});if(result.status!==0)throw new Error(result.stderr.toString());const match=result.stderr.toString().match(/\{\s*"input_i"[\s\S]*?\}/);if(!match)throw new Error('Missing loudness measurement');loudness=JSON.parse(match[0]);}
  files[name]={sha256:hash(bytes),samples:pcm[0].length,peak:pcmPeak(pcm),...(loudness?{loudness}:{})};
}
for(const bus of SILK_BUSES)await write(`${bus}.wav`,stems[bus]);
await write('sfx-only.wav',mixSilkPCM(stems,{...mix,music:0}),true);
const currentMix=mix.music===0?'sfx-only.wav':'current-mix.wav';
if(mix.music!==0)await write(currentMix,mixSilkPCM(stems,mix),true);
let referenceSafe=true;
try{assertSilkHeadroom(silkStemPeaks(stems),{...mix,music:1});}catch{referenceSafe=false;}
// A convenience reference must not reject an otherwise valid requested current mix.
if(referenceSafe)await write('music-enabled-reference.wav',mixSilkPCM(stems,{...mix,music:1}),true);
else console.warn('Music-enabled reference omitted: conservative headroom bound exceeded. Requested mix remains unchanged.');
await fs.writeFile(path.join(out,'settings.json'),JSON.stringify(settings,null,2)+'\n');
await fs.writeFile(path.join(out,'mix.json'),JSON.stringify(mix,null,2)+'\n');
await fs.writeFile(path.join(out,'cue-manifest.json'),JSON.stringify({identity:plan.identity,semanticDuration:plan.semanticDuration,frameDuration:plan.frameDuration,cues:plan.cues,motions:plan.motions.map(m=>({id:m.id,start:m.points[0].time,end:m.points.at(-1)!.time,controlPoints:m.points.length})),music:plan.music},null,2)+'\n');
await fs.writeFile(path.join(out,'manifest.json'),JSON.stringify({version:1,identity:plan.identity,mixIdentity:mixIdentity(mix),recipeVersion:plan.recipeVersion,assetIdentity:plan.assetIdentity,label:mix.music===0?'SFX-only (music off)':'Silk SFX + optional Sangers PCM',sampleRate:plan.sampleRate,semanticDuration:plan.semanticDuration,frameDuration:plan.frameDuration,currentMix,mix,resourceEstimate:assertSilkResources(plan.semanticDuration),musicSourceSha256,musicRenderer:MUSIC_RENDERER,musicDisclosure:'Uncompressed deterministic PCM interpretation; preserves existing Sangers arrangement, partials, envelopes, pans and chapter multipliers. Triangle/filter phase differs from legacy WebAudio; canonical 24-bit sample steps in a float32 container. Existing optional-context .18 calibration; independent music bus defaults 0. Shared editor/export PCM, not bit-identical original engine.',endTaper:{seconds:.08,endpoint:plan.semanticDuration,shortFilmSafe:true},piano:PIANO_MANIFEST,files,reproduce:'cd poc && pnpm exec tsx scripts/render-ultimate3-silk.ts --settings <settings.json> --mix <mix.json> --out <output-directory>'},null,2)+'\n');
const audioDirectory=path.relative(path.join(root,'public'),out).split(path.sep).join('/');
if(/^ultimate-3-silk\//.test(audioDirectory)&&!audioDirectory.includes('..'))await fs.writeFile(path.join(out,'remotion-props.json'),JSON.stringify({settings,mix,audioDirectory},null,2)+'\n');
console.log(JSON.stringify({out,label:mix.music===0?'SFX-only (music off)':'Music enabled',files},null,2));
