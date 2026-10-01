import assert from 'node:assert/strict';
import test from 'node:test';
import {normalizeSettings} from './settings';
import {VOICEOVER_DEFAULTS, normalizeVoiceoverSettings} from './voiceover-cut';
import {voiceoverBedUrl, VOICEOVER_PHRASES} from './voiceover-phrases';
import {mixVoiceoverPcm, phraseGain, voiceoverSchedule} from './voiceover-schedule';
import {voiceoverTimelineConfig, voiceoverTimelineValues, settingsFromVoiceoverTimeline} from './authoring';
import {VoiceoverEngine} from './voiceover-engine';
import {observeUltimate3TransportJump} from './transport-seeks';
import {TimelineStore} from 'dialkit';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const changed = (id: string, at: number, duration: number) => normalizeVoiceoverSettings({...VOICEOVER_DEFAULTS,
  voiceover: {...VOICEOVER_DEFAULTS.voiceover!, phrases: {...VOICEOVER_DEFAULTS.voiceover!.phrases, [id]: {at, duration}}}});

test('23 real timeline bars and first six in Ultimate 2 share phrase settings; import/reset, trim, overlaps and export end', () => {
  const full = voiceoverTimelineConfig(VOICEOVER_DEFAULTS).narration!;
  assert.equal(Object.keys(full).length, 23);
  assert.deepEqual(Object.keys(voiceoverTimelineConfig(VOICEOVER_DEFAULTS, true).narration!), VOICEOVER_PHRASES.slice(0, 6).map(p => p.id));
  assert.equal(Object.keys(voiceoverTimelineValues(VOICEOVER_DEFAULTS)).length, 115);
  const edited = changed('n02', .37, .5);
  assert.deepEqual(voiceoverSchedule(edited).slice(0, 2).map(p => p.at), [.37, .715]);
  assert.equal(voiceoverSchedule(edited).find(p => p.id === 'n02')?.duration, .5);
  const timeline = {narration: {...full, n02: {...full.n02, at: 3, duration: .1,
    transition: {type: 'easing', duration: .1, ease: [.1, 0, .9, 1]}, from: {progress: .3}}}};
  assert.deepEqual(settingsFromVoiceoverTimeline({narration: full}, VOICEOVER_DEFAULTS), VOICEOVER_DEFAULTS,
    'visual-only transition values never enter authored sound');
  const result = settingsFromVoiceoverTimeline(timeline, VOICEOVER_DEFAULTS);
  assert.equal(result.voiceover?.phrases.n02.at, 3);
  assert.equal(result.voiceover?.phrases.n02.duration, .1);
  assert.deepEqual(normalizeVoiceoverSettings(JSON.parse(JSON.stringify(result))), result);
  assert.equal(normalizeVoiceoverSettings({...VOICEOVER_DEFAULTS, voiceover: undefined}).voiceover?.phrases.n02.at, VOICEOVER_DEFAULTS.voiceover!.phrases.n02.at);
  const last = changed('n23', 2085 / 30, 2);
  assert.equal(last.voiceover!.phrases.n23.duration, 0);
  assert.equal(changed('n01', 1, 0).voiceover!.phrases.n01.duration, 0);
  assert.equal(changed('n01', 1, 100).voiceover!.phrases.n01.duration, VOICEOVER_PHRASES[0].b - VOICEOVER_PHRASES[0].a);
  assert.equal(normalizeSettings({}).voiceover, undefined, 'original cut never gains a voiceover section');
});

test('shared schedule/PCM uses true trims, overlaps, silence, fades and one linear master', () => {
  const bed = {l: new Float32Array(200000).fill(.2), r: new Float32Array(200000).fill(-.2)};
  const source = {l: new Float32Array(100000).fill(.3), r: new Float32Array(100000).fill(.1)};
  const settings = normalizeVoiceoverSettings({...VOICEOVER_DEFAULTS, voiceover: {version: 1, phrases: Object.fromEntries(
    VOICEOVER_PHRASES.map(p => [p.id, {at: 0, duration: p.id === 'n01' || p.id === 'n02' ? .5 : 0}]))}});
  const pcm = mixVoiceoverPcm(bed, {n01: source, n02: source}, settings, 1);
  const both = pcm.l[4800], one = mixVoiceoverPcm(bed, {n01: source}, settings, 1).l[4800];
  assert.ok(Math.abs((both - one) - .3 / 6.98) < 1e-7);
  assert.equal(phraseGain(0, .5), 0);
  assert.equal(phraseGain(.25, .5), 1);
  assert.equal(phraseGain(.5, .5), 0);
  const doubled = mixVoiceoverPcm(bed, {n01: source, n02: source}, settings, 2);
  assert.equal(doubled.l[4800], 2 * both);
  assert.equal(pcm.l.length, 2085 * 1600);
  assert.equal(mixVoiceoverPcm(bed, {n01: source, n02: source}, settings, 0).l[4800], 0);
});

