import reference from './figma-reference.json';

export const CELL = 48;
export const TILE_PERIOD = 2688;
export const SPEED = 672;
export type BlockKind = keyof typeof reference.gradients;
export type StreamBlock = {x: number; width: number; kind: BlockKind};
export const GRADIENTS = reference.gradients;
export const FIGMA = reference;

// Complete square/wide pairs prepended offscreen; authored coordinates never move.
const PADDING_WIDES: Record<number, number[]> = {
  1896: [144, 120, 96, 96, 96], // 792px
  1872: [144, 144, 96, 96, 96], // 816px
  1680: [144, 144, 144, 96, 96, 96], // 1008px
  1848: [144, 120, 120, 120, 96], // 840px
};
export const ROWS = reference.rows.map(row => {
  const authored = row.blocks.map(({x, width, kind}) => ({x, width, kind: kind as BlockKind}));
  let x = row.agent.x - TILE_PERIOD;
  const padding: StreamBlock[] = PADDING_WIDES[row.agent.x - authored[0].x].flatMap((width, index) => {
    const pair: StreamBlock[] = [
      {x, width: CELL, kind: index % 2 === 0 ? 'purple' : 'yellow'},
      {x: x + CELL, width, kind: index % 2 === 0 ? 'blue' : 'green'},
    ];
    x += CELL + width;
    return pair;
  });
  return {y: row.y, agent: row.agent, blocks: [...padding, ...authored]};
});

export function positiveModulo(value: number, period: number) {
  const remainder = value % period;
  return remainder < 0 ? remainder + period : remainder === 0 ? 0 : remainder;
}

export function streamPhase(distance: number) {
  return {
    stripPhase: positiveModulo(distance, TILE_PERIOD),
    gridPhase: positiveModulo(distance, CELL),
    spinnerAngle: positiveModulo(distance / (SPEED / 1.5), 1) * 360,
  };
}

// A pattern tile starts here; its local coordinates are shared by all repetitions.
export function tileOrigin(agentX: number, phase: number) {
  return agentX - TILE_PERIOD - phase;
}
