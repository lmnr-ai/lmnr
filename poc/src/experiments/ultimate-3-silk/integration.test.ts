import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {ULTIMATE_3_DEFAULTS} from '../micro-18/settings';
import {DEFAULT_SILK_MIX,mixIdentity,SILK_MIX_STORAGE_ID,SILK_SETTINGS_STORAGE_ID} from './types';
import {silkAssetPath,validateSilkExport} from './export';
const text=(path:string)=>fs.readFile(new URL(path,import.meta.url),'utf8');
const read=async(path:string)=>{const b=await fs.readFile(new URL(`../../../public/${path}`,import.meta.url));return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength) as ArrayBuffer;};
const props={settings:ULTIMATE_3_DEFAULTS,mix:{...DEFAULT_SILK_MIX},audioDirectory:'ultimate-3-silk/default'};
test('new composition validates default actual WAV hash and rejects stale retiming, mix and corrupted PCM',async()=>{
 assert.equal((await validateSilkExport(props,read)).frames,1621);
 const settings=structuredClone(ULTIMATE_3_DEFAULTS);settings.allocations.cost+=1;
 await assert.rejects(validateSilkExport({...props,settings},read),/does not match/);
 await assert.rejects(validateSilkExport({...props,mix:{...DEFAULT_SILK_MIX,music:1}},read),/does not match/);
 await assert.rejects(validateSilkExport(props,async path=>{const bytes=await read(path);if(path.endsWith('.wav'))new Uint8Array(bytes)[50]^=1;return bytes;}),/SHA-256 mismatch/);
 assert.throws(()=>silkAssetPath('../default','music.wav'),/local public/);
});
test('export applies the same conservative headroom policy to matching requested mix identity',async()=>{
 const mix={master:2,agent:2,material:2,air:2,sparkle:2,typing:2,music:0};
 await assert.rejects(validateSilkExport({...props,mix},async path=>{
  const bytes=await read(path);
  if(!path.endsWith('manifest.json'))return bytes;
  const manifest=JSON.parse(new TextDecoder().decode(bytes));manifest.mixIdentity=mixIdentity(mix);
  return new TextEncoder().encode(JSON.stringify(manifest)).buffer;
 }),/conservative headroom/);
});
test('additive registration reuses original Scene and separate route; legacy hooks are confined to legacy child',async()=>{
 const app=await text('../micro-18/App.tsx'),silk=await text('./App.tsx'),panel=await text('./AudioPanel.tsx');
 const root=await text('../../video/Root.tsx'),video=await text('../../video/Ultimate3Silk.tsx'),main=await text('../../tune/main.tsx'),picker=await text('../ExperimentPicker.tsx');
 assert.match(root,/id="Ultimate3Silk"/);assert.match(root,/id="MicroAnimation18"/);assert.match(main,/experiment === 'ultimate-3-silk'/);assert.match(main,/experiment === 'micro-18'/);assert.match(picker,/Ultimate 3 — Silk sound design/);
 assert.match(main,/const Micro15App=lazy\(/);assert.match(main,/<Suspense fallback=\{<p role="status">Loading Issue clusters authoring/);assert.ok(!main.includes("import {Micro15App}"));
 assert.match(silk,/<Micro18App edition=\{SILK_EDITION\}/);assert.match(video,/Ultimate3Scene/);assert.match(video,/validateSilkExport/);
 const body=app.slice(app.indexOf('export const Micro18App='));
 for(const hook of ['useStreamRunAudio','useRatchetClicks','useUltimate3Music','useIssueTypingAudio']){assert.ok(!body.includes(hook));assert.ok(!panel.includes(hook));assert.ok(app.slice(app.indexOf('function LegacyUltimate3Audio'),app.indexOf('const ORIGINAL_EDITION')).includes(hook));}
 assert.match(body,/edition\.readSettings\(\)/);assert.match(body,/edition\.settingsStorageId/);assert.match(body,/edition\.panelIds/);assert.match(body,/edition=ORIGINAL_EDITION/);
 assert.equal((app.match(/TODO\(production\)/g)||[]).length,6);assert.match(app,/clip.current/);assert.match(app,/useDialTimeline/);assert.match(app,/<DialTimeline/);
});
test('Silk namespaces and loaders neither migrate nor read original persisted settings/mix',async()=>{
 const edition=await text('./edition.ts');assert.match(edition,/ultimate-3-silk-\$\{key\}-v1/);assert.ok(!edition.includes('migrate'));assert.ok(!edition.includes('micro-animation-18-'));
 assert.notEqual(SILK_SETTINGS_STORAGE_ID,'micro-animation-18-settings-v2');assert.ok(SILK_MIX_STORAGE_ID.startsWith('ultimate-3-silk-'));
 const original=await text('../micro-18/sound-controls.ts');assert.match(original,/musicVolume:\s*0/);
});
