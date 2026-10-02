import assert from 'node:assert/strict';
import test from 'node:test';
import {DOTS, FIELD, LABEL_BOUNDS, NUMBER_BOUNDS, createMicro23Sampler} from './sample';

test('approved pricing is 888 total traces, including exactly 38 orange comparator traces', () => {
  assert.equal(DOTS.length, 888);
  assert.equal(DOTS.filter(dot => dot.color === 'orange').length, 38);
  assert.equal(DOTS.filter(dot => dot.color === 'blue').length, 850);
  assert.deepEqual(createMicro23Sampler().sample(3).numbers, {gpt: 38, flow: 888});
});

test('20 full rows of 43 and a left-aligned final row of 28 stay cell-aligned', () => {
  const positions = new Set(DOTS.map(dot => `${dot.x},${dot.y}`));
  assert.equal(positions.size, 888);
  for (const dot of DOTS) {
    assert.ok(Number.isInteger((dot.x - 650) / FIELD.cell));
    assert.ok(Number.isInteger((dot.y - 360) / FIELD.cell));
  }
  for (let row = 0; row < FIELD.rows; row++) {
    const dots = DOTS.filter(dot => dot.row === row);
    assert.equal(dots.length, row === 20 ? 28 : 43);
    assert.equal(dots[0].x, FIELD.x + FIELD.cell / 2);
    if (row < 20) assert.equal((dots[0].x + dots.at(-1)!.x) / 2, 650);
  }
});

test('Flow number ends at the last occupied cell, with no label overlap', () => {
  const lastCellRight = DOTS.at(-1)!.x + FIELD.cell / 2;
  assert.equal(NUMBER_BOUNDS.flow.x + NUMBER_BOUNDS.flow.width, lastCellRight);
  assert.ok(NUMBER_BOUNDS.flow.x >= LABEL_BOUNDS.flow.x + LABEL_BOUNDS.flow.width);
  assert.equal(NUMBER_BOUNDS.flow.y, FIELD.y + FIELD.rows * FIELD.cell);
});

test('labels clear the field, and the whole assembly fits the artboard', () => {
  const top = Math.min(...DOTS.map(dot => dot.y)) - 3;
  const bottom = Math.max(...DOTS.map(dot => dot.y)) + 3;
  for (const boxes of [LABEL_BOUNDS, NUMBER_BOUNDS]) {
    assert.ok(boxes.gpt.y + boxes.gpt.height < top);
    assert.ok(boxes.flow.y > bottom);
    for (const box of Object.values(boxes)) {
      assert.ok(box.x >= 0 && box.x + box.width <= 1280);
      assert.ok(box.y >= 0 && box.y + box.height <= 720);
    }
  }
});
