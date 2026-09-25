import {CELL, type BlockKind, type StreamBlock} from './geometry';

export const BLOCK_CONTENT_DEFAULTS = {showWordsAndIcons: true};
// Micro07: 120px blocks, 48px/63px JetBrains Mono, 32px left inset
// (20px for the first red Thinking...). Keep these tied to the source by tests.
export const BLOCK_CONTENT_SCALE = CELL / 120;
export const BLOCK_FONT_SIZE = 48 * BLOCK_CONTENT_SCALE;
export const BLOCK_LINE_HEIGHT = 63 * BLOCK_CONTENT_SCALE;
export const BLOCK_GLYPH_ADVANCE = BLOCK_FONT_SIZE * .6;
export const BLOCK_ICONS = {purple: 'block-chat.svg', yellow: 'block-hex.svg'} as const;
const LABELS: Partial<Record<BlockKind, string>> = {
  blue: 'Thinking', red: 'Thinking...', orange: 'Read', green: 'Write', pink: 'Bash',
};

export function blockLabel(block: StreamBlock) {
  const label = LABELS[block.kind];
  if (!label) return null;
  const inset = (block.kind === 'red' ? 20 : 32) * BLOCK_CONTENT_SCALE;
  // A few offscreen padding blocks are narrower than Micro07's equivalents.
  // Ellipsize only those, rather than changing geometry or shrinking the font.
  const capacity = Math.floor((block.width - inset) / BLOCK_GLYPH_ADVANCE);
  const text = label.length <= capacity ? label : `${label.slice(0, Math.max(0, capacity - 1))}…`;
  return {text, label, inset};
}
