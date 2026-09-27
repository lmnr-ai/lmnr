import base64, json
from pathlib import Path

DURATION = 54.165333
AUDIO = Path('transcript-output/audio.wav')
OUT = Path('transcript-output/transcript.html')
phrases = [
    (1.14, 4.08, "You build agents and you want to know what they’re up to."),
    (4.62, 6.00, "Every time your agent runs,"),
    (6.30, 7.14, "we collect a trace."),
    (8.00, 10.20, "It tells you exactly what your agent is doing."),
    (11.48, 13.04, "Your agents run a lot,"),
    (13.04, 16.98, "and your traces contain the insights you need to make your agents better,"),
    (17.38, 17.86, "faster,"),
    (17.86, 18.82, "and more reliable."),
    (19.46, 21.64, "If only someone could read all of those traces."),
    (22.36, 24.30, "That’s why we built Laminar Signals."),
    (24.94, 28.66, "A specialized agent built to analyze agent traces at scale."),
    (28.66, 35.82, "It finds issues and clusters them into high-level patterns ready to fix by you or your coding agent."),
    (37.20, 39.18, "Signals are powered by Flow 1,"),
    (39.76, 41.38, "Laminar’s trace analysis model,"),
    (41.88, 44.66, "delivering frontier intelligence at a fraction of the cost."),
    (46.04, 50.22, "You finally have access to the insights hiding in one million agent traces."),
    (50.84, 53.54, "Start shipping reliable agents with Laminar."),
]
segments=[]
cursor=0.0
for start,end,text in phrases:
    if start > cursor + .001:
        segments.append({'type':'silence','start':cursor,'end':start,'text':'Silence'})
    segments.append({'type':'speech','start':start,'end':end,'text':text})
    cursor=end
if cursor < DURATION:
    segments.append({'type':'silence','start':cursor,'end':DURATION,'text':'Silence'})
for i,s in enumerate(segments,1): s['number']=i

