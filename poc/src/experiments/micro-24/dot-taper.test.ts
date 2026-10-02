import assert from 'node:assert/strict';
import test from 'node:test';
import {DOT, flowDotRowScale, sampleFlowDots} from '../introducing-flow-1/geometry';
import {Flow1WorldContent} from '../introducing-flow-1/Scene';
import {flow3WorldState} from './geometry';
import {sampleFlow3} from './sample';

test('two extra aligned rows taper to half and quarter size without changing the existing sparkle field', () => {
  for (const time of [0, .5, 2, 5, 2, .5, 0]) {
    const original = sampleFlowDots(time);
    const tapered = sampleFlowDots(time, true);
    assert.deepEqual(tapered.filter(dot => dot.row >= -1), original);
    const columns = original.filter(dot => dot.row === -1).map(dot => dot.column);
    for (const [row, diameter] of [[-2, 6], [-3, 3]]) {
      const added = tapered.filter(dot => dot.row === row);
      assert.deepEqual(added.map(dot => dot.column), columns);
      assert.ok(added.every(dot => !dot.colored));
      assert.equal(DOT.size * flowDotRowScale(row), diameter);
    }
    assert.equal(tapered.length, original.length + 2 * columns.length);
    assert.ok(original.every(dot => flowDotRowScale(dot.row) === 1));
  }
});

test('rendered taper follows the authored dot scale, and historical scenes remain opt-out', () => {
  const props = {state: {...flow3WorldState(sampleFlow3(1)), dotScale: .8}, time: 1, blueDotScale: 1.2, coverMotion: 'split' as const};
  const original = Flow1WorldContent(props).props.children[0].props.children;
  const tapered = Flow1WorldContent({...props, taperDotRows: true}).props.children[0].props.children;
  assert.deepEqual(tapered.slice(0, original.length), original);
  const extra = tapered.slice(original.length);
  for (const dot of extra) {
    const row = dot.props['data-row'];
    assert.equal(dot.props.style.transform, row === -2 ? 'scale(0.4)' : 'scale(0.2)');
    assert.equal(dot.props.style.top, row * 100 + DOT.cellTop);
  }
  assert.equal(extra.length, 30);
});
