import assert from 'node:assert/strict';
import test from 'node:test';
import {normalizeSettings, ULTIMATE_3_DEFAULTS} from './settings';
import {chapterSchedule} from './sample';
import {ISSUE_TYPING_TICK, IssueTypingTickEngine, beepDistortionCurve, isTypingTransportDiscontinuity, typingFrameEvents, typingTickEventsBetween, ultimate3TypingTickEvents} from './typing-audio';

test('typing cadence is sparse, varied, deterministic, and confined to typing windows', () => {
  const settings = ULTIMATE_3_DEFAULTS;
  const events = ultimate3TypingTickEvents(settings);
  assert.ok(events.length > 0 && events.length < 20, 'normal typing rhythm rather than one tap per character');
  assert.deepEqual(events, ultimate3TypingTickEvents(settings));
  const chapter = chapterSchedule(settings)[3];
  const offset = chapter.start + settings.issues.leadIn.at + settings.issues.leadIn.duration;
  const t = settings.issues.timing;
  const sendEnd = t.messageSend.at + t.messageSend.duration;
  const clips = [t.promptTyping, t.issueTyping, ...[t.cliCommandTyping, t.sqlQueryTyping, t.sqlPredicateTyping].map(clip => ({...clip, at: Math.max(clip.at, sendEnd)}))];
  for (const event of events) assert.ok(clips.some(clip => event.time >= offset + clip.at && event.time < offset + clip.at + clip.duration));
  const gaps = events.slice(1).map((event, i) => event.time - events[i].time);
  assert.ok(gaps.every(gap => gap >= .115 - 1e-8), 'overlapping clips never double the cadence');
  assert.ok(new Set(gaps.map(gap => gap.toFixed(3))).size > 2, 'light rhythmic variation');
});

test('cadence follows ripple/send gating, merges overlap, skips instant clips and trims', () => {
  const custom = normalizeSettings({...ULTIMATE_3_DEFAULTS,
    allocations: {...ULTIMATE_3_DEFAULTS.allocations, ultimate2: 20, cost: 16},
    issues: {...ULTIMATE_3_DEFAULTS.issues, timing: {...ULTIMATE_3_DEFAULTS.issues.timing,
      messageSend: {at: 5, duration: 1}, cliCommandTyping: {at: 1, duration: .3},
      promptTyping: {at: 4, duration: .8}, issueTyping: {at: 4, duration: .8},
      sqlQueryTyping: {at: 2, duration: 0}, sqlPredicateTyping: {at: 3, duration: 0},
    }},
  });
  const events = ultimate3TypingTickEvents(custom);
  const segment = chapterSchedule(custom)[3];
  const offset = segment.start + custom.issues.leadIn.at + custom.issues.leadIn.duration;
  assert.ok(Math.abs(events[0].time - (offset + 4.02)) < 1e-8);
  assert.ok(events.every(event => (event.time >= offset + 4 && event.time < offset + 4.8) || (event.time >= offset + 6 && event.time < offset + 6.3)));
  const noOverlap = {...custom, issues: {...custom.issues, timing: {...custom.issues.timing,
    issueTyping: {...custom.issues.timing.issueTyping, duration: 0},
  }}};
  assert.deepEqual(events, ultimate3TypingTickEvents(noOverlap), 'overlapping clips share a single cadence');
  assert.ok(events.every(event => event.time < segment.end));
  assert.deepEqual(typingTickEventsBetween(8, 8, events), []);
  assert.equal(isTypingTransportDiscontinuity(8, 7), true);
  assert.equal(isTypingTransportDiscontinuity(7, 7.5), true);
  assert.equal(isTypingTransportDiscontinuity(7, 7.02), false);
});

test('frame scheduling skips overdue ticks after stalls and short forward jumps', () => {
  const events = Array.from({length: 60}, (_, character) => ({track: 'prompt' as const, character, time: 4 + character / 100}));
  const first = typingFrameEvents(4.30, 4.30, events);
  assert.ok(first.length > 0);
  assert.ok(first.every(event => event.time > 4.30 && event.time <= 4.38));
  const stalled = typingFrameEvents(4.38, 4.50, events);
  assert.ok(stalled.length > 0);
  assert.ok(stalled.every(event => event.time > 4.50), '200ms stall never schedules negative-delay ticks');
  const shortJump = typingFrameEvents(4.38, 4.40, events);
  assert.ok(shortJump.every(event => event.time > 4.40), 'short forward jumps never replay overdue characters');
  const nextFrame = typingFrameEvents(4.38, 4.33, events);
  assert.ok(nextFrame.every(event => event.time > 4.38), 'ordinary frames never duplicate the prior lookahead');
  const resumed = typingFrameEvents(4.50, 4.50, events);
  assert.deepEqual(resumed, stalled, 'resume/unlock uses the current playhead without backlog');
});