test('prepared assets are exactly the immutable 23 sample-exact trims of the approved A/subtle take and the Issue Clusters 4 score', () => {
  const base = new URL('../../../public/audio/voiceover/editable-v11/', import.meta.url);
  const read = (file: string) => readFileSync(new URL(file, base));
  const manifest = JSON.parse(read('manifest.json').toString());
  assert.equal(manifest.phrases.length, 23);
  assert.equal(manifest.scoreStyle, 'arabesque-acoustic-chill');
  const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
  assert.equal(sha(read(manifest.bed.file)), manifest.bed.sha256);
  assert.equal(read(manifest.bed.file).readUInt32LE(24), 48000);
  assert.equal(manifest.samples, 2085 * 1600);
  assert.equal(`/audio/voiceover/editable-v11/${manifest.bed.file}`, voiceoverBedUrl('piano'));
  assert.equal(manifest.sourceRecordingSha256, sha(readFileSync(new URL('../voice_A_subtle.wav', base))));
  assert.equal(manifest.sourceRecordingSha256, 'af92601ff5a34753d0c637b023280a8374fdc35ff6f7fecca7bf720f51d40640');
  for (const entry of manifest.phrases) {
    const phrase = VOICEOVER_PHRASES.find(p => p.id === entry.id)!;
    assert.equal(entry.text, phrase.text);
    assert.equal(entry.samples, Math.round(phrase.b * 48000) - Math.round(phrase.a * 48000));
    assert.equal(sha(read(entry.file)), entry.sha256);
  }
});

test('DialKit seek observation is scoped, idempotent, reversible, and skips ordinary transport notifications', () => {
  const active = 'ultimate3-v4-seek-test', foreign = 'unrelated-timeline-seek-test';
  const meta = (id: string) => ({id, name: id, duration: 10, loop: false, loopStart: 0, clips: []});
  TimelineStore.register(meta(active), {autoplay: false}); TimelineStore.register(meta(foreign), {autoplay: false});
  const original = TimelineStore.seek;
  const events: number[] = [];
  const capture = (time: number) => {events.push(time);};
  try {
    const first = observeUltimate3TransportJump(active, time => events.push(time));
    const second = observeUltimate3TransportJump(active, time => events.push(-time));
    assert.notEqual(TimelineStore.seek, original);
    try {
      TimelineStore.seek(foreign, .1);
      assert.deepEqual(events, []);
      TimelineStore.seek(active, .02);
      assert.deepEqual(events, [.02, -.02]);
      TimelineStore.play(active);
      assert.deepEqual(events, [.02, -.02], 'ordinary play/ticks do not count as seeks');
      TimelineStore.seek(active, .025);
      assert.deepEqual(events, [.02, -.02, .025, -.025], 'seeks during playback are observed');
      TimelineStore.pause(active);
      assert.deepEqual(events, [.02, -.02, .025, -.025], 'pausing does not count as seeking');
      TimelineStore.seek(active, Number.NaN);
      assert.deepEqual(events, [.02, -.02, .025, -.025], 'an invalid seek is not a deliberate transport move');
      TimelineStore.seek(active, 100);
      assert.deepEqual(events, [.02, -.02, .025, -.025, 10, -10], 'seek reports the clamped playhead');
      first(); first();
      TimelineStore.seek(active, .03);
      assert.deepEqual(events, [.02, -.02, .025, -.025, 10, -10, -.03]);
    } finally {second();}
    assert.equal(TimelineStore.seek, original, 'last cleanup restores DialKit and remount is safe');
    const remounted = observeUltimate3TransportJump(active, capture);
    TimelineStore.seek(active, .04);
    remounted();
    assert.deepEqual(events, [.02, -.02, .025, -.025, 10, -10, -.03, .04]);
    assert.equal(TimelineStore.seek, original);
    TimelineStore.seek = function (this: typeof TimelineStore) {assert.equal(this, TimelineStore); return 7;};
    try {
      const bound = observeUltimate3TransportJump(active, capture);
      assert.equal(TimelineStore.seek(active, .07), 7);
      bound();
    } finally {TimelineStore.seek = original;}
    TimelineStore.seek = function () {throw new Error('original seek failed');};
    try {
      const noSuccess = observeUltimate3TransportJump(active, capture);
      assert.throws(() => TimelineStore.seek(active, .05), /original seek failed/);
      assert.equal(events.at(-1), .04, 'failed seeks do not notify');
      noSuccess();
    } finally {TimelineStore.seek = original;}
  } finally {TimelineStore.unregister(active); TimelineStore.unregister(foreign);}
});

