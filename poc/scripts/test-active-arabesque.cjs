// Existing :5180 only. Isolated Chrome profile; never edits the user's browser storage.
const {execFileSync} = require('node:child_process');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const session = 'active-arabesque-regression';
const output = process.argv[2] || '/tmp/active-arabesque-browser.json';
function run(...args) {
  const result = JSON.parse(execFileSync('agent-browser', ['--session', session, '--json', ...args], {encoding:'utf8', timeout:30000, maxBuffer:4*1024*1024}));
  assert.ok(result.success, JSON.stringify(result)); return result.data;
}
const evaluate = js => run('eval', js).result;
const setup = `(async () => {
  const loaded = part => performance.getEntriesByType('resource').filter(x => x.name.includes(part)).at(-1).name;
  const {IssueTypingTickEngine} = await import(loaded('/typing-audio.ts'));
  const {ArabesqueBedEngine, ARABESQUE_SOUNDTRACK_URL} = await import(loaded('/arabesque-playback.ts'));
  const {TimelineStore, DialStore} = await import(loaded('/dialkit.js?'));
  const {sampleUltimate3} = await import('/src/experiments/micro-18/sample.ts');
  const {ultimate3TypingTickEvents} = await import(loaded('/typing-audio.ts'));
  const {renderThockKeystroke} = await import('/src/experiments/micro-18/thock-typing.ts');
  const settings = JSON.parse(localStorage.getItem('micro-animation-18-settings-v1'));
  const events = ultimate3TypingTickEvents(settings);
  const state = window.__activeThockTest = {events, taps: [], settings, TimelineStore, DialStore, url: ARABESQUE_SOUNDTRACK_URL};
  const prototype = IssueTypingTickEngine.prototype, schedule = prototype.scheduleAt;
  prototype.scheduleAt = function(at, voice) {
    state.typing = this;
    const event = events.find(e => e.voice === voice), pcm = renderThockKeystroke(voice);
    const time = Number(document.querySelector('.micro18-app').dataset.time);
    const visible = sampleUltimate3(event.time, settings).issues;
    const before = this.active.size;
    schedule.call(this, at, voice);
    const buffer = this.buffers.get(voice); let delta = 0;
    for (let c=0;c<2;c++) for (let n=0;n<pcm.left.length;n++) delta = Math.max(delta, Math.abs(buffer.getChannelData(c)[n]-(c?pcm.right:pcm.left)[n]));
    state.taps.push({voice, eventTime:event.time, frameTime:time, delay:at-this.context.currentTime,
      alignment:at-this.context.currentTime-(event.time-time), postludeActive:visible.postludeActive,
      source20Phase:visible.source20.phase, agentVisible:visible.sample.agent.visible,
      agentText:{prompt:visible.sample.agent.prompt,issue:visible.sample.agent.issue,command:visible.sample.agent.command,query:visible.sample.agent.query},
      pcmDelta:delta, added:this.active.size-before,
      master:this.output.gain.value, voiceGain:[...this.active].at(-1).level.gain.value});
  };
  const enable = ArabesqueBedEngine.prototype.enable;
  ArabesqueBedEngine.prototype.enable = async function() {
    state.bed = this; await enable.call(this);
    if (!state.analyser) { state.analyser=this.context.createAnalyser(); state.analyser.fftSize=2048; this.master.connect(state.analyser); }
  };
  TimelineStore.seek('micro-animation-18-main-timeline-v1', events[0].time-.22);
  return {first:events[0],settings, url:state.url};
})()`;
const report = [];
try {
  run('--executable-path', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', 'open', 'http://localhost:5180/?experiment=micro-18');
  for (const retimed of [false, true]) {
    if (retimed) {
      evaluate(`(async()=>{const {normalizeSettings}=await import('/src/experiments/micro-18/settings.ts');const s=JSON.parse(localStorage.getItem('micro-animation-18-settings-v1'));s.issues.leadIn={at:.2,duration:0,transition:{type:'easing',duration:0,ease:[0,0,1,1]}};s.issues.preludeTiming.bashDescent.duration+=1.3;s.issues.timing.promptTyping={at:4.6,duration:.7};s.issues.timing.issueTyping={at:4.6,duration:.7};localStorage.setItem('micro-animation-18-settings-v1',JSON.stringify(normalizeSettings(s)));localStorage.removeItem('dialkit:micro-animation-18-main-timeline-v1');})()`);
      run('open', 'http://localhost:5180/?experiment=micro-18');
    }
    const initial = evaluate(setup);
    run('click', 'button[aria-label="Play"]');
    run('wait', '1700');
    const active = evaluate(`(()=>{const s=window.__activeThockTest;return {taps:s.taps,bed:{src:s.bed.element.currentSrc,paused:s.bed.element.paused,master:s.bed.master.gain.value,time:s.bed.element.currentTime},loaded:performance.getEntriesByType('resource').filter(x=>x.name.includes('/audio/')).map(x=>x.name)}})()`);
    fs.writeFileSync(output, JSON.stringify({initial, active}, null, 2));
    assert.ok(active.taps.length >= 3, 'actual mounted viewer must schedule typing: '+JSON.stringify(active));
    assert.equal(new Set(active.taps.map(t=>t.voice)).size, active.taps.length, 'no doubled taps');
    for (const tap of active.taps) { assert.equal(tap.pcmDelta,0); assert.equal(tap.added,1); assert.equal(tap.postludeActive,true); assert.equal(tap.agentVisible,true); assert.ok(Math.abs(tap.alignment)<.035, JSON.stringify(tap)); assert.ok(Math.abs(tap.master-6.98)<1e-6); assert.ok(Math.abs(tap.voiceGain-.2)<1e-6); }
    assert.ok(active.bed.src.endsWith(initial.url)); assert.equal(active.bed.paused,false);
    assert.ok(active.loaded.every(url=>!url.includes('ultimate3-softness-8.wav')), 'old baked keyboard asset must not load');
    // Pause must cancel already-scheduled releases; paused scrubbing schedules nothing.
    run('click','button[aria-label="Pause"]');
    run('wait','150');
    const paused = evaluate(`(()=>{const s=window.__activeThockTest; const count=s.taps.length;s.TimelineStore.seek('micro-animation-18-main-timeline-v1',s.events[0].time+.1);return {count,active:s.typing.active.size,paused:s.bed.element.paused};})()`);
    run('wait','150');
    assert.equal(paused.active,0); assert.equal(paused.paused,true);
    assert.equal(evaluate('window.__activeThockTest.taps.length'),paused.count);
    // Resume after reverse seek, then replay: identities repeat but never stale taps.
    evaluate(`(()=>{const s=window.__activeThockTest;s.taps=[];s.TimelineStore.seek('micro-animation-18-main-timeline-v1',s.events[0].time-.22)})()`);
    run('click','button[aria-label="Play"]'); run('wait','700');
    const replay = evaluate('window.__activeThockTest.taps');
    assert.equal(replay[0].voice,0); assert.equal(replay[0].pcmDelta,0);
    // Actual active master updates: 0 silences the media output and typing release graph.
    evaluate(`window.__activeThockTest.DialStore.updateValue('micro-animation-18-stream-run-sound-v1','Shared.masterVolume',0)`);
    run('wait','150');
    const muted = evaluate(`(()=>{const s=window.__activeThockTest;const data=new Float32Array(2048);s.analyser.getFloatTimeDomainData(data);return {bedMaster:s.bed.master.gain.value,typingMaster:s.typing.output.gain.value,peak:Math.max(...data.map(Math.abs))};})()`);
    assert.equal(muted.bedMaster,0); assert.equal(muted.typingMaster,0); assert.equal(muted.peak,0);
    const gains=[];
    for (const master of [1,2]) {
      evaluate(`window.__activeThockTest.DialStore.updateValue('micro-animation-18-stream-run-sound-v1','Shared.masterVolume',${master})`);run('wait','80');
      gains.push(evaluate('({bed:window.__activeThockTest.bed.master.gain.value,typing:window.__activeThockTest.typing.output.gain.value})'));
    }
    assert.deepEqual(gains,[{bed:1,typing:1},{bed:2,typing:2}]);
    evaluate(`window.__activeThockTest.DialStore.updateValue('micro-animation-18-stream-run-sound-v1','Shared.masterVolume',6.98);window.__activeThockTest.taps=[]`);
    // Invoke the actual Replay button handler; the expanded sound panel can overlay its hitbox.
    evaluate(`document.querySelector('button[aria-label="Replay"]').click()`); run('wait','150');
    const restart=evaluate(`(()=>{const s=window.__activeThockTest;return {taps:s.taps.length,active:s.typing.active.size,bedTime:s.bed.element.currentTime,paused:s.bed.element.paused}})()`);
    assert.equal(restart.taps,0);assert.equal(restart.active,0);assert.ok(restart.bedTime<1);assert.equal(restart.paused,false);
    run('click','button[aria-label="Pause"]');
    report.push({retimed,first:initial.first,active,paused,replay,restart,muted,gains});
  }
  assert.notEqual(report[0].first.time,report[1].first.time);
  // Three SHORT 0.4s PCM renders, never the full legacy WebAudio mix.
  const pcmParity = evaluate(`(async()=>{
    const loaded=p=>performance.getEntriesByType('resource').filter(x=>x.name.includes(p)).at(-1).name;
    const {IssueTypingTickEngine}=await import(loaded('/typing-audio.ts'));
    const {ARABESQUE_BED_CALIBRATION:cal,ARABESQUE_THOCK_TRIM:trim}=await import(loaded('/arabesque-playback.ts'));
    const {renderThockKeystroke}=await import('/src/experiments/micro-18/thock-typing.ts');
    const pcm=renderThockKeystroke(7), rendered=[];
    for (const master of [0,1,2]) {
      const ctx=new OfflineAudioContext(2,19200,48000), output=ctx.createGain();output.gain.value=master;output.connect(ctx.destination);
      const bed=ctx.createBuffer(2,19200,48000);bed.getChannelData(0).fill(.03);bed.getChannelData(1).fill(-.03);
      const source=ctx.createBufferSource();source.buffer=bed;const calibration=ctx.createGain();calibration.gain.value=cal;source.connect(calibration).connect(output);source.start(0);
      const typing=new IssueTypingTickEngine({context:ctx,output});await typing.enable();typing.setTypingVolume(trim);typing.scheduleAt(.05,7);
      rendered.push(await ctx.startRendering());
    }
    let mutePeak=0,doubleDelta=0,formulaDelta=0;
    for(let c=0;c<2;c++)for(let n=0;n<19200;n++){
      const one=rendered[1].getChannelData(c)[n];
      mutePeak=Math.max(mutePeak,Math.abs(rendered[0].getChannelData(c)[n]));
      doubleDelta=Math.max(doubleDelta,Math.abs(rendered[2].getChannelData(c)[n]-2*one));
      const key=(c?pcm.right:pcm.left)[n-2400]||0;
      formulaDelta=Math.max(formulaDelta,Math.abs(one-((c?-.03:.03)*cal+key*trim)));
    }
    return {mutePeak,doubleDelta,formulaDelta};
  })()`);
  assert.equal(pcmParity.mutePeak,0);assert.equal(pcmParity.doubleDelta,0);assert.ok(pcmParity.formulaDelta<1e-8);
  run('open','http://localhost:5180/?experiment=micro-18&time=57');
  run('wait','200');
  const inspection=evaluate(`({inspecting:document.querySelector('.micro18-app').dataset.inspecting,playButtons:document.querySelectorAll('button[aria-label="Play"]').length,audio:performance.getEntriesByType('resource').filter(x=>x.name.includes('/audio/')).map(x=>x.name)})`);
  assert.equal(inspection.inspecting,'true'); assert.equal(inspection.playButtons,0); assert.deepEqual(inspection.audio,[]);
  const errors=run('errors'); assert.deepEqual(errors.errors,[]);
  fs.writeFileSync(output,JSON.stringify({report,pcmParity,inspection,errors},null,2));
  console.log('PASS actual micro-18: new typing-free asset, source20 default/retimed PCM scheduling, pause/seek/replay, master 0/1/2, inspection silence. '+output);
} finally {run('close');}
