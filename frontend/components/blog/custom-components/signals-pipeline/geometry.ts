export const CELL = 20;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const rect = (col: number, row: number, cols: number, rows: number): Rect => ({
  x: col * CELL,
  y: row * CELL,
  w: cols * CELL,
  h: rows * CELL,
});

// Everything sits on whole cells; the diagram is vertically centred in a 280px canvas.
export const CANVAS = { cols: 30, rows: 14 };
export const ORIGIN = { x: CELL, y: 4 * CELL };

export const LAYOUT = {
  width: 28 * CELL,
  height: 6 * CELL,
  nodes: {
    agent: rect(0, 2, 3, 3),
    flow: rect(16, 2, 3, 3),
  },
  boxes: {
    traces: rect(6, 1, 7, 5),
    issues: rect(22, 1, 6, 5),
  },
  // Labels sit above their element, spanning its width so the text centres over it.
  labels: {
    agent: rect(0, 1, 3, 1),
    traces: rect(6, 0, 7, 1),
    flow: rect(16, 1, 3, 1),
    issues: rect(22, 0, 6, 1),
  },
};

// Lines run through cell centres on the half pixel, like the landing grid loop.
const LINE_Y = 3.5 * CELL + 0.5;
const line = (fromCol: number, toCol: number) => ({
  d: `M${fromCol * CELL + 0.5} ${LINE_Y}H${toCol * CELL + 0.5}`,
  length: (toCol - fromCol) * CELL,
});

export const CONNECTIONS = {
  agentToTraces: line(3, 6),
  tracesToSignal: line(13, 16),
  signalToEvents: line(19, 22),
};

export const BOX_CELLS = {
  traces: (LAYOUT.boxes.traces.w / CELL) * (LAYOUT.boxes.traces.h / CELL),
  issues: (LAYOUT.boxes.issues.w / CELL) * (LAYOUT.boxes.issues.h / CELL),
};
