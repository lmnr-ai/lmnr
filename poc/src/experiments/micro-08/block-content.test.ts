import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {BLOCKS as MICRO07_BLOCKS, CELL as MICRO07_CELL} from '../micro-07/geometry';
import {CELL, FIGMA, ROWS, type StreamBlock} from './geometry';
import {BLOCK_CONTENT_SCALE, BLOCK_FONT_SIZE, BLOCK_GLYPH_ADVANCE, BLOCK_LINE_HEIGHT, blockLabel} from './block-content';
import {Micro08Scene} from './Scene';
import {sampleMicro08, sampleStreamers} from './sample';

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-10, `${a} != ${b}`);
const sourceCss = read('../micro-07/styles.css');
const sourceFont = sourceCss.match(/font:400 (\d+)px\/(\d+)px SnailMono/)!;
assert.ok(sourceFont, 'inspect actual Micro07 header typography, not paper typography');
close(BLOCK_CONTENT_SCALE, CELL / MICRO07_CELL);
close(BLOCK_CONTENT_SCALE, .4);
close(BLOCK_FONT_SIZE, Number(sourceFont[1]) * BLOCK_CONTENT_SCALE);
close(BLOCK_FONT_SIZE, 19.2);
close(BLOCK_LINE_HEIGHT, Number(sourceFont[2]) * BLOCK_CONTENT_SCALE);
close(BLOCK_LINE_HEIGHT, 25.2);
close(BLOCK_GLYPH_ADVANCE, 11.52);
for (const [source, derived, id] of [['icon-d-square.svg', 'block-chat.svg', 'Vector'], ['icon-a-square.svg', 'block-hex.svg', 'Subtract']]) {
  const original = read(`../../../public/micro-07/${source}`);
  const icon = read(`../../../public/micro-08/${derived}`);
  const path = (svg: string) => svg.match(new RegExp(`<path id="${id}" d="([^"]+)"`))![1];
  assert.equal(path(icon), path(original), 'use exact source icon geometry, including expanded outlines');
  assert.match(icon, /viewBox="0 0 120 120"/);
  assert.ok(!icon.includes('<linearGradient') && !icon.includes('fill="url('), 'icons cannot repaint existing block colors');
  if (id === 'Vector') {
    const stroke = Number(original.match(/stroke-width="([^"]+)"/)![1]);
    assert.equal(stroke, 4);
    assert.match(icon, /stroke-width="4"/);
    close(stroke * BLOCK_CONTENT_SCALE, 1.6);
  }
}
for (const [kind, sourceId] of [['blue', 'thinking-blue'], ['red', 'thinking-red'], ['orange', 'read'], ['green', 'write'], ['pink', 'bash']] as const) {
  const original = MICRO07_BLOCKS.find(block => block.id === sourceId)!;
  const scaled = blockLabel({kind, x: 0, width: original.w * BLOCK_CONTENT_SCALE})!;
  assert.equal(scaled.text, original.label, 'use actual Micro07 words');
  close(scaled.inset, (original.textX ?? 32) * BLOCK_CONTENT_SCALE);
}
for (const row of FIGMA.rows) for (const block of row.blocks) {
  const label = blockLabel(block as StreamBlock);
  if (label) assert.equal(label.text, label.label, 'every authored block fits the complete Micro07 label');
}
for (const row of ROWS) for (const block of row.blocks) {
  const label = blockLabel(block);
  if (label) assert.ok(label.inset + label.text.length * BLOCK_GLYPH_ADVANCE <= block.width, 'padding labels cannot bleed into adjacent blocks');
  else assert.equal(block.width, CELL, 'icons only occupy square blocks');
}
const render = (time: number, enabled: boolean) => renderToStaticMarkup(createElement(Micro08Scene, {
  ...sampleMicro08(time), background: 'reference', showWordsAndIcons: enabled,
}));
const off = render(0, false), on = render(0, true);
assert.ok(!off.includes('micro08-block-label') && !off.includes('micro08-block-icon'));
assert.equal((on.match(/class="micro08-block-label"/g) ?? []).length, 112);
assert.equal((on.match(/class="micro08-block-icon"/g) ?? []).length, 112);
for (const text of ['Thinking', 'Thinking...', 'Read', 'Write', 'Bash']) assert.ok(on.includes(`>${text}</text>`));
assert.match(on, /font-family="Micro08BlockMono, monospace"/);
assert.equal((on.match(/class="micro08-agent"/g) ?? []).length, 7);
assert.equal(render(0, true), render(8, true), 'content remains attached to the seamless strip pattern');
assert.deepEqual(sampleStreamers(.125), sampleStreamers(1e12 + .125), 'large seeks retain stream phase precision');
assert.notEqual(render(.125, true), render(1e12 + .125, true), 'finite outro stays at the grid on large seeks');
assert.equal(render(0, false), off, 'toggling off restores original scene structure');
console.log('Micro08 block content: source scale 48/120=.4; font48→19.2, line63→25.2, stroke4→1.6; exact icon paths; all authored labels fit; toggle/loop structure passed (no browser).');
