import assert from 'node:assert/strict';
import test from 'node:test';
import {normalizeSettings, ULTIMATE_3_DEFAULTS, issuePostludeOffset} from './settings';
import {chapterSchedule} from './sample';
import {IssueTypingTickEngine, isTypingTransportDiscontinuity, typingFrameEvents, typingTickEventsBetween, ultimate3TypingTickEvents} from './typing-audio';
import {renderThockKeystroke, THOCK_SAMPLE_RATE} from './thock-typing';

test('typing cadence is sparse, varied, deterministic, and confined to typing windows', () => {
  const settings = ULTIMATE_3_DEFAULTS;
  const events = ultimate3TypingTickEvents(settings);
  assert.ok(events.length > 0 && events.length < 20, 'normal typing rhythm rather than one tap per character');
  assert.deepEqual(events, ultimate3TypingTickEvents(settings));
  const chapter = chapterSchedule(settings)[3];
  const offset = chapter.start + issuePostludeOffset(settings);
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
  const offset = segment.start + issuePostludeOffset(custom);
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

test('thock uses shared stereo PCM, one master, live tail controls, and cancellable voices', async () => {
  class Node {
    connections: Node[] = []; gain = {value: 0}; disconnected = false;
    connect(node: Node) { this.connections.push(node); return node; }
    disconnect() { this.disconnected = true; }
  }
  class Source extends Node {
    starts: number[] = []; stops: number[] = []; listeners: (() => void)[] = [];
    buffer?: {sampleRate: number; getChannelData: (channel: number) => Float32Array};
    start(at = 0) { this.starts.push(at); } stop(at = 0) { this.stops.push(at); }
    addEventListener(_name: string, fn: () => void) { this.listeners.push(fn); }
  }
  class FakeContext {
    currentTime = 2; sampleRate = 44100; destination = new Node(); nodes: Node[] = []; sources: Source[] = []; closed = false;
    createGain() { const n = new Node(); this.nodes.push(n); return n; }
    createBufferSource() { const n = new Source(); this.sources.push(n); return n; }
    createBuffer(channels: number, length: number, sampleRate: number) {
      const data = Array.from({length: channels}, () => new Float32Array(length));
      return {sampleRate, getChannelData: (channel: number) => data[channel]};
    }
    async resume() {} async close() { this.closed = true; }
  }
  const context = new FakeContext();
  const engine = new IssueTypingTickEngine({context: context as unknown as AudioContext});
  engine.setMasterVolume(2); engine.setTypingVolume(3); await engine.enable(); engine.playAt(.05, 3);
  assert.equal(context.sources.length, 1, 'one thock buffer, no leftover beep or duplicated typing source');
  const first = context.sources[0], expected = renderThockKeystroke(3);
  assert.equal(first.starts[0], 2.05);
  assert.equal(first.buffer!.sampleRate, THOCK_SAMPLE_RATE, '48kHz PCM even on a 44.1kHz context');
  assert.deepEqual(first.buffer!.getChannelData(0), expected.left);
  assert.deepEqual(first.buffer!.getChannelData(1), expected.right);
  assert.deepEqual(first.connections, [context.nodes[1]]);
  assert.deepEqual(context.nodes[1].connections, [context.nodes[0]]);
  assert.deepEqual(context.nodes[0].connections, [context.destination]);
  assert.deepEqual(context.nodes.map(node => node.gain.value), [2, 3]);
  engine.setTypingVolume(0); assert.equal(context.nodes[1].gain.value, 0, 'zero silences the active release tail');
  engine.setTypingVolume(4); engine.setMasterVolume(0);
  assert.equal(context.nodes[1].gain.value, 4); assert.equal(context.nodes[0].gain.value, 0);
  engine.setMasterVolume(5); assert.equal(context.nodes[0].gain.value, 5, 'above-unity master applied once');
  engine.scheduleAt(12, 3);
  assert.equal(context.sources[1].buffer, first.buffer, 'absolute scheduling and resumed live playback share cached PCM');
  engine.pause(); assert.ok(context.sources.every(source => source.stops.length === 1 && source.disconnected));
  engine.scheduleAt(20, 4);
  const last = context.sources[2]; last.listeners.forEach(listener => listener());
  assert.equal(last.disconnected, true, 'natural endings release the graph');
  engine.dispose(); assert.equal(context.closed, false, 'never close a borrowed shared/offline context');
});
