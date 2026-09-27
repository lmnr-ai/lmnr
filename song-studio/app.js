const songs = window.SONG_STUDIO_SONGS;
const treatments = window.SONG_STUDIO_TEXTURES;
const app = document.querySelector('#app');
let repertoireFilter = 'broad';
let selectedSongId = songs.some(song => song.id === 'joplin-bethena') ? 'joplin-bethena' : songs[0].id;
let selectedTreatmentId = 'hybrid-score';
const repertoireFilters = [
  {id:'broad',label:'New broad set'},
  {id:'folk',label:'Folk + traditional'},
  {id:'early-jazz',label:'Early jazz'},
  {id:'classical',label:'Classical archive'},
  {id:'all',label:'Everything'},
];
function visibleSongs(){
  if(repertoireFilter==='all')return songs;
  if(repertoireFilter==='broad')return songs.filter(song=>song.genre);
  if(repertoireFilter==='classical')return songs.filter(song=>!song.genre);
  if(repertoireFilter==='early-jazz')return songs.filter(song=>song.genre==='Early jazz');
  return songs.filter(song=>song.genre && song.genre!=='Early jazz');
}
let selectedDnaId;
let auditionMode = 'underscore';
let playheadBeat = 0;
let frameId;
let loop = false;

const modes = [
  {id:'dna', label:'DNA only', note:'Hear the smallest memorable cell with no arrangement around it.'},
  {id:'underscore', label:'Under voiceover', note:'Sparse harmonic bed; the melody appears only as recurring fragments.'},
  {id:'full', label:'Full phrase', note:'Hear the source line continuously. Useful—but usually too busy beneath narration.'},
  {id:'ending', label:'Ending check', note:'Jump to the written cadence and judge whether the identity can resolve.'},
];

function selectedSong() { return songs.find(song => song.id === selectedSongId); }
function selectedTreatment() { return treatments.find(item => item.id === selectedTreatmentId); }
function totalBeats(song = selectedSong()) { return song.melody.reduce((sum, item) => sum + item.beats, 0); }
function fallbackDna(song) { return {id:'opening',label:'Opening identity',description:'The opening four beats, tested as a recurring fragment.',occurrences:[{at:0,beats:Math.min(4,totalBeats(song)),label:'A'}]}; }
function dnaOptions(song = selectedSong()) { return song.dna?.length ? song.dna : [fallbackDna(song)]; }
function selectedDna() { const options=dnaOptions(); return options.find(item => item.id === selectedDnaId) ?? options[0]; }
function auditionRange() {
  const song=selectedSong(), dna=selectedDna(), total=totalBeats(song);
  if (auditionMode === 'dna') return {start:dna.occurrences[0].at,end:dna.occurrences[0].at+dna.occurrences[0].beats};
  if (auditionMode === 'ending') return {start:Math.max(0,total-8),end:total};
  return {start:0,end:total};
}
function fmt(seconds) { const min=Math.floor(seconds/60), sec=Math.floor(seconds%60); return `${min}:${String(sec).padStart(2,'0')}`; }
function noteName(midi) { const names=['C','C♯','D','E♭','E','F','F♯','G','A♭','A','B♭','B']; return `${names[(midi+120)%12]}${Math.floor(midi/12)-1}`; }
function contour(dna) {
  const song=selectedSong(), occurrence=dna.occurrences[0], notes=[]; let beat=0;
  for (const item of song.melody) { const start=beat; beat+=item.beats; if (start>=occurrence.at+occurrence.beats) break; if(item.pitch!==null&&beat>occurrence.at) notes.push(item.pitch); }
  if(!notes.length)return '';
  const low=Math.min(...notes), high=Math.max(...notes), range=Math.max(1,high-low);
  return `<div class="dna-contour" aria-label="Pitch contour">${notes.map((pitch,index)=>`<i style="--x:${index/Math.max(1,notes.length-1)*100}%;--y:${(pitch-low)/range*100}%"></i>`).join('')}</div>`;
}

function pianoRoll(song) {
  let beat=0; const pitches=song.melody.filter(item=>item.pitch!==null).map(item=>item.pitch); const low=Math.min(...pitches)-1, high=Math.max(...pitches)+1, range=high-low;
  const notes=song.melody.map((item,index)=>{const start=beat;beat+=item.beats;if(item.pitch===null)return'';return `<button class="roll-note" data-note-beat="${start}" style="--left:${start/totalBeats(song)*100}%;--width:${item.beats/totalBeats(song)*100}%;--bottom:${(item.pitch-low)/range*78+7}%" title="${noteName(item.pitch)} · beat ${start+1}"><span>${index%4===0?noteName(item.pitch):''}</span></button>`}).join('');
  const ranges=selectedDna().occurrences.map((item,index)=>`<span class="dna-range" style="--left:${item.at/totalBeats(song)*100}%;--width:${item.beats/totalBeats(song)*100}%"><b>${item.label||String.fromCharCode(65+index)}</b></span>`).join('');
  return `${ranges}${notes}<i class="roll-playhead" data-roll-playhead></i>`;
}

