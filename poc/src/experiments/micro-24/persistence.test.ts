import assert from 'node:assert/strict';
import {test} from 'node:test';
import {migrateFlow3Timeline} from './persistence';
import {FLOW_3_TIMELINE_ID} from './timeline';
const target = `dialkit:${FLOW_3_TIMELINE_ID}`;
function storage() {
  const data = new Map<string, string>();
  return {getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => {data.set(key, value);}};
}
test('migrates retained v1 edits and named presets; keeps original bytes and drops removed bars', () => {
  const s = storage(), source = 'dialkit:micro-animation-24-timeline-v1';
  const values = {'beadsEntry.at': 3.2, 'cameraToEngine.at': 9, 'benchmarkHeading.from.progress': .2, 'graphSpread.at': 6};
  const raw = JSON.stringify({version: 1, values, baseValues: values, activePresetId: 'mine', presets: [{id: 'mine', name: 'My custom timing', values}]});
  s.setItem(source, raw);
  migrateFlow3Timeline(s);
  const out = JSON.parse(s.getItem(target)!);
  assert.equal(s.getItem(source), raw);
  assert.equal(out.values['beadsEntry.at'], 3.2);
  assert.ok(Math.abs(out.values['cameraToEngine.at'] - 10.41) < 1e-9);
  assert.equal(out.values['benchmarkHeading.from.progress'], .2);
  assert.equal(out.values['micro23GridShrink.at'], 5.77);
  assert.equal('graphSpread.at' in out.values, false);
  assert.equal(out.activePresetId, 'mine');
  assert.equal(out.presets[0].name, 'My custom timing');
  assert.deepEqual(out.presets[0].values, out.values);
  const once = s.getItem(target);
  migrateFlow3Timeline(s);
  assert.equal(s.getItem(target), once);
});
test('an auto-created v2 does not overwrite legacy custom values; new v2 edits take precedence', () => {
  const s = storage();
  s.setItem('dialkit:micro-animation-24-timeline-v1', JSON.stringify({version: 1, values: {'beadsEntry.at': 3.2}, presets: [{id: 'legacy', name: 'Keep', values: {'beadsEntry.at': 3.4}}]}));
  s.setItem('dialkit:micro-animation-24-timeline-v2', JSON.stringify({version: 1, values: {'beadsEntry.at': 2.88, 'micro23GridShrink.at': 5.57, 'micro23GptNumber.from.progress': .3}}));
  migrateFlow3Timeline(s);
  const out = JSON.parse(s.getItem(target)!);
  assert.equal(out.values['beadsEntry.at'], 3.2);
  assert.equal(out.values['micro23GridShrink.at'], 5.77);
  assert.equal(out.values['micro23GptNumber.from.progress'], .3);
  assert.equal(out.presets[0].values['beadsEntry.at'], 3.4);
});
test('existing v3, malformed and unavailable storage are safe', () => {
  const s = storage(); s.setItem(target, 'existing'); migrateFlow3Timeline(s); assert.equal(s.getItem(target), 'existing');
  const broken = storage(); broken.setItem('dialkit:micro-animation-24-timeline-v1', '{');
  assert.doesNotThrow(() => migrateFlow3Timeline(broken)); assert.equal(broken.getItem(target), null);
  assert.doesNotThrow(() => migrateFlow3Timeline({getItem: () => {throw Error('blocked');}, setItem: () => {}}));
});