audio64=base64.b64encode(AUDIO.read_bytes()).decode()
data=json.dumps(segments,ensure_ascii=False)
frame_dir=Path('transcript-output/frames')
frame_labels=[chr(65+i) if i < 26 else 'A'+chr(65+i-26) for i in range(30)]
frames={label:'data:image/png;base64,'+base64.b64encode((frame_dir/f'{label}.png').read_bytes()).decode() for label in frame_labels}
frame_data=json.dumps(frames)
html='''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Timed transcript — DanDan Noodle Restaurant 7</title>
<style>
:root{--ink:#17211b;--muted:#667069;--paper:#f5f1e8;--card:#fffdf7;--line:#b5b9ae;--green:#256c4a;--amber:#b87428;--scale:58px}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:15px/1.45 ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
header{position:sticky;top:0;z-index:20;padding:18px 24px 14px;background:rgba(245,241,232,.96);backdrop-filter:blur(12px);border-bottom:1px solid #d8d4ca}
.header-inner{max-width:980px;margin:auto}.eyebrow{color:var(--green);font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase}h1{font:600 25px/1.15 ui-serif,Georgia,serif;margin:3px 0 12px}
.controls{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.play{border:0;border-radius:99px;background:var(--ink);color:white;width:40px;height:40px;font-size:16px;cursor:pointer}.time{font-variant-numeric:tabular-nums;font-weight:650;min-width:108px}.scrub{accent-color:var(--green);width:min(450px,48vw)}.copy{border:1px solid #b9b6ad;border-radius:7px;background:var(--card);padding:8px 12px;font-weight:700;cursor:pointer}.copy:hover{border-color:var(--green)}
main{max-width:980px;margin:25px auto 70px;padding:0 24px}.legend{display:flex;gap:18px;color:var(--muted);font-size:12px;margin:0 0 18px 151px}.key:before{content:"";display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:6px}.speech-key:before{background:var(--green)}.silence-key:before{background:#d5c7b1}
.timeline{position:relative;height:calc(54.165333 * var(--scale));min-height:3142px}.axis{position:absolute;left:134px;top:0;bottom:0;width:2px;background:var(--line)}
.wave{position:absolute;left:80px;top:0;width:48px;height:100%;opacity:.52}.playhead{position:absolute;z-index:8;left:66px;right:0;top:0;height:2px;background:#d34e35;pointer-events:none;box-shadow:0 0 0 1px rgba(255,255,255,.55)}.playhead:before{content:"";position:absolute;left:63px;top:-5px;width:11px;height:11px;border-radius:50%;background:#d34e35}
.segment{position:absolute;left:134px;right:0;top:calc(var(--start) * var(--scale));height:max(calc(var(--duration) * var(--scale)),2px);border-left:8px solid;cursor:pointer}.segment:before{content:"";position:absolute;left:-8px;top:0;width:22px;height:1px;background:currentColor}.segment:focus{outline:2px solid #3875d7;outline-offset:3px}
.label{position:absolute;left:25px;top:0;width:min(650px,calc(100vw - 220px));border-radius:7px;background:var(--card);border:1px solid #dcd8ce;padding:8px 12px;box-shadow:0 2px 8px rgba(34,39,35,.06)}.frame-pick{float:right;margin-left:12px;border:1px solid #c9c5ba;border-radius:5px;background:#f4efe4;padding:3px 8px;color:var(--ink);font-size:11px;font-weight:800;cursor:pointer}.frame-pick.assigned{background:var(--green);border-color:var(--green);color:#fff}.notes{display:block;width:100%;min-height:30px;margin-top:7px;padding:5px 7px;resize:vertical;border:1px solid #d8d3c8;border-radius:5px;background:#faf8f2;color:var(--ink);font:12px/1.3 ui-sans-serif,system-ui}.notes::placeholder{color:#999}.speech{border-color:var(--green);color:var(--green)}.speech .words{color:var(--ink);font:500 16px/1.35 ui-serif,Georgia,serif}.silence{border-color:#d5c7b1;color:var(--amber)}.silence .label{padding:3px 9px;background:#eee7dc;border-style:dashed;white-space:nowrap}.silence .words{font-size:11px;color:#806b50;text-transform:uppercase;letter-spacing:.08em}.meta{display:flex;gap:10px;align-items:baseline}.num{font-size:11px;font-weight:800}.stamp{font-size:11px;color:var(--muted);font-variant-numeric:tabular-nums}.duration{font-size:10px;color:#999}.active .label{border-color:#d34e35;box-shadow:0 0 0 2px rgba(211,78,53,.14)}
.tick{position:absolute;left:90px;width:45px;border-top:1px solid #c7c9c1;color:#7a817b;font-size:10px;font-variant-numeric:tabular-nums}.tick span{position:absolute;right:52px;top:-8px}
.note{max-width:980px;margin:0 auto 30px;padding:0 24px;color:var(--muted);font-size:12px}.picker{border:0;border-radius:12px;padding:0;width:min(920px,94vw);max-height:88vh;background:var(--card);color:var(--ink);box-shadow:0 20px 70px #0008}.picker::backdrop{background:#111b}.picker-head{position:sticky;top:0;z-index:2;display:flex;justify-content:space-between;align-items:center;padding:14px 16px;background:var(--card);border-bottom:1px solid #ddd8cc}.picker-head h2{margin:0;font:600 19px ui-serif,Georgia,serif}.picker-actions{display:flex;gap:8px}.close,.done{border:1px solid #bbb;border-radius:6px;background:white;padding:7px 12px;cursor:pointer}.done{background:var(--green);border-color:var(--green);color:#fff;font-weight:700}.frame-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;padding:14px}.frame-option{position:relative;border:3px solid transparent;border-radius:7px;background:#111;padding:0;overflow:hidden;cursor:pointer}.frame-option:hover,.frame-option.selected{border-color:var(--green)}.frame-option.selected:after{content:'✓';position:absolute;left:7px;top:7px;width:25px;height:25px;border-radius:50%;background:var(--green);color:white;font-weight:900;line-height:25px}.frame-option img{display:block;width:100%;height:auto}.frame-option b{position:absolute;right:5px;bottom:5px;background:#000c;color:#fff;border-radius:4px;padding:2px 6px}.clear-frame{margin:0 14px 14px;border:1px solid #bbb;border-radius:6px;background:white;padding:7px 12px;cursor:pointer}
@media(max-width:650px){:root{--scale:48px}main{padding:0 10px}.timeline{min-height:2600px}.axis,.segment{left:74px}.wave{left:28px;width:40px}.playhead{left:18px}.playhead:before{left:51px}.tick{left:30px}.tick span{display:none}.legend{margin-left:74px}.label{left:18px}.speech .words{font-size:14px}}
</style></head>
<body><header><div class="header-inner"><div class="eyebrow">Timed transcript · 32 segments</div><h1>DanDan Noodle Restaurant 7 — optimized natural</h1><div class="controls"><button class="play" id="play" aria-label="Play audio">▶</button><span class="time" id="time">00:00.000 / 00:54.165</span><input class="scrub" id="scrub" type="range" min="0" max="54.165333" step="0.001" value="0" aria-label="Audio position"><button class="copy" id="copy">Copy mapping JSON</button></div></div></header>
<main><div class="legend"><span class="key speech-key">Speech phrase</span><span class="key silence-key">Gap / silence</span><span>Click any flag to seek</span></div><div class="timeline" id="timeline"><canvas class="wave" id="wave"></canvas><div class="axis"></div><div class="playhead" id="playhead"></div></div></main>
<div class="note">Phrase boundaries use MLX Whisper word timestamps. Gaps are the intervals between detected phrases; the waveform was independently checked with FFmpeg silence detection. Transcript punctuation and the obvious “agent traces” recognition error were manually corrected.</div>
<audio id="audio" preload="auto" src="data:audio/wav;base64,AUDIO_DATA"></audio>
<dialog class="picker" id="picker"><div class="picker-head"><h2 id="picker-title">Choose frames</h2><div class="picker-actions"><button class="close" id="close-picker">Cancel</button><button class="done" id="done-picker">Done</button></div></div><div class="frame-grid" id="frame-grid"></div><button class="clear-frame" id="clear-frame">Clear selection</button></dialog>
<script>
const duration=54.165333, segments=SEGMENT_DATA, frames=FRAME_DATA;
const storageKey='dandan-frame-mapping-v2';let saved=JSON.parse(localStorage.getItem(storageKey)||'{"images":{},"notes":{}}'),mapping=saved.images||{},notes=saved.notes||{},picking=null,draft=[];
const audio=document.querySelector('#audio'),timeline=document.querySelector('#timeline'),play=document.querySelector('#play'),scrub=document.querySelector('#scrub'),time=document.querySelector('#time'),playhead=document.querySelector('#playhead');
const fmt=s=>{s=Math.max(0,s);const m=Math.floor(s/60),q=(s%60).toFixed(3).padStart(6,'0');return String(m).padStart(2,'0')+':'+q};
for(let t=0;t<=duration;t+=5){let e=document.createElement('div');e.className='tick';e.style.top=`calc(${t} * var(--scale))`;e.innerHTML=`<span>${fmt(t).slice(0,5)}</span>`;timeline.append(e)}
segments.forEach(s=>{let e=document.createElement('div');e.className=`segment ${s.type}`;e.tabIndex=0;e.dataset.n=s.number;e.style.setProperty('--start',s.start);e.style.setProperty('--duration',s.end-s.start);e.setAttribute('aria-label',`Segment ${s.number}, ${s.type}, ${fmt(s.start)} to ${fmt(s.end)}: ${s.text}`);e.innerHTML=`<div class="label"><button class="frame-pick${mapping[s.number]?.length?' assigned':''}" data-pick="${s.number}">${mapping[s.number]?.join(', ')||'Choose images'}</button><div class="meta"><b class="num">${s.number}</b><span class="stamp">${fmt(s.start)} → ${fmt(s.end)}</span><span class="duration">${(s.end-s.start).toFixed(2)}s</span></div><div class="words">${s.text}</div><textarea class="notes" data-notes="${s.number}" placeholder="Notes for this segment…">${notes[s.number]||''}</textarea></div>`;let seek=()=>{audio.currentTime=s.start;update();audio.play()};e.onclick=seek;e.onkeydown=x=>{if(x.key==='Enter'||x.key===' '){x.preventDefault();seek()}};e.querySelector('.frame-pick').onclick=x=>{x.stopPropagation();openPicker(s.number)};let note=e.querySelector('.notes');note.onclick=x=>x.stopPropagation();note.onkeydown=x=>x.stopPropagation();note.oninput=()=>{notes[s.number]=note.value;save()};timeline.append(e)});
function update(){let t=audio.currentTime||0;scrub.value=t;time.textContent=`${fmt(t)} / ${fmt(duration)}`;playhead.style.top=`calc(${t} * var(--scale))`;document.querySelectorAll('.segment.active').forEach(x=>x.classList.remove('active'));let s=segments.find(x=>t>=x.start&&t<x.end);if(s)document.querySelector(`[data-n="${s.number}"]`)?.classList.add('active')}
play.onclick=()=>audio.paused?audio.play():audio.pause();audio.onplay=()=>play.textContent='❚❚';audio.onpause=()=>play.textContent='▶';audio.ontimeupdate=update;audio.onended=update;scrub.oninput=()=>{audio.currentTime=+scrub.value;update()};
const picker=document.querySelector('#picker'),grid=document.querySelector('#frame-grid');Object.entries(frames).forEach(([label,src])=>{let b=document.createElement('button');b.className='frame-option';b.dataset.frame=label;b.innerHTML=`<img src="${src}" alt="Frame ${label}"><b>${label}</b>`;b.onclick=()=>{draft.includes(label)?draft=draft.filter(x=>x!==label):draft.push(label);paintPicker()};grid.append(b)});function paintPicker(){grid.querySelectorAll('.frame-option').forEach(x=>x.classList.toggle('selected',draft.includes(x.dataset.frame)))}function openPicker(n){picking=n;draft=[...(mapping[n]||[])];document.querySelector('#picker-title').textContent=`Choose images for segment ${n}`;paintPicker();picker.showModal()}function save(){localStorage.setItem(storageKey,JSON.stringify({images:mapping,notes}));document.querySelectorAll('[data-pick]').forEach(b=>{let v=mapping[b.dataset.pick]||[];b.textContent=v.join(', ')||'Choose images';b.classList.toggle('assigned',v.length>0)})}document.querySelector('#close-picker').onclick=()=>picker.close();document.querySelector('#done-picker').onclick=()=>{mapping[picking]=draft;save();picker.close()};document.querySelector('#clear-frame').onclick=()=>{draft=[];paintPicker()};document.querySelector('#copy').onclick=async()=>{let result=segments.map(s=>({segment:s.number,type:s.type,start:+s.start.toFixed(3),end:+s.end.toFixed(3),text:s.text,images:mapping[s.number]||[],notes:notes[s.number]||''}));await navigator.clipboard.writeText(JSON.stringify(result,null,2));let b=document.querySelector('#copy'),old=b.textContent;b.textContent='Copied!';setTimeout(()=>b.textContent=old,1400)};
const canvas=document.querySelector('#wave');async function waveform(){try{const bytes=await fetch(audio.src).then(r=>r.arrayBuffer()),ctx=new AudioContext(),buf=await ctx.decodeAudioData(bytes),samples=buf.getChannelData(0),dpr=devicePixelRatio||1,h=timeline.clientHeight,w=48;canvas.width=w*dpr;canvas.height=h*dpr;canvas.style.height=h+'px';let c=canvas.getContext('2d');c.scale(dpr,dpr);c.strokeStyle='#256c4a';c.lineWidth=1;c.beginPath();for(let y=0;y<h;y++){let a=Math.floor(y/h*samples.length),b=Math.floor((y+1)/h*samples.length),peak=0;for(let i=a;i<b;i++)peak=Math.max(peak,Math.abs(samples[i]));let half=Math.max(.5,peak*w*.48);c.moveTo(w/2-half,y+.5);c.lineTo(w/2+half,y+.5)}c.stroke();ctx.close()}catch(e){console.warn('Waveform unavailable',e)}}
waveform();update();
</script></body></html>'''.replace('AUDIO_DATA',audio64).replace('SEGMENT_DATA',data).replace('FRAME_DATA',frame_data)
OUT.write_text(html)
print(f'Wrote {OUT} ({OUT.stat().st_size:,} bytes), {len(segments)} segments')
