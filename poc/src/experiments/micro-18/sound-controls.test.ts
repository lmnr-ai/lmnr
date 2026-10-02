import assert from 'node:assert/strict';
import test from 'node:test';
import {flattenUltimate3SoundMix, migrateSoundMixRecord, migrateUltimate3SoundStorage, ULTIMATE_3_SOUND_CONFIG} from './sound-controls';

test('sound folders preserve the requested order and route shared multi-chapter voices', () => {
  assert.deepEqual(Object.keys(ULTIMATE_3_SOUND_CONFIG), ['Shared','Ultimate 2','Cost','Introducing Flow-1','Issue clusters 2','Conclusion']);
  assert.ok('masterVolume' in ULTIMATE_3_SOUND_CONFIG.Shared);
  assert.deepEqual(ULTIMATE_3_SOUND_CONFIG.Shared.masterVolume, [6.98,0,10,.01]);
  assert.deepEqual(ULTIMATE_3_SOUND_CONFIG.Shared.musicVolume, [0,0,1,.01]);
  assert.deepEqual(ULTIMATE_3_SOUND_CONFIG.Shared.errorToneVolume, [.11,0,1.5,.01]);
  assert.deepEqual(ULTIMATE_3_SOUND_CONFIG['Ultimate 2'].tickVolume, [2,0,10,.01]);
  assert.deepEqual(ULTIMATE_3_SOUND_CONFIG.Cost.costRatchetVolume, [2,0,10,.01]);
  for (const shared of ['musicVolume','errorToneVolume','cloudVolume','drawerVolume','cameraVolume','cameraSound','cameraDurationMultiplier','agentWindowSlideVolume','agentWindowClickVolume']) assert.ok(shared in ULTIMATE_3_SOUND_CONFIG.Shared, shared);
  assert.ok(!('agentWindowSlideVolume' in ULTIMATE_3_SOUND_CONFIG['Ultimate 2']), 'window slide also drives Flow doors');
  assert.deepEqual(Object.keys(ULTIMATE_3_SOUND_CONFIG['Issue clusters 2']), ['_collapsed','typingVolume']);
  assert.deepEqual(ULTIMATE_3_SOUND_CONFIG['Issue clusters 2'].typingVolume, [1,0,10,.01]);
  assert.deepEqual(Object.keys(ULTIMATE_3_SOUND_CONFIG.Conclusion), ['_collapsed']);
  const mix = flattenUltimate3SoundMix({Shared:{masterVolume:4,musicVolume:.2},'Ultimate 2':{tickVolume:3},Cost:{costRatchetVolume:2},'Introducing Flow-1':{flowRatchetVolume:.1},'Issue clusters 2':{typingVolume:1.7}});
  assert.equal(mix.masterVolume,4); assert.equal(mix.tickVolume,3); assert.equal(mix.costRatchetVolume,2); assert.equal(mix.flowRatchetVolume,.1); assert.equal(mix.typingVolume,1.7);
});

test('flat DialKit state migrates every value collection exactly once without changing selection', () => {
  const original = {version:1,values:{musicVolume:.37,tickVolume:7,unknown:9},baseValues:{musicVolume:.18},activePresetId:'custom',presets:[{id:'custom',name:'Mix',values:{musicVolume:.6,costRatchetVolume:4}}]};
  let raw = JSON.stringify(original); let writes = 0;
  const storage = {getItem:() => raw,setItem:(_key:string,value:string) => {raw=value;writes++;}};
  migrateUltimate3SoundStorage(storage);
  const migrated = JSON.parse(raw);
  assert.deepEqual(migrated.values, {'Shared.musicVolume':.37,'Ultimate 2.tickVolume':7,unknown:9});
  assert.deepEqual(migrated.baseValues, {'Shared.musicVolume':.18});
  assert.deepEqual(migrated.presets[0].values, {'Shared.musicVolume':.6,'Cost.costRatchetVolume':4});
  assert.equal(migrated.activePresetId,'custom');
  migrateUltimate3SoundStorage(storage);
  assert.equal(writes,1,'the load-only migration is idempotent');
  assert.deepEqual(migrateSoundMixRecord({'Shared.musicVolume':.4,musicVolume:.2}), {'Shared.musicVolume':.4}, 'a nested value wins if mixed old/new storage exists');
});
