import assert from 'node:assert/strict';
import test from 'node:test';
import {DialStore, type DialValue} from 'dialkit';
import {computeClipState, computeStaticTimeline, parseTimelineConfig} from 'dialkit/timeline';
import {MICRO_20_TIMELINE, MICRO_20_TIMELINE_ID, serializeTimeline} from './timeline';
import {installMicro20AuthoringCompatibility} from './authoring';
import {readMicro20Values} from './persistence';

const id = MICRO_20_TIMELINE_ID, key = `dialkit:${id}`;
const path = 'issues.subtitleIssues.transition', modePath = `${path}.__mode`;
const config = (duration = 14.5) => parseTimelineConfig({...MICRO_20_TIMELINE, duration}).dialConfig;
const freshStore = () => new (DialStore.constructor as new () => typeof DialStore)();
const options = {persist: true, retainOnUnmount: true, kind: 'timeline' as const};
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
function defaults(normalized = true) {
  const store = freshStore();
  store.registerPanel(id, 'Test', config());
  if (normalized) store.updatePanel(id, 'Test', config());
  return clone(store.getValues(id));
}
function authoredFromFlat(flat: ReturnType<typeof DialStore.getValues>) {
  const raw: Record<string, unknown> = {issues: {}};
  for (const clip of computeStaticTimeline(parseTimelineConfig(MICRO_20_TIMELINE), flat).clips) {
    const value = computeClipState(clip, 0, 0);
    if (clip.group) (raw[clip.group] as Record<string, unknown>)[clip.childKey!] = value;
    else raw[clip.key] = value;
  }
  return serializeTimeline(raw, flat);
}
function fixture(active: 'spring' | 'easing') {
  const canonical = defaults();
  const spring = {...canonical, [path]: {type: 'spring', bounce: .6, visualDuration: 1.7}, [modePath]: 'simple', 'issues.subtitleIssues.from.progress': .27};
  const easing = {...canonical, [path]: {type: 'easing', duration: .94, ease: [.1, -.1, .8, 1.2]}, [modePath]: 'easing', 'issues.subtitleIssues.from.progress': .37};
  const base = {...canonical, [path]: active === 'easing' ? {type: 'spring', stiffness: 120, damping: 12, mass: 1} : easing[path],
    [modePath]: active === 'easing' ? 'advanced' : 'easing', 'issues.subtitleIssues.from.progress': .17};
  return {version: 1, values: active === 'spring' ? spring : easing, baseValues: base, activePresetId: active,
    presets: [{id: 'spring', name: 'Spring', values: spring}, {id: 'easing', name: 'Easing', values: easing}]};
}
function withStorage(saved: ReturnType<typeof fixture>, run: (storage: Storage, writes: ReturnType<typeof fixture>[]) => void) {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const data = new Map([[key, JSON.stringify(saved)], ['unrelated-animation', 'untouched']]);
  const writes: ReturnType<typeof fixture>[] = [];
  const storage = {getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {data.set(key, value); if (key === `dialkit:${id}`) writes.push(JSON.parse(value));}} as Storage;
  Object.defineProperty(globalThis, 'window', {configurable: true, value: {localStorage: storage}});
  try {run(storage, writes); assert.equal(data.get('unrelated-animation'), 'untouched');}
  finally {if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow); else Reflect.deleteProperty(globalThis, 'window');}
}
for (const active of ['spring', 'easing'] as const) test(`R01 real-store ${active} current, opposite-kind inactive preset and distinct base survive registration, duration, reload and Reset`, () => {
  const saved = fixture(active), original = JSON.stringify(saved), canonical = JSON.stringify(MICRO_20_TIMELINE);
  withStorage(saved, (storage, writes) => {
    let store = freshStore(); installMicro20AuthoringCompatibility(store);
    store.registerPanel(id, 'Test', config(), undefined, options);
    assert.deepEqual(store.getPresets(id), saved.presets);
    assert.deepEqual(store.getValues(id), saved.values);
    assert.deepEqual(writes.at(-1)!.baseValues, saved.baseValues);
    store.updatePanel(id, 'Test', config(25), undefined, options);
    // Every write, not just a repaired final record, preserves all three states.
    for (const write of writes) {
      assert.deepEqual(write.presets, saved.presets);
      assert.deepEqual(write.baseValues, saved.baseValues);
      assert.deepEqual(write.values, saved.values);
    }
    store.unregisterPanel(id);
    store = freshStore(); installMicro20AuthoringCompatibility(store);
    store.registerPanel(id, 'Test', config(25), undefined, options);
    assert.deepEqual(store.getPresets(id), saved.presets);
    assert.deepEqual(store.getValues(id), saved.values);
    for (const preset of saved.presets) {
      store.loadPreset(id, preset.id);
      store.updatePanel(id, 'Test', config(28), undefined, options);
      assert.deepEqual(store.getValues(id), preset.values);
      assert.deepEqual(writes.at(-1)!.baseValues, saved.baseValues);
    }
    store.clearActivePreset(id);
    assert.deepEqual(store.getValues(id), saved.baseValues);
    store.updatePanel(id, 'Test', config(30), undefined, options);
    assert.deepEqual(store.getPresets(id), saved.presets);
    assert.deepEqual(writes.at(-1)!.baseValues, saved.baseValues);
    // StrictMode-like repeated registration and retained unmount/remount.
    installMicro20AuthoringCompatibility(store);
    store.unregisterPanel(id); store.registerPanel(id, 'Test', config(30), undefined, options);
    store.registerPanel(id, 'Test', config(30), undefined, options); store.unregisterPanel(id);
    assert.deepEqual(store.getPresets(id), saved.presets);
    assert.deepEqual(store.getValues(id), saved.baseValues);
    const savedBeforeReset = clone(store.getPresets(id));
    store.resetValues(id);
    assert.deepEqual(store.getValues(id), defaults(false));
    assert.deepEqual(store.getPresets(id), savedBeforeReset);
    assert.equal(store.getActivePresetId(id), null);
    assert.deepEqual(JSON.parse(storage.getItem(key)!).baseValues, defaults(false));
    assert.equal(JSON.stringify(saved), original, 'source fixture/preset objects must never be mutated');
    assert.equal(JSON.stringify(MICRO_20_TIMELINE), canonical, 'authored defaults must remain immutable');
  });
});
test('R01 base edits, inactive saved presets, native mode edits and canonical Reset stay independent', () => {
  const store = freshStore(); installMicro20AuthoringCompatibility(store);
  store.registerPanel(id, 'Test', config());
  store.updatePanel(id, 'Test', config());
  const springId = store.savePreset(id, 'Spring');
  const original = clone(store.getPresets(id));
  store.clearActivePreset(id);
  const easing: DialValue = {type: 'easing', duration: .94, ease: [0, 0, 1, 1]};
  store.updateTransitionMode(id, path, 'easing'); store.updateValue(id, path, easing);
  store.updatePanel(id, 'Test', config(25));
  assert.deepEqual(store.getPresets(id), original);
  assert.equal(authoredFromFlat(store.getValues(id)).issueTiming.subtitleIssues.transition?.type, 'easing');
  const easingId = store.savePreset(id, 'Easing');
  store.loadPreset(id, springId); store.updateTransitionMode(id, path, 'advanced');
  store.updateValue(id, path, {type: 'spring', stiffness: 90, damping: 8});
  store.updatePanel(id, 'Test', config(27));
  assert.equal(store.getPresets(id)[0].values[modePath], 'advanced');
  assert.deepEqual(store.getPresets(id).find(p => p.id === easingId)!.values[path], easing);
  store.clearActivePreset(id);
  assert.deepEqual(store.getValues(id)[path], easing); assert.equal(store.getValues(id)[modePath], 'easing');
  store.resetValues(id);
  assert.deepEqual(store.getValues(id), defaults(false));
});
test('compatibility guard is reentrant, isolates foreign panels and restores private methods on thrown subscribers', () => {
  const store = freshStore();
  const runtime = store as unknown as {reconcileValues: unknown; persistPanel: unknown};
  const reconcile = runtime.reconcileValues, persist = runtime.persistPanel;
  installMicro20AuthoringCompatibility(store);
  const foreign = 'other-animation'; const foreignConfig = {curve: {type: 'spring' as const, bounce: .2}};
  store.registerPanel(foreign, 'Foreign', foreignConfig);
  store.updateValue(foreign, 'curve', {type: 'easing', duration: 1, ease: [0, 0, 1, 1]});
  let nested = false, nestedOwned = false;
  const offForeign = store.subscribe(foreign, () => {
    if (!nestedOwned) {nestedOwned = true; store.updatePanel(id, 'Test', config(26));}
  });
  const off = store.subscribe(id, () => {
    if (!nested) {nested = true; store.updatePanel(foreign, 'Foreign', foreignConfig);}
  });
  store.registerPanel(id, 'Test', config());
  assert.equal((store.getValues(foreign).curve as {type: string}).type, 'spring', 'foreign panel retains native kind reconciliation');
  assert.ok(nestedOwned); assert.equal(runtime.reconcileValues, reconcile); assert.equal(runtime.persistPanel, persist);
  off(); offForeign();
  const stopThrowing = store.subscribe(id, () => {throw new Error('subscriber failed');});
  assert.throws(() => store.updatePanel(id, 'Test', config(28)), /subscriber failed/);
  assert.equal(runtime.reconcileValues, reconcile); assert.equal(runtime.persistPanel, persist);
  stopThrowing(); store.updatePanel(id, 'Test', config(30));
  installMicro20AuthoringCompatibility(store);
});
test('version/shape guard fails before registration or writes; invalid transitions use native reconciliation', () => {
  withStorage(fixture('easing'), (storage, writes) => {
    const original = storage.getItem(key), store = freshStore(), register = store.registerPanel;
    assert.throws(() => installMicro20AuthoringCompatibility(store, '2.0.0'), /editor disabled/);
    assert.equal(store.registerPanel, register); assert.deepEqual(writes, []);
    const broken = freshStore() as unknown as {persistPanel: unknown}; broken.persistPanel = null;
    assert.throws(() => installMicro20AuthoringCompatibility(broken as unknown as typeof DialStore), /editor disabled/);
    assert.equal(storage.getItem(key), original); assert.deepEqual(writes, []);
    installMicro20AuthoringCompatibility(store);
    store.registerPanel(id, 'Test', config());
    store.updateValue(id, path, {type: 'easing', duration: NaN, ease: [0, 0, 1, 1]});
    store.updatePanel(id, 'Test', config(25));
    assert.deepEqual(store.getValues(id)[path], defaults()[path]);
  });
});
test('imports without mode metadata infer each state mode from its own curve, not config defaults', () => {
  const saved = clone(fixture('easing'));
  for (const values of [saved.values, saved.baseValues, ...saved.presets.map(p => p.values)]) {
    delete (values as Record<string, unknown>)[modePath];
  }
  withStorage(saved, (_storage, writes) => {
    const store = freshStore(); installMicro20AuthoringCompatibility(store);
    store.registerPanel(id, 'Test', config(), undefined, options);
    assert.equal(store.getValues(id)[modePath], 'easing');
    assert.equal(writes.at(-1)!.baseValues[modePath], 'advanced');
    assert.deepEqual(store.getPresets(id).map(p => p.values[modePath]), ['simple', 'easing']);
    assert.equal((store.getValues(id)[path] as {type: string}).type, 'easing');
  });
});
test('read-only initial storage fallback retains edited curves for first-frame duration calculation', () => {
  const saved = fixture('easing');
  const original = JSON.stringify(saved);
  const storage = {getItem: (key: string) => key === `dialkit:${id}` ? original : null};
  const values = readMicro20Values(storage) as ReturnType<typeof DialStore.getValues>;
  assert.equal(authoredFromFlat(values).issueTiming.subtitleIssues.transition?.type, 'easing');
  assert.equal(JSON.stringify(saved), original);
});
