#!/usr/bin/env node
// Downloads only the explicitly licensed Salamander piano notes used by these studies.
// No paid model/API calls. The public render never needs these source files at runtime.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const directory=path.resolve('poc/sound-sources/salamander-tonejs');
fs.mkdirSync(directory,{recursive:true});
const existing=path.join(directory,'source-manifest.json');
if(fs.existsSync(existing)){
 const manifest=JSON.parse(fs.readFileSync(existing,'utf8'));
 for(const file of manifest.files){const bytes=fs.readFileSync(path.join(directory,file.name));if(createHash('sha256').update(bytes).digest('hex')!==file.sha256)throw new Error(`Source mismatch ${file.name}`);}
 console.log('Verified existing piano source files; no network fetch.');process.exit(0);
}
async function get(url){const response=await fetch(url,{signal:AbortSignal.timeout(30000)});if(!response.ok)throw new Error(`${response.status}: ${url}`);return Buffer.from(await response.arrayBuffer());}
const commit=JSON.parse((await get('https://api.github.com/repos/Tonejs/audio/commits/master')).toString()).sha;
const base=`https://raw.githubusercontent.com/Tonejs/audio/${commit}/salamander/`;
const readme=await get(base+'README');
if(!readme.toString().includes('creativecommons.org/licenses/by/3.0/'))throw new Error('Expected source license absent');
fs.writeFileSync(path.join(directory,'UPSTREAM-README.txt'),readme);
const files=[];
for(let midi=33;midi<=96;midi+=3){
 const pitch=['C','Cs','D','Ds','E','F','Fs','G','Gs','A','As','B'][midi%12];
 const name=`${pitch}${Math.floor(midi/12)-1}.mp3`,url=base+name;
 const bytes=await get(url);fs.writeFileSync(path.join(directory,name),bytes);
 files.push({name,midi,url,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
 console.log(`Saved ${name}`);
}
const manifest={instrument:'Salamander Grand Piano / Yamaha C5',author:'Alexander Holm',license:'CC BY 3.0',licenseUrl:'https://creativecommons.org/licenses/by/3.0/',repository:'https://github.com/Tonejs/audio',commit,readmeUrl:base+'README',notes:'Tonejs MP3 distribution: one source per sampled pitch, not the original full 16-velocity-layer bank.',files};
fs.writeFileSync(existing,JSON.stringify(manifest,null,2)+'\n');
console.log(`Saved ${files.length} licensed piano sources at pinned commit ${commit}`);