test('Replay is an active-panel jump, not an ordinary transport tick; teardown restores both DialKit methods', () => {
  const active = 'ultimate3-v4-replay-test', foreign = 'foreign-replay-test';
  const meta = (id: string) => ({id, name: id, duration: 10, loop: false, loopStart: 0, clips: []});
  TimelineStore.register(meta(active), {autoplay: false}); TimelineStore.register(meta(foreign), {autoplay: false});
  const seek = TimelineStore.seek, replay = TimelineStore.replay;
  const events: number[] = [];
  const capture = (time: number) => {events.push(time);};
  try {
    TimelineStore.seek(active, .09);
    TimelineStore.play(active);
    const unsubscribe = observeUltimate3TransportJump(active, capture);
    try {
      TimelineStore.replay(foreign);
      assert.deepEqual(events, []);
      assert.equal(TimelineStore.getTransport(active).time, .09);
      assert.equal(TimelineStore.replay(active), undefined);
      assert.equal(TimelineStore.getTransport(active).time, 0);
      assert.equal(TimelineStore.getTransport(active).playing, true);
      assert.deepEqual(events, [0], 'Replay while already playing sends one jump');
      TimelineStore.pause(active);
      assert.deepEqual(events, [0]);
      TimelineStore.replay(active);
      assert.deepEqual(events, [0, 0], 'Replay from pause also sends a jump');
    } finally {unsubscribe();}
    assert.equal(TimelineStore.seek, seek);
    assert.equal(TimelineStore.replay, replay);
    TimelineStore.replay(active);
    assert.deepEqual(events, [0, 0], 'unmounted panel never receives Replay');
    TimelineStore.replay = function (this: typeof TimelineStore) {assert.equal(this, TimelineStore); throw new Error('replay failed');};
    try {
      const unsubscribeError = observeUltimate3TransportJump(active, capture);
      try {
        assert.throws(() => TimelineStore.replay(active), /replay failed/);
        assert.deepEqual(events, [0, 0], 'failed Replay never emits a jump');
      } finally {unsubscribeError();}
    } finally {TimelineStore.replay = replay;}
  } finally {
    TimelineStore.unregister(active); TimelineStore.unregister(foreign);
    assert.equal(TimelineStore.seek, seek); assert.equal(TimelineStore.replay, replay);
  }
});

