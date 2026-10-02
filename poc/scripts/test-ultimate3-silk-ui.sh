#!/usr/bin/env bash
# Existing localhost:5180 + installed Chrome only. Test-owned isolated browser session.
# Audio is explicitly muted at the destination; no listening claim, no OS downloads.
set -euo pipefail
SESSION="silk-correction-$(date +%s)-$$"
trap 'agent-browser --session "$SESSION" close >/dev/null 2>&1 || true' EXIT
echo "Dedicated browser session: $SESSION"
agent-browser --session "$SESSION" --executable-path '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' open 'chrome://version'
agent-browser --session "$SESSION" eval '(()=>{const executable=document.querySelector("#executable_path")?.textContent.trim();if(executable!=="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")throw Error("Wrong browser executable: "+executable);return {executable,version:document.querySelector("#version")?.textContent.trim(),commandLine:document.querySelector("#command_line")?.textContent,profile:document.querySelector("#profile_path")?.textContent};})()'
agent-browser --session "$SESSION" open 'http://localhost:5180/ultimate-3-silk/piano/manifest.json'
agent-browser --session "$SESSION" eval --stdin <<'JS'
(async()=>{
 // Seed migration-bearing legacy data in this isolated test session only.
 localStorage.removeItem('dialkit:micro-animation-15-direct-v4');
 localStorage.setItem('dialkit:micro-animation-15-direct-v3',JSON.stringify({version:1,values:{timelineDuration:16.5,travelDuration:2.7,warningAppearanceDuration:.4}}));
 const stats=window.__silkTest={contexts:0,oscillators:0,copies:0,starts:[],stops:0,closed:0,workers:0,terminated:0,storageAccess:[],originalStorage:Object.fromEntries(Object.entries(localStorage).filter(([k])=>!k.includes('ultimate-3-silk')))};
 // Only clear this test session's new-edition snapshots; never touch legacy keys.
 for(const key of Object.keys(localStorage))if(key.includes('ultimate-3-silk'))localStorage.removeItem(key);
 for(const method of ['getItem','setItem']){const original=Storage.prototype[method];Storage.prototype[method]=function(key,...args){stats.storageAccess.push(key);return original.call(this,key,...args);};}
 const Context=window.AudioContext;
 window.AudioContext=new Proxy(Context,{construct(Target,args){stats.contexts++;const ctx=Reflect.construct(Target,args);
  const destination=ctx.destination,mute=ctx.createGain();mute.gain.value=0;mute.connect(destination);Object.defineProperty(ctx,'destination',{value:mute});
  for(const name of ['createBuffer','createOscillator','close']){const fn=ctx[name].bind(ctx);ctx[name]=(...args)=>{stats[name==='createBuffer'?'copies':name==='close'?'closed':'oscillators']++;return fn(...args);};}
  const create=ctx.createBufferSource.bind(ctx);ctx.createBufferSource=()=>{const source=create(),start=source.start.bind(source),stop=source.stop.bind(source);source.start=(when,offset)=>{stats.starts.push({when,offset,playhead:Number(document.querySelector('.micro18-app')?.dataset.time)});return start(when,offset);};source.stop=(...args)=>{stats.stops++;return stop(...args);};return source;};return ctx;
 }});
 const WorkerClass=window.Worker;window.Worker=new Proxy(WorkerClass,{construct(Target,args){stats.workers++;const w=Reflect.construct(Target,args),terminate=w.terminate.bind(w);w.terminate=()=>{stats.terminated++;return terminate();};return w;}});
 history.replaceState(null,'','/?experiment=ultimate-3-silk');document.body.innerHTML='<div id="root"></div>';
 const {default:RefreshRuntime}=await import('/@react-refresh');RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;
 await import('/src/tune/main.tsx');
 return {mounted:true,muted:true};
})()
JS
agent-browser --session "$SESSION" wait 6000
agent-browser --session "$SESSION" eval 'if(window.__silkTest.contexts!==0)throw Error("An audio engine mounted before enable");document.querySelector(".silk-audio details").open=true;({ready:document.querySelector(".silk-audio").dataset.ready})'
agent-browser --session "$SESSION" click 'button:has-text("Enable audio")'
agent-browser --session "$SESSION" eval --stdin <<'JS'
(async()=>{
 const stats=window.__silkTest,assert=(value,message)=>{if(!value)throw Error(message);},sleep=ms=>new Promise(r=>setTimeout(r,ms));
 const wait=async fn=>{for(let i=0;i<150;i++){if(fn())return;await sleep(100);}throw Error('UI wait timed out');};
 const source=await(await fetch('/src/experiments/micro-18/App.tsx')).text(),dial=await import(source.match(/from "([^"\n]*dialkit[^"\n]*)"/)[1]);
 const {TimelineStore,DialStore}=dial;
 const panel=()=>document.querySelector('.silk-audio'),main='ultimate-3-silk-main-v1';
 assert(panel().textContent.includes('SFX-only (music off)'),'Music-off label');assert(stats.contexts===1&&stats.oscillators===0,'Legacy engine isolation');
 TimelineStore.seek(main,1);TimelineStore.play(main);await sleep(450);assert(stats.starts.length-stats.stops===6,'Six active PCM sources');const copies=stats.copies;
 TimelineStore.pause(main);await sleep(80);assert(stats.stops===stats.starts.length,'Pause stops every PCM source');
 TimelineStore.seek(main,3);TimelineStore.play(main);await sleep(200);assert(stats.starts.at(-1).offset>=3,'Resume seeks current offset');TimelineStore.pause(main);await sleep(80);
 // Live gains are GainNodes only; no worker rebuilds or buffer copies.
 const beforeWorkers=stats.workers,beforeCopies=stats.copies;
 const setRange=(label,value)=>{const e=document.querySelector(`[aria-label="${label}"]`);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,value);e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));};
 setRange('Silk music gain',1);await sleep(80);assert(stats.workers===beforeWorkers&&stats.copies===beforeCopies,'Gain edit rebuilt/copied full PCM');assert(panel().textContent.includes('music enabled'),'Enabled music label');
 // Download is prepared, NOT clicked: hash exact current mix and invalidate on gain edit.
 [...panel().querySelectorAll('button')].find(b=>b.textContent==='Prepare current mix WAV').click();await wait(()=>panel().querySelector('a[download]'));
 const link=panel().querySelector('a[download]'),manifest=await(await fetch('/ultimate-3-silk/default/manifest.json')).json();
 assert(link.dataset.sha256===manifest.files['music-enabled-reference.wav'].sha256,'Enabled current download differs from shared CLI PCM');const downloadHash=link.dataset.sha256;
 setRange('Silk music gain',0);await sleep(80);assert(!panel().querySelector('a[download]'),'Stale download link retained');
 // The production update path (NOT transport.seek): an uninterrupted +40ms dock seek.
 TimelineStore.seek(main,4);TimelineStore.play(main);await sleep(350);
 const steadyStarts=stats.starts.length;await sleep(400);assert(stats.starts.length===steadyStarts,'Normal ticks churn sources');
 const requestedSeek=TimelineStore.getTransport(main).time+.04;TimelineStore.seek(main,requestedSeek);await sleep(250);
 assert(stats.starts.length===steadyStarts+6,'Integrated 40ms seek did not replace exactly six sources');
 const seekStart=stats.starts.at(-1);assert(Math.abs(seekStart.offset-seekStart.playhead)<.04,'Seek source offset diverges from latest timeline');
 await sleep(400);assert(stats.starts.length===steadyStarts+6,'Small seek resync never settles');
 // Actual supported unsafe request: refuse BEFORE applying it, retain every requested gain.
 for(const key of ['master','agent','material','air','sparkle','typing'])setRange(`Silk ${key} gain`,2);
 await sleep(100);assert(panel().dataset.mixValid==='false'&&panel().querySelector('[role=alert]'),'Unsafe mix has no actionable warning');
 assert(stats.starts.length===stats.stops,'Unsafe edited gains still audible');
 assert(JSON.parse(localStorage.getItem('ultimate-3-silk-mix-v1')).master===2,'Requested invalid mix was silently replaced');
 assert([...panel().querySelectorAll('button')].find(b=>b.textContent==='Prepare current mix WAV').disabled,'Unsafe current download still enabled');
 setRange('Silk master gain',.25);await sleep(100);assert(panel().dataset.mixValid==='true'&&stats.starts.length-stats.stops===6,'Safe correction failed to resume');
 const {DEFAULT_SILK_MIX}=await import('/src/experiments/ultimate-3-silk/types.ts');
 for(const [key,value] of Object.entries(DEFAULT_SILK_MIX))setRange(`Silk ${key} gain`,value);
 await sleep(100);TimelineStore.pause(main);await sleep(100);
 // Hold an invalid request through new-stem installation as well.
 for(const key of ['master','agent','material','air','sparkle','typing'])setRange(`Silk ${key} gain`,2);
 await sleep(80);
 // Simultaneous controls/timing edits must not overwrite each other's stale base.
 document.querySelector('.micro18-nav button:nth-child(3)').click();await sleep(200);
 DialStore.updateValues('ultimate-3-silk-cost-v1',{'cheapLegOneRight.at':1.5});DialStore.updateValues('ultimate-3-silk-costControls-v1',{cheapSpinnerSpeed:13});await sleep(200);
 const readSettings=()=>JSON.parse(localStorage.getItem('ultimate-3-silk-settings-v1'));
 assert(readSettings().cost.timing.cheapLegOneRight.at===1.5&&readSettings().cost.controls.cheapSpinnerSpeed===13,'Concurrent authoring edit discarded');
 document.querySelector('.micro18-nav button:first-child').click();await sleep(150);document.querySelector('.micro18-nav button:nth-child(3)').click();await sleep(150);
 assert(readSettings().cost.timing.cheapLegOneRight.at===1.5&&readSettings().cost.controls.cheapSpinnerSpeed===13,'Panel switch discarded edits');
 // Rapid edits cancel stale builds. Start playing only after an explicit latest seek.
 DialStore.updateValues('ultimate-3-silk-costControls-v1',{cheapSpinnerSpeed:15});await sleep(220);DialStore.updateValues('ultimate-3-silk-costControls-v1',{cheapSpinnerSpeed:12});await sleep(80);
 assert(panel().dataset.ready==='false','Old PCM still ready under changed settings');
 document.querySelector('.micro18-nav button:first-child').click();await sleep(150);TimelineStore.seek(main,20);TimelineStore.play(main);await wait(()=>panel().dataset.ready==='true');await sleep(150);
 assert(panel().dataset.mixValid==='false'&&stats.starts.length===stats.stops,'New PCM installed with unsafe requested gains');
 for(const [key,value] of Object.entries(DEFAULT_SILK_MIX))setRange(`Silk ${key} gain`,value);
 await sleep(200);assert(panel().dataset.mixValid==='true'&&stats.starts.length-stats.stops===6,'New-generation safe recovery failed');
 const latest=stats.starts.at(-1);assert(Math.abs(latest.offset-latest.playhead)<.08&&latest.offset>=20,'Worker completion used launch playhead');
 TimelineStore.pause(main);await sleep(100);
 const afterStorage=Object.fromEntries(Object.entries(localStorage).filter(([k])=>!k.includes('ultimate-3-silk')));
 assert(JSON.stringify(afterStorage)===JSON.stringify(stats.originalStorage),'Original storage mutated');assert(!stats.storageAccess.some(k=>k.includes('micro-animation-')),'Original namespace accessed');
 assert(stats.oscillators===0&&stats.contexts===1,'Legacy audio mounted');assert(stats.copies<=18,'Unbounded AudioBuffer copies');
 const result={passed:true,muted:true,gainSafetyAndRecovery:true,unsafeNewStemInstallationRefused:true,integrated40msSeek:true,ordinaryTicksNoChurn:true,seekStart,downloadHash,contexts:stats.contexts,legacyOscillators:stats.oscillators,bufferCopies:stats.copies,workerStarts:stats.workers,workerTerminations:stats.terminated,sourceStarts:stats.starts.length,sourceStops:stats.stops,latestStart:latest,originalStorageUnchanged:true,simultaneousEditsAndPanelSwitchPreserved:true};
 return result;
})()
JS
agent-browser --session "$SESSION" errors
# Approved lazy-import exception: original route still performs its existing migration.
agent-browser --session "$SESSION" open 'http://localhost:5180/?experiment=micro-15'
agent-browser --session "$SESSION" wait 1000
agent-browser --session "$SESSION" eval --stdin <<'JS'
(()=>{const saved=JSON.parse(localStorage.getItem('dialkit:micro-animation-15-direct-v4')),app=document.querySelector('.micro15-app'),scene=document.querySelector('.micro15-composition');if(!app||!scene||!document.querySelector('.dialkit-timeline'))throw Error('Original Micro15 deferred entry did not render');if(saved.values.timelineDuration!==7||saved.values.travelDuration!==2.7)throw Error('Original migration not preserved');const r=scene.getBoundingClientRect();if(r.width<=0||r.height<=0||getComputedStyle(app).position!=='fixed')throw Error('Original styles/layout absent');return {passed:true,originalMicro15Migration:saved.values,sceneWidth:r.width,sceneHeight:r.height,stylesLoaded:true};})()
JS
