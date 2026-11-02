export const CELL = 20;
const ROWS = 14;
export const BASE_COLS = 44;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Connection {
  d: string;
  length: number;
}

export interface GridLoopLayout {
  width: number;
  height: number;
  nodes: { agent: Rect; flow: Rect; fix: Rect };
  boxes: { traces: Rect; issues: Rect; evals: Rect };
  labels: { agent: Rect; flow: Rect; fix: Rect; development: Rect; production: Rect };
  connections: {
    agentToTraces: Connection;
    tracesToFlow: Connection;
    flowToIssues: Connection;
    issuesToEvals: Connection;
    agentToEvals: Connection;
    evalsToFix: Connection;
    fixToAgent: Connection;
  };
}

const ARC_RADIUS = 24;
const QUARTER_ARC = (ARC_RADIUS * Math.PI) / 2;

const rect = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h });

// Avoids float noise like 939.7550000000001 in path strings.
const n = (value: number) => String(Math.round(value * 1000) / 1000);

const connection = (d: string, straight: number, arcs: number): Connection => ({
  d,
  length: straight + arcs * QUARTER_ARC,
});

export const getGridLoopLayout = (cols: number, compact = false): GridLoopLayout => {
  const safeCols = Math.max(cols, BASE_COLS);
  // Coordinates are Figma's, which end one column short of the right edge; the
  // right-hand group is pushed out so Traces meets the edge at every width.
  const shiftCols = safeCols - BASE_COLS + 1;
  const dx = shiftCols * CELL;
  const productionDx = Math.round(shiftCols / 2) * CELL;
  // Compact (mobile) lifts the lower half a row, shortening the three vertical arms.
  const lo = compact ? CELL : 0;
  const y = (value: number) => n(value - lo);

  return {
    width: safeCols * CELL,
    height: (compact ? ROWS - 1 : ROWS) * CELL,
    nodes: {
      agent: rect(120, 0, 60, 60),
      fix: rect(0, 60, 60, 60),
      flow: rect(660 + dx, 220 - lo, 60, 60),
    },
    boxes: {
      traces: rect(600 + dx, 0, 260, 100),
      issues: rect(300 + dx, 220 - lo, 300, 60),
      evals: rect(60, 160 - lo, 220, 60),
    },
    labels: {
      agent: rect(180, 0, 80, 20),
      fix: rect(60, 60, 40, 20),
      development: rect(160, 100, 80, 20),
      production: rect(420 + productionDx, 120, 80, 20),
      flow: rect(720 + dx, 220 - lo, 60, 20),
    },
    connections: {
      agentToTraces: connection(`M180.5 30.5H${n(600.5 + dx)}`, 420 + dx, 0),
      tracesToFlow: connection(
        `M${n(830.5 + dx)} 100.5V${y(226.5)}C${n(830.5 + dx)} ${y(239.755)} ${n(819.755 + dx)} ${y(250.5)} ${n(806.5 + dx)} ${y(250.5)}H${n(720.5 + dx)}`,
        126 - lo + 86,
        1
      ),
      flowToIssues: connection(`M${n(660.5 + dx)} ${y(250.5)}H${n(600.5 + dx)}`, 60, 0),
      issuesToEvals: connection(
        `M${n(300.5 + dx)} ${y(250.5)}H114.5C101.245 ${y(250.5)} 90.5 ${y(239.755)} 90.5 ${y(226.5)}V${y(220.5)}`,
        186 + dx + 6,
        1
      ),
      agentToEvals: connection(
        `M180.5 30.5H326.5C339.755 30.5 350.5 41.245 350.5 54.5V${y(166.5)}C350.5 ${y(179.755)} 339.755 ${y(190.5)} 326.5 ${y(190.5)}H280.5`,
        146 + 112 - lo + 46,
        2
      ),
      evalsToFix: connection(
        `M60.5 ${y(190.5)}H54.5C41.245 ${y(190.5)} 30.5 ${y(179.755)} 30.5 ${y(166.5)}V120.5`,
        6 + 46 - lo,
        1
      ),
      fixToAgent: connection("M30.5 60.5V54.5C30.5 41.245 41.245 30.5 54.5 30.5H120.5", 6 + 66, 1),
    },
  };
};

// Box sizes don't stretch with `cols`; each box is filled edge to edge after its title cells.
export const LABEL_CELLS = { traces: 3, issues: 3, evals: 4 } as const;
const { boxes } = getGridLoopLayout(BASE_COLS);
const boxCells = (key: keyof typeof LABEL_CELLS) => (boxes[key].w / CELL) * (boxes[key].h / CELL) - LABEL_CELLS[key];

export const BOX_CELLS = {
  traces: boxCells("traces"),
  issues: boxCells("issues"),
  evals: boxCells("evals"),
} as const;
