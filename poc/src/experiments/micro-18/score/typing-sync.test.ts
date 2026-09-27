import assert from 'node:assert/strict';
import test from 'node:test';
import {issuePostludeOffset, normalizeSettings, ULTIMATE_3_DEFAULTS, type Ultimate3Settings} from '../settings';
import {chapterSchedule, sampleUltimate3} from '../sample';
import {ultimate3TypingTickEvents, ultimate3TypingWindows} from '../typing-audio';
import {ultimate3ScoreCues} from './cues';
import {keyClick, Mix} from './voices';
import {renderThockKeystroke} from '../thock-typing';
import {arabesqueAcoustic} from './arabesque';

const defaults = ULTIMATE_3_DEFAULTS;
function check(settings: Ultimate3Settings) {
  const cues = ultimate3ScoreCues(settings), chapter = chapterSchedule(settings)[3];
  assert.ok(Math.abs(cues.issues.native - chapter.start - issuePostludeOffset(settings)) < 1e-8);
  assert.deepEqual(cues.issues.typingEvents, ultimate3TypingTickEvents(settings));
  assert.ok(cues.issues.typingEvents.length > 0);
  for (const event of cues.issues.typingEvents) {
    const visible = sampleUltimate3(event.time, settings).issues!;
    assert.ok(visible.postludeActive, `${event.time}: no invisible compatibility pose`);
    assert.ok(event.time < chapter.end);
    assert.ok(ultimate3TypingWindows(settings).some(w => event.time >= w.start && event.time < w.end));
  }
  assert.ok(cues.issues.pops.every(pop => sampleUltimate3(pop.at, settings).issues?.postludeActive));
  return cues;
}

test('score typing follows default source20, changed prelude, instant and spring entry', () => {
  const original = check(defaults);
  for (const transition of [{type: 'easing' as const, duration: 0, ease: [0, 0, 1, 1] as [number, number, number, number]},
    {type: 'spring' as const, stiffness: 140, damping: 22, mass: 1}]) {
    const settings = normalizeSettings({...defaults, issues: {...defaults.issues,
      leadIn: {at: .2, duration: transition.type === 'spring' ? 2 : 0, transition},
      preludeTiming: {...defaults.issues.preludeTiming, bashDescent: {...defaults.issues.preludeTiming.bashDescent, duration: 3.69}},
      timing: {...defaults.issues.timing, promptTyping: {at: 4.5, duration: .6}, issueTyping: {at: 4.5, duration: .6}},
    }});
    assert.notEqual(check(settings).issues.typingEvents[0].time, original.issues.typingEvents[0].time);
  }
});

test('overlap, send gating, instant typing and chapter trimming share the live event list', () => {
  const settings = normalizeSettings({...defaults, issues: {...defaults.issues,
    timing: {...defaults.issues.timing, promptTyping: {at: 4.4, duration: .7}, issueTyping: {at: 4.4, duration: .7},
      cliCommandTyping: {at: 1, duration: .3}, sqlQueryTyping: {at: 3, duration: 0}, sqlPredicateTyping: {at: 999, duration: 2}},
  }});
  const cues = check(settings);
  assert.equal(cues.issues.typing.length, 3, 'overlap merges; instant SQL contributes no window; late predicate extends the chapter');
  const events = cues.issues.typingEvents;
  assert.ok(events.slice(1).every((e, i) => e.time - events[i].time >= .115 - 1e-8));
});

test('blocked source20 emits no postlude foley, duck, typing, pops or cluster cues', () => {
  const settings = normalizeSettings({...defaults, issues: {...defaults.issues,
    preludeControls: {...defaults.issues.preludeControls, radialCircleRadius: 0}}});
  const cues = ultimate3ScoreCues(settings);
  assert.equal(cues.issues.postludeActive, false);
  for (const list of [cues.issues.pops, cues.issues.clusters, cues.issues.typing, cues.issues.typingEvents]) assert.deepEqual(list, []);
  const mix = new Mix(1, () => .5, [{midi: 72, data: new Float32Array(100)}]);
  const emissions: number[] = [], ducks: number[] = [];
  mix.emit = time => { emissions.push(time); };
  mix.duck = time => { ducks.push(time); };
  arabesqueAcoustic.ducks(mix, cues); arabesqueAcoustic.design(mix, cues);
  assert.ok(!ducks.includes(cues.issues.windowShut));
  assert.ok(emissions.every(time => time < cues.chapter.issues.start || time >= cues.chapter.conclusion.start));
  emissions.length = 0; arabesqueAcoustic.compose(mix, cues);
  const blockedNotes = [...emissions]; emissions.length = 0;
  arabesqueAcoustic.compose(mix, {...cues, issues: {...cues.issues, native: 1, clusters: [2], pops: [{at: 3, height: .5, pan: 0}]}});
  assert.deepEqual(emissions, blockedNotes, 'blocked postlude anchors cannot emit notes; beat-rounded conclusion music is independent');
});

test('score keyClick is shared PCM, stable identity, with a truly keyboard-free bed', () => {
  const mix = new Mix(48000, () => { throw new Error('keyboard must not consume music/whoosh RNG'); }, []);
  const expected = renderThockKeystroke(7);
  keyClick(mix, 0, .375, {bus: 'sfx'}, 7);
  // Mix adds a final 2ms voice-edge fade; compare the unchanged body and release.
  assert.deepEqual(mix.sfx.l.slice(0, expected.left.length - 96), expected.left.slice(0, -96));
  const muted = new Mix(48000, () => .5, []); muted.typingEnabled = false;
  keyClick(muted, 0, 1, {bus: 'sfx', room: 1, hall: 1, delay: 1}, 7);
  assert.deepEqual(muted.counts, {});
  for (const bus of [muted.sfx, muted.room, muted.hall, muted.delay]) assert.ok(bus.l.every(x => x === 0));
});