test('tick preset and graph constants match Signal Lab playBeep', async () => {
  assert.deepEqual(ISSUE_TYPING_TICK, {schema:'signal-lab/v1',type:'beep',name:'tick',parameters:{wave:'sine',startFreq:3557,noise:0,click:1,body:0,endFreq:3708,duration:.04,attack:.009,bodyPitch:230,bodyDecay:.16,filter:1937,resonance:1,distortion:0,pan:0,delay:0,feedback:0}});
  const curve = beepDistortionCurve(0);
  assert.equal(curve.length, 256); assert.equal(curve[0], -1); assert.equal(curve[128], 0);

  class Param { value = 0; calls: unknown[][] = []; setValueAtTime(...args: unknown[]) { this.calls.push(['set',...args]); } exponentialRampToValueAtTime(...args: unknown[]) { this.calls.push(['exp',...args]); } }
  class Node { connections: Node[] = []; gain = new Param(); frequency = new Param(); Q = new Param(); pan = new Param(); delayTime = new Param(); type = ''; curve?: Float32Array; oversample = ''; connect(node: Node) { this.connections.push(node); return node; } disconnect() {} }
  class Source extends Node { starts: number[] = []; stops: number[] = []; listeners: (() => void)[] = []; buffer?: unknown; start(at = 0) { this.starts.push(at); } stop(at = 0) { this.stops.push(at); } addEventListener(_name: string, fn: () => void) { this.listeners.push(fn); } }
  class FakeContext {
    currentTime = 2; state = 'running'; sampleRate = 100; destination = new Node(); nodes: Node[] = []; sources: Source[] = [];
    createGain() { const n = new Node(); this.nodes.push(n); return n; }
    createOscillator() { const n = new Source(); this.sources.push(n); return n; }
    createBufferSource() { const n = new Source(); this.sources.push(n); return n; }
    createBiquadFilter() { const n = new Node(); this.nodes.push(n); return n; }
    createWaveShaper() { const n = new Node(); this.nodes.push(n); return n; }
    createStereoPanner() { const n = new Node(); this.nodes.push(n); return n; }
    createDelay() { const n = new Node(); this.nodes.push(n); return n; }
    createBuffer(_channels: number, length: number) { return {getChannelData: () => new Float32Array(length)}; }
    async resume() {} async close() {}
  }
  const Original = globalThis.AudioContext; const context = new FakeContext();
  (globalThis as any).AudioContext = class { constructor() { return context; } };
  try {
    const engine = new IssueTypingTickEngine(); engine.setMasterVolume(2); engine.setTypingVolume(3); await engine.enable(); engine.playAt(.05);
    assert.equal(context.sources.length, 4, 'tone, body, pink click, and zero-gain white noise sources are retained');
    assert.ok(context.sources.every(source => source.starts[0] >= 2.05), 'voice is subframe scheduled');
    const values = context.nodes.map(node => node.gain.value);
    const scheduledGains = context.nodes.flatMap(node => node.gain.calls).map(call => call[1]);
    assert.ok(values.includes(.55) && values.includes(.7) && scheduledGains.includes(.45) && values.includes(3) && values.includes(2));
    assert.ok(context.nodes.some(node => node.type === 'lowpass' && node.frequency.value === 1937 && node.Q.value === 1));
    assert.ok(context.nodes.some(node => node.type === 'bandpass' && node.frequency.value === 1800 && node.Q.value === .8));
    engine.setTypingVolume(0); assert.ok(context.nodes.some(node => node.gain.value === 0), 'zero applies to active tail');
    engine.setTypingVolume(4); engine.setMasterVolume(5);
    assert.ok(context.nodes.some(node => node.gain.value === 4), 'typing volume is not clamped above one');
    assert.equal(context.nodes[0].gain.value, 5, 'master is one independent output gain and is not clamped');
    engine.pause(); assert.ok(context.sources.every(source => source.stops.length >= 2), 'pause cancels scheduled and active sources');
    engine.dispose();
  } finally { (globalThis as any).AudioContext = Original; }
});
