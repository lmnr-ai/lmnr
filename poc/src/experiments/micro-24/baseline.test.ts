import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {FLOW_3_TIMELINE, FLOW_3_TIMELINE_ID} from './timeline';
import {createFlow3Sampler, flow3DurationFrames} from './sample';

test('Animation 24 retains its opening/engine clips and owns an independent migrated timeline', () => {
  assert.equal(FLOW_3_TIMELINE_ID, 'micro-animation-24-timeline-v3');
  assert.equal(flow3DurationFrames(), 458);
  const sampler = createFlow3Sampler();
  assert.equal(sampler.sample(3.6).progress.benchmarkHeading, 1);
  assert.equal(sampler.sample(11.7).progress.engineSpinner, 1);
  const edited = createFlow3Sampler({...FLOW_3_TIMELINE, micro23BlueDots: {...FLOW_3_TIMELINE.micro23BlueDots, at: 10}});
  assert.equal(edited.sample(7.5).progress.micro23BlueDots, 0);
  assert.equal(sampler.sample(7.5).progress.micro23BlueDots > 0, true);
});

test('embedded Animation 23 tracks are native, reversible and leave a restored empty-grid bridge', () => {
  const sampler = createFlow3Sampler();
  const early = sampler.sample(6.3), late = sampler.sample(8.3), returned = sampler.sample(9.7);
  assert.equal(early.progress.micro23OrangeDots > 0, true);
  assert.equal(late.progress.micro23BlueDots > early.progress.micro23BlueDots, true);
  assert.equal(returned.progress.micro23ReturnToGrid, 1);
  assert.equal(returned.progress.cameraToEngine, 0);
});

test('new app owns its controls and retains the exact production note and native authoring bindings', () => {
  const app = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8');
  assert.match(app, /id: 'micro-animation-24-appearance-v1'/);
  assert.match(app, /current="micro-24"/);
  assert.match(app, /liveFlow3\(timeline\)/);
  assert.match(app, /<DialRoot\/>/);
  assert.match(app, /<DialTimeline visible=\{!inspecting\}\/>/);
  assert.ok(app.includes("// TODO(production): DialKit's clip.current values are the scrubbable authoring preview.\n  // Replace them with equivalent real Motion animations using the tuned timeline\n  // timings and transitions, then remove useDialTimeline and <DialTimeline />.\n  const timeline = useDialTimeline("));
});
