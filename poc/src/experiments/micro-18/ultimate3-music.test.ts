import assert from 'node:assert/strict';
import test from 'node:test';
import {ULTIMATE_3_DEFAULTS, normalizeSettings} from './settings';
import {chapterSchedule} from './sample';
import {SANGERS_MORGENLIED_MELODY, Ultimate3MusicEngine, ultimate3SangersMusicPlan} from './ultimate3-music';

test('Sängers Morgenlied keeps the sourced 42-beat melody', () => {
  assert.equal(SANGERS_MORGENLIED_MELODY.reduce((sum, note) => sum + note.beats, 0), 42);
  assert.deepEqual(SANGERS_MORGENLIED_MELODY.slice(0, 4), [
    {pitch:79, beats:1}, {pitch:74, beats:.5}, {pitch:71, beats:1}, {pitch:67, beats:.5},
  ]);
});

test('adaptive arrangement resolves exactly when the Laminar logo appears', () => {
  const plan = ultimate3SangersMusicPlan(ULTIMATE_3_DEFAULTS);
  assert.equal(plan.logoAt, Number((chapterSchedule(ULTIMATE_3_DEFAULTS)[4].start + 2).toFixed(9)));
  assert.equal(plan.finalNoteAt, plan.logoAt);
  assert.ok(plan.events.some(event => event.voice === 'finale' && event.notes.length === 1 && event.notes[0] === 67 && event.at === plan.logoAt));
  const schedule = chapterSchedule(ULTIMATE_3_DEFAULTS);
  assert.ok(plan.events.some(event => event.voice === 'motion' && event.at >= schedule[1].start && event.at < schedule[3].start));
  assert.ok(plan.events.every(event => Number.isFinite(event.at) && event.duration > 0));
});

test('retiming the composition keeps the final G attached to the editable logo cut', () => {
  const settings = normalizeSettings({...ULTIMATE_3_DEFAULTS, conclusion: {placeholder: {at:0,duration:3}, logo:{at:2,duration:2}}});
  const plan = ultimate3SangersMusicPlan(settings);
  const logoAt = Number((chapterSchedule(settings)[4].start + 3).toFixed(9));
  assert.equal(plan.logoAt, logoAt);
  assert.equal(plan.finalNoteAt, logoAt);
  assert.equal(plan.events.find(event => event.voice === 'finale' && event.notes.length === 1)?.at, logoAt);
});

test('music master gain supports zero, unity, and amplification above media-element limits', async () => {
  class Param { value=0; setValueAtTime(value:number){this.value=value;} setTargetAtTime(value:number){this.value=value;} }
  class Node { connections:Node[]=[]; connect(node:Node){this.connections.push(node);return node;} }
  class Gain extends Node {gain=new Param();}
  class Compressor extends Node {threshold=new Param();ratio=new Param();}
  class Context {currentTime=0;destination=new Node();state='running';gains:Gain[]=[];createGain(){const gain=new Gain();this.gains.push(gain);return gain;}createDynamicsCompressor(){return new Compressor();}async resume(){}}
  const contexts:Context[]=[];
  (globalThis as {AudioContext?:unknown}).AudioContext=class extends Context {constructor(){super();contexts.push(this);}};
  const engine=new Ultimate3MusicEngine();
  await engine.enable();
  const output=contexts[0].gains[0];
  assert.equal(output.gain.value,.18,'standalone music level is unchanged');
  engine.setMasterGain(0); assert.equal(output.gain.value,0);
  engine.setMasterGain(1); assert.equal(output.gain.value,.18);
  engine.setMasterGain(10); assert.ok(Math.abs(output.gain.value-1.8)<1e-9,'music exceeds HTMLMediaElement.volume\'s 1 ceiling through Web Audio gain');
  engine.pause();
});