function songCard(song) {
  const active=song.id===selectedSongId;
  return `<button data-song="${song.id}" class="song-card ${active?'selected':''}"><small>${song.status??'EARLIER STUDY'} · ${song.genre??'Classical'} · ${song.year}</small><strong>${song.title}</strong><span>${song.composer}</span><em>${song.fit??'Available for comparison'}</em></button>`;
}

function render() {
  stop(false);
  const song=selectedSong(), treatment=selectedTreatment(), dna=selectedDna(), range=auditionRange();
  const seconds=(range.end-range.start)*60/song.tempo;
  app.innerHTML=`<main>
    <header class="site-header"><div><p class="eyebrow">MELODIC-DNA DECISION LAB · PROTOTYPE</p><h1>underscore identity studio</h1></div><div class="header-actions"><a href="../soundscape-prototype/index.html">soundtrack studies</a><a href="../sound-synth/index.html">signal lab</a></div></header>

    <section class="brief"><div><p class="eyebrow">THE DECISION</p><h2>Choose an identity, not a genre.</h2></div><p>European classical music is no longer the assumption. This wider set tests early jazz, Nordic and English folk, historical Japanese songs, and classical material using the same six treatments and the same voiceover-safe rules.</p><div class="arc"><span><b>01</b> hint</span><i></i><span><b>02</b> recur</span><i></i><span><b>03</b> transform</span><i></i><span><b>04</b> resolve</span></div></section>

    <section class="picker"><div class="section-title"><span>01</span><div><p class="eyebrow">SOURCE MATERIAL</p><h2>Which melody contains our DNA?</h2></div></div><div class="repertoire-filters">${repertoireFilters.map(filter=>`<button data-filter="${filter.id}" class="${filter.id===repertoireFilter?'selected':''}">${filter.label}</button>`).join('')}</div><div class="song-tabs">${visibleSongs().map(songCard).join('')}</div>
      <div class="song-info"><div><strong>${song.status??'EARLIER STUDY'}</strong><p>${song.description}</p></div><aside><span>${song.key}</span><span>${song.meter}</span><span>${song.tempo} bpm</span><a href="${song.source}" target="_blank" rel="noreferrer">source ↗</a></aside></div>
    </section>

    <section class="picker"><div class="section-title"><span>02</span><div><p class="eyebrow">RECURRING IDENTITY</p><h2>Hear the fragment we would actually reuse</h2></div></div><div class="dna-grid">${dnaOptions(song).map(item=>`<button data-dna="${item.id}" class="dna-card ${item.id===dna.id?'selected':''}">${contour(item)}<small>${item.occurrences.length} authored return${item.occurrences.length===1?'':'s'}</small><strong>${item.label}</strong><span>${item.description}</span><footer>${item.occurrences.map(o=>`<b>${o.label}</b>`).join('')}</footer></button>`).join('')}<article class="decision-note"><small>WHAT THIS TESTS</small><strong>${song.fit??'Does the opening remain useful when reduced?'}</strong><p>${song.risk??'Listen for whether the line supports the product or demands attention for itself.'}</p></article></div></section>

    <section class="picker"><div class="section-title"><span>03</span><div><p class="eyebrow">SAME NOTES · DIFFERENT WORLDS</p><h2>Which sound belongs to Laminar?</h2></div></div><div class="treatment-tabs">${treatments.map(item=>`<button data-treatment="${item.id}" class="${item.id===treatment.id?'selected':''}" style="--a:${item.palette[0]};--b:${item.palette[1]};--c:${item.palette[2]}"><i></i><small>${item.direction}</small><strong>${item.title}</strong><span>${item.description}</span><em>select + audition DNA →</em></button>`).join('')}</div></section>

    <section class="studio"><div class="studio-head"><div><p class="eyebrow">AUDITION</p><h2>${song.title} <span>/ ${treatment.title}</span></h2></div><div class="transport-buttons"><button data-rewind title="Return to audition start">↤</button><button class="play" data-play>▶ play ${modes.find(m=>m.id===auditionMode).label.toLowerCase()} <kbd>space</kbd></button><button data-loop class="${loop?'active':''}">↻ loop</button></div></div>
      <div class="audition-modes">${modes.map(mode=>`<button data-mode="${mode.id}" class="${mode.id===auditionMode?'selected':''}"><strong>${mode.label}</strong><span>${mode.note}</span></button>`).join('')}</div>
      <div class="now-explaining"><span><b>DNA</b>${dna.label}</span><span><b>TREATMENT</b>${treatment.title}</span><span><b>MODE</b>${modes.find(m=>m.id===auditionMode).label}</span></div>
      <div class="transport"><span data-time>0:00</span><button class="scrub" data-scrub aria-label="Audition timeline"><span data-progress></span><i data-playhead></i></button><span>${fmt(seconds)}</span></div>
      <div class="piano-roll" data-roll>${pianoRoll(song)}</div>
      <div class="listening-guide"><article><small>LISTEN FOR</small><strong>Can you remember the shape after one hearing?</strong><p>If not, the source is weak DNA regardless of how beautiful the full piece is.</p></article><article><small>VOICEOVER TEST</small><strong>Does it leave room for language?</strong><p>“Under voiceover” intentionally removes most melody and treats recurrence as punctuation.</p></article><article><small>ENDING TEST</small><strong>Does the return feel earned?</strong><p>The final cue should complete the identity on the Laminar logo—not merely fade out.</p></article></div>
    </section>
  </main>`;
  bind(); updateTransport();
}