test('live engine cancels stale nodes on seek/edit/pause; delayed decoding cannot revive paused inspection', async () => {
  class Gain {
    connections: unknown[] = [];
    gain = {value: 1, setValueAtTime(value: number) {this.value = value;}, linearRampToValueAtTime(value: number) {this.value = value;}};
    connect(target: unknown) {this.connections.push(target); return target;} disconnect() {}
  }
  class Source {
    buffer?: {duration: number}; stops = 0; starts: number[][] = [];
    connect(target: unknown) {return target;} disconnect() {}
    start(...args: number[]) {this.starts.push(args);} stop() {this.stops++;}
  }
  class Context {
    static latest: Context; currentTime = 0; state = 'running'; destination = {}; sources: Source[] = []; gains: Gain[] = []; closed = false;
    constructor() {Context.latest = this;}
    createGain() {const node = new Gain(); this.gains.push(node); return node;}
    createBufferSource() {const node = new Source(); this.sources.push(node); return node;}
    async resume() {} async close() {this.closed = true;}
    async decodeAudioData(data: ArrayBuffer) {return {duration: new Uint8Array(data)[0] === 255 ? 65.8 : 5};}
  }
  let release!: () => void;
  const wait = new Promise<void>(resolve => {release = resolve;});
  const original = {AudioContext: globalThis.AudioContext, fetch: globalThis.fetch};
  Object.assign(globalThis, {AudioContext: Context, fetch: async (url: string) => ({ok: true, arrayBuffer: async () => {
    await wait; return Uint8Array.of(url.endsWith('bed.wav') ? 255 : 1).buffer;
  }})});
  try {
    const engine = new VoiceoverEngine();
    engine.update(.5, true, VOICEOVER_DEFAULTS);
    const enabling = engine.enable();
    engine.pause(); release(); await enabling;
    assert.equal(Context.latest.sources.length, 0);
    for (const master of [0, 2, 6.98, 0]) {engine.setMasterVolume(master); assert.equal(Context.latest.gains[0].gain.value, master);}
    engine.update(.6, true, VOICEOVER_DEFAULTS);
    assert.ok(Context.latest.sources.length >= 2);
    assert.equal(Context.latest.gains[0].gain.value, 0);
    assert.deepEqual(Context.latest.gains[0].connections, [Context.latest.destination]);
    assert.ok(Context.latest.gains.slice(1).every(node => node.connections[0] === Context.latest.gains[0]), 'all voices share one master');
    let beforeSeek = [...Context.latest.sources];
    Context.latest.currentTime = .02;
    engine.update(.62, true, VOICEOVER_DEFAULTS, 0);
    assert.ok(beforeSeek.every(node => node.stops === 0), 'ordinary ticks keep the 120ms drift tolerance');
    engine.update(.72, true, VOICEOVER_DEFAULTS, 1);
    assert.ok(beforeSeek.every(node => node.stops === 1), '100ms forward seek reanchors');
    beforeSeek = Context.latest.sources.slice(beforeSeek.length);
    engine.update(.62, true, VOICEOVER_DEFAULTS, 2);
    assert.ok(beforeSeek.every(node => node.stops === 1), '100ms backward seek reanchors');
    engine.update(.64, false, VOICEOVER_DEFAULTS, 3);
    assert.ok(Context.latest.sources.every(node => node.stops === 1), 'paused seek is silent');
    engine.update(.64, true, VOICEOVER_DEFAULTS, 3);
    const originalNodes = [...Context.latest.sources];
    Context.latest.currentTime = 1;
    engine.update(5, true, VOICEOVER_DEFAULTS, 3);
    assert.ok(originalNodes.every(node => node.stops === 1));
    const newNodes = [...Context.latest.sources];
    engine.update(5, true, changed('n02', 4.5, 1), 3);
    assert.ok(newNodes.slice(originalNodes.length).every(node => node.stops === 1));
    assert.ok(Context.latest.sources.some(node => node.starts.some(([, offset]) => offset === .5)));
    engine.update(6, false, VOICEOVER_DEFAULTS);
    assert.ok(Context.latest.sources.every(node => node.stops === 1));
    engine.update(.09, true, VOICEOVER_DEFAULTS, 3);
    const beforeReplay = Context.latest.sources.slice(-2);
    const id = 'ultimate3-v4-audio-replay-test';
    TimelineStore.register({id, name: id, duration: 10, loop: false, loopStart: 0, clips: []}, {autoplay: false});
    TimelineStore.seek(id, .09);
    TimelineStore.play(id);
    let generation = 3;
    const unsubscribe = observeUltimate3TransportJump(id, time => engine.update(time, true, VOICEOVER_DEFAULTS, ++generation));
    try {
      const activeNodes = Context.latest.sources.slice(-2);
      Context.latest.currentTime += .001;
      engine.update(.091, true, VOICEOVER_DEFAULTS, generation);
      assert.ok(activeNodes.every(node => node.stops === 0), 'continuous 1ms tick does not restart audio');
      TimelineStore.replay(id);
      assert.equal(generation, 4);
      assert.ok(activeNodes.every(node => node.stops === 1), 'Replay at 90ms re-anchors despite 120ms tick tolerance');
      assert.ok(Context.latest.sources.slice(-2).some(node => node.starts.some(([, offset]) => offset === 0)));
    } finally {unsubscribe(); TimelineStore.unregister(id);}
    assert.ok(beforeReplay.every(node => node.stops === 1));
    engine.dispose(); assert.equal(Context.latest.closed, true);
  } finally {Object.assign(globalThis, original);}
});
