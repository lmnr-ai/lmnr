import {staticFile} from 'remotion';
import {CELL, type StreamBlock} from './geometry';
import {BLOCK_FONT_SIZE, BLOCK_ICONS, BLOCK_LINE_HEIGHT, blockLabel} from './block-content';

export const BlockContent = ({block, x}: {block: StreamBlock; x: number}) => {
  if (block.kind === 'purple' || block.kind === 'yellow') {
    // 120→48 scales both the 4px stroked chat and the filled hex outline to1.6px.
    // Icon-only SVGs retain the original paths; Micro08's gradients stay intact.
    return <image className="micro08-block-icon" href={staticFile(`micro-08/${BLOCK_ICONS[block.kind]}`)}
      x={x} y={0} width={CELL} height={CELL}/>;
  }
  const label = blockLabel(block);
  if (!label) return null;
  return <text className="micro08-block-label" x={x + label.inset} y={CELL / 2}
    dominantBaseline="central" fill="#0e0f21" fontFamily="Micro08BlockMono, monospace"
    fontSize={BLOCK_FONT_SIZE} fontWeight={400} style={{lineHeight: `${BLOCK_LINE_HEIGHT}px`}}>{label.text}</text>;
};
