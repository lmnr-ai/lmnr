#!/usr/bin/env bash
# Audio-package operation only, no application/legacy audio mounts. Existing Vite must be running.
# Usage from poc: bash scripts/test-ultimate3-silk-browser.sh [generated-output-directory]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$ROOT/public/ultimate-3-silk/default}"
SESSION=silk-audio-stage1
SCRIPT="$(mktemp)"
trap 'rm -f "$SCRIPT"' EXIT
node --input-type=module - "$OUT" > "$SCRIPT" <<'NODE'
import fs from 'node:fs';import path from 'node:path';
const out=process.argv[2],expected=JSON.parse(fs.readFileSync(path.join(out,'manifest.json'),'utf8')),settings=JSON.parse(fs.readFileSync(path.join(out,'settings.json'),'utf8'));
console.log(`(async()=>{
const expected=${JSON.stringify(expected)},settings=${JSON.stringify(settings)};
const before=JSON.stringify({...localStorage});let contexts=0;
const Original=window.AudioContext;window.AudioContext=new Proxy(Original,{construct(target,args){contexts++;return Reflect.construct(target,args);}});
const api=await import('/src/experiments/ultimate-3-silk/index.ts');const client=new api.SilkBuildClient();
try {
 const cancelled=client.build(settings).then(()=>false,e=>e.name==='AbortError');
 const start=performance.now(),build=await client.build(settings);
 const sha=async pcm=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',api.encodeSilkWav(pcm))),x=>x.toString(16).padStart(2,'0')).join('');
 const hashes={};
 for(const bus of api.SILK_BUSES){hashes[bus]=await sha(build.stems[bus]);if(hashes[bus]!==expected.files[bus+'.wav'].sha256)throw new Error(bus+' browser/CLI hash mismatch');}
 const mix=await sha(api.mixSilkPCM(build.stems,expected.mix));
 if(mix!==expected.files[expected.currentMix].sha256)throw new Error('Current mix browser/CLI hash mismatch');
 if(build.plan.identity!==expected.identity)throw new Error('Settings/recipe identity mismatch');
 if(!(await cancelled))throw new Error('Stale build not rejected');
 if(before!==JSON.stringify({...localStorage})||contexts!==0)throw new Error('Audio package touched storage or constructed legacy/browser voices');
 return {passed:true,milliseconds:performance.now()-start,hashes,mix,samples:build.stems.agent[0].length,staleBuildCancelled:true,storageUnchanged:true,audioContextsCreated:contexts};
} finally {client.dispose();window.AudioContext=Original;}
})()`);
NODE
agent-browser --session "$SESSION" --executable-path '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' open 'http://localhost:5180/ultimate-3-silk/piano/manifest.json'
agent-browser --session "$SESSION" eval --stdin < "$SCRIPT"