function bind() {
  document.querySelectorAll('[data-filter]').forEach(button=>button.onclick=()=>{repertoireFilter=button.dataset.filter;const next=visibleSongs();if(!next.some(song=>song.id===selectedSongId)){selectedSongId=next[0].id;selectedDnaId=undefined}playheadBeat=auditionRange().start;render()});
  document.querySelectorAll('[data-song]').forEach(button=>button.onclick=()=>{selectedSongId=button.dataset.song;selectedDnaId=undefined;playheadBeat=auditionRange().start;render()});
  document.querySelectorAll('[data-dna]').forEach(button=>button.onclick=()=>{selectedDnaId=button.dataset.dna;playheadBeat=auditionRange().start;render()});
  document.querySelectorAll('[data-treatment]').forEach(button=>button.onclick=()=>{selectedTreatmentId=button.dataset.treatment;auditionMode='dna';playheadBeat=auditionRange().start;render();toggle()});
  document.querySelectorAll('[data-mode]').forEach(button=>button.onclick=()=>{auditionMode=button.dataset.mode;playheadBeat=auditionRange().start;render()});
  document.querySelector('[data-play]').onclick=toggle;
  document.querySelector('[data-rewind]').onclick=()=>{stop();playheadBeat=auditionRange().start;updateTransport()};
  document.querySelector('[data-loop]').onclick=event=>{loop=!loop;event.currentTarget.classList.toggle('active',loop)};
  document.querySelector('[data-scrub]').onclick=seekFromPointer;
  document.querySelector('[data-roll]').onclick=seekFromPointer;
  document.querySelectorAll('[data-note-beat]').forEach(button=>button.onclick=event=>{event.stopPropagation();seek(Number(button.dataset.noteBeat))});
}

function toggle() {
  if(window.SongStudioEngine.state())return stop();
  const range=auditionRange(); if(playheadBeat<range.start||playheadBeat>=range.end-.02)playheadBeat=range.start;
  window.SongStudioEngine.play(selectedSong(),selectedTreatmentId,auditionMode,selectedDna(),playheadBeat);
  document.querySelector('[data-play]').innerHTML='■ stop audition <kbd>space</kbd>'; update();
}
function stop(reset=true){const state=window.SongStudioEngine.state();if(state)playheadBeat=state.beat;window.SongStudioEngine.stop();cancelAnimationFrame(frameId);if(reset){const b=document.querySelector('[data-play]');if(b)b.innerHTML=`▶ play ${modes.find(m=>m.id===auditionMode).label.toLowerCase()} <kbd>space</kbd>`}}
function update(){const state=window.SongStudioEngine.state();if(!state)return;playheadBeat=state.beat;if(state.ended){if(loop){playheadBeat=state.start;window.SongStudioEngine.play(selectedSong(),selectedTreatmentId,auditionMode,selectedDna(),playheadBeat)}else{stop();playheadBeat=state.end;updateTransport();return}}updateTransport();frameId=requestAnimationFrame(update)}
function updateTransport(){const range=auditionRange(),relative=Math.max(0,playheadBeat-range.start),percent=Math.min(100,relative/(range.end-range.start)*100);const fullPercent=Math.min(100,playheadBeat/totalBeats()*100);const progress=document.querySelector('[data-progress]'),head=document.querySelector('[data-playhead]'),roll=document.querySelector('[data-roll-playhead]'),time=document.querySelector('[data-time]');if(progress)progress.style.width=`${percent}%`;if(head)head.style.left=`${percent}%`;if(roll)roll.style.left=`${fullPercent}%`;if(time)time.textContent=fmt(relative*60/selectedSong().tempo);document.querySelectorAll('[data-note-beat]').forEach(note=>note.classList.toggle('active',Math.abs(Number(note.dataset.noteBeat)-playheadBeat)<.35))}
function seekFromPointer(event){const box=event.currentTarget.getBoundingClientRect(),range=event.currentTarget.matches('[data-roll]')?{start:0,end:totalBeats()}:auditionRange();seek(range.start+(event.clientX-box.left)/box.width*(range.end-range.start))}
function seek(beat){const wasPlaying=Boolean(window.SongStudioEngine.state());stop();const range=auditionRange();playheadBeat=Math.max(range.start,Math.min(range.end,beat));updateTransport();if(wasPlaying)toggle()}
window.addEventListener('keydown',event=>{if(event.code!=='Space'||event.repeat||['INPUT','SELECT','TEXTAREA','BUTTON'].includes(document.activeElement?.tagName))return;event.preventDefault();toggle()});
render();
