import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ULTIMATE_3_DEFAULTS,normalizeSettings} from '../micro-18/settings';
import {mergeSilkAuthoring} from './authoring-state';
test('same-commit timing/control publications retain both edits through panel handoffs',()=>{
 const base=normalizeSettings(ULTIMATE_3_DEFAULTS),timing=structuredClone(base),controls=structuredClone(base);
 timing.cost.timing.cheapLegOneRight.at=1.5;controls.cost.controls.cheapSpinnerSpeed=13;
 const current=mergeSilkAuthoring(mergeSilkAuthoring(base,base,timing),base,controls);
 assert.equal(current.cost.timing.cheapLegOneRight.at,1.5);assert.equal(current.cost.controls.cheapSpinnerSpeed,13);
 assert.deepEqual(mergeSilkAuthoring(current,base,base),current);
});
