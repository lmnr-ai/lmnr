"use client";

import { animate, useMotionValue } from "framer-motion";
import { useEffect } from "react";

import ExtendedDiamond from "./extended-diamond";

// Grid layout constants — must stay in sync with DiamondGrid's geometry
// AND the placement of <DiamondGrid /> inside the hero visual container.
// 24 cells × 28px stride (24 cell + 4 gap) minus the trailing gap = 668
// pre-transform; layout center at (334, 334). The grid wrapper is placed
// at left=-274 in a 300-tall hero container with vertical centering, so
// the pre-transform grid center lands at hero coords (60, 150).
const CELL_STRIDE = 28;
const GRID_HALF = 334;
const GRID_OFFSET_X = 60;
const GRID_OFFSET_Y = 150;

const SCALE_Y = 0.87;
const SKEW_X_TAN = Math.tan(-Math.PI / 6); // tan(-30°)
const COS_120 = Math.cos((2 * Math.PI) / 3);
const SIN_120 = Math.sin((2 * Math.PI) / 3);

// Project a (row, col) grid coord through the same transform DiamondGrid
// applies (scaleY → skewX → rotate) to a screen-space (x, y) in hero
// container coords. Lets us drop an absolutely-positioned overlay at the
// exact spot a grid cell paints to.
const cellToHero = (row: number, col: number) => {
  const cx = col * CELL_STRIDE + 12 - GRID_HALF;
  const cy = row * CELL_STRIDE + 12 - GRID_HALF;
  const sy = cy * SCALE_Y;
  const sx = cx + sy * SKEW_X_TAN;
  return {
    x: GRID_OFFSET_X + sx * COS_120 - sy * SIN_120,
    y: GRID_OFFSET_Y + sx * SIN_120 + sy * COS_120,
  };
};

// Cluster geometry — at extension = 1 every head lands at
// (CLUSTER_CX + clusterCol*CLUSTER_HSTRIDE, source_y), forming a clean
// 1-2-3-4-3-2-1 diamond. Rows of the diamond correspond to (col − row)
// values from -3..3 (Y depends only on c − r in our transform). Adjacent
// rows offset by half a stride (clusterCol on integer vs half-integer
// values) to tessellate. Tune CLUSTER_CX/CLUSTER_HSTRIDE to slide or
// resize the final cluster.
const CLUSTER_CX = 800;
const CLUSTER_HSTRIDE = 28;

// Source (row, col) in the grid plus the cell's "column" within its
// cluster row. Sources are picked to land in the visible grid area;
// cluster columns set the final X within the row of the 1-2-3-4-3-2-1
// pattern. maxLength is derived per-cell from these.
//
// `delay` and `zIndex` are baked output from a one-shot script
// (/tmp/diamond_stagger.py, deleted). Stagger biases farther diamonds
// (longer maxLength) to start first with random jitter; closer diamonds
// (shorter maxLength) get higher z so they sit on top during the launch.
const CELLS_RAW: ReadonlyArray<{
  row: number;
  col: number;
  clusterCol: number;
  delay: number;
  zIndex: number;
}> = [
  // c−r = −3  (Y ≈ 78)   1 diamond
  { row: 5, col: 2, clusterCol: 0, delay: 0.405, zIndex: 30 },
  // c−r = −2  (Y ≈ 102)  2 diamonds
  { row: 8, col: 6, clusterCol: -0.5, delay: 0.189, zIndex: 26 },
  { row: 10, col: 8, clusterCol: 0.5, delay: 0.147, zIndex: 22 },
  // c−r = −1  (Y ≈ 126)  3 diamonds
  { row: 3, col: 2, clusterCol: -1, delay: 0.383, zIndex: 33 },
  { row: 7, col: 6, clusterCol: 0, delay: 0.332, zIndex: 27 },
  { row: 10, col: 9, clusterCol: 1, delay: 0.197, zIndex: 21 },
  // c−r =  0  (Y ≈ 150)  4 diamonds — middle row
  { row: 2, col: 2, clusterCol: -1.5, delay: 0.548, zIndex: 34 },
  { row: 6, col: 6, clusterCol: -0.5, delay: 0.233, zIndex: 28 },
  { row: 8, col: 8, clusterCol: 0.5, delay: 0.207, zIndex: 24 },
  { row: 11, col: 11, clusterCol: 1.5, delay: 0.006, zIndex: 20 },
  // c−r =  1  (Y ≈ 175)  3 diamonds
  { row: 0, col: 1, clusterCol: -1, delay: 0.444, zIndex: 35 },
  { row: 3, col: 4, clusterCol: 0, delay: 0.378, zIndex: 31 },
  { row: 7, col: 8, clusterCol: 1, delay: 0.128, zIndex: 25 },
  // c−r =  2  (Y ≈ 199)  2 diamonds
  { row: 4, col: 6, clusterCol: -0.5, delay: 0.286, zIndex: 29 },
  { row: 8, col: 10, clusterCol: 0.5, delay: 0.222, zIndex: 23 },
  // c−r =  3  (Y ≈ 224)  1 diamond
  { row: 2, col: 5, clusterCol: 0, delay: 0.386, zIndex: 32 },
];

// Per-cell target extension. Farther diamonds (longest maxLength) reach
// 1.0 and fully land on their cluster slot; closer diamonds (shortest
// maxLength) stop at TARGET_MIN so they're "almost there" but visibly
// short of the cluster. Linear interp on maxLength between the two ends.
const TARGET_MIN = 0.82; // closest diamond — left side of cluster, unfinished
const TARGET_MAX = 1.0; // farthest diamond — right side of cluster, fully landed

// Resolve each source cell to its visible (x, y), compute the cluster
// target X for its row+clusterCol, bake maxLength = target − source, and
// derive each cell's `target` extension at module init so the component
// doesn't recompute on every render.
const RAW_RESOLVED = CELLS_RAW.map(({ row, col, clusterCol, delay, zIndex }) => {
  const { x } = cellToHero(row, col);
  const targetX = CLUSTER_CX + clusterCol * CLUSTER_HSTRIDE;
  return { row, col, maxLength: targetX - x, delay, zIndex };
});
const MIN_MAXLEN = Math.min(...RAW_RESOLVED.map((c) => c.maxLength));
const MAX_MAXLEN = Math.max(...RAW_RESOLVED.map((c) => c.maxLength));
const MAXLEN_SPAN = MAX_MAXLEN - MIN_MAXLEN;
const EXTENDED_CELLS = RAW_RESOLVED.map((c) => {
  const normalized = (c.maxLength - MIN_MAXLEN) / MAXLEN_SPAN;
  const target = TARGET_MIN + (TARGET_MAX - TARGET_MIN) * normalized;
  return { ...c, target };
});

// Exported so DiamondGrid can punch matching holes — single source of truth.
export const EXTENDED_CELL_KEYS: ReadonlySet<string> = new Set(EXTENDED_CELLS.map(({ row, col }) => `${row}-${col}`));

// ExtendedDiamond container measures 42px tall, head sits at the LEFT
// edge of the container (the flex row starts with the tail at width 0).
// Offset the container so the head's center lands on cellToHero's (x, y).
const HEAD_HALF = 12;
const CONTAINER_HALF = 21;

// Grid fade-in window — the whole grid + diamonds fade from 0.2 → 1
// opacity on mount before any diamond launches. Exported so
// GridFadeWrapper uses the same duration. Diamond delays add this on
// top of their own per-cell stagger so launches start AFTER the fade.
export const GRID_FADE_DURATION = 1.5;

// Spring tuned for a "relaxed, mysterious" launch — long settling time,
// low bounce so heads ease into place without snapping. Per-cell target
// (computed above): farther diamonds reach 1.0 (settle on cluster slot),
// closer diamonds stop at TARGET_MIN (cluster is partially formed).
const SPRING_DURATION = 2.0;
const SPRING_BOUNCE = 0.1;

interface CellProps {
  row: number;
  col: number;
  maxLength: number;
  delay: number;
  zIndex: number;
  target: number;
}

// Per-cell wrapper so each ExtendedDiamond owns its own MotionValue and
// staggered launch — avoids the hooks-in-loop pitfall of trying to
// allocate the values in the parent.
const ExtendedDiamondCell = ({ row, col, maxLength, delay, zIndex, target }: CellProps) => {
  const extension = useMotionValue(0);
  useEffect(() => {
    const controls = animate(extension, target, {
      type: "spring",
      duration: SPRING_DURATION,
      bounce: SPRING_BOUNCE,
      delay: GRID_FADE_DURATION + delay,
    });
    return () => controls.stop();
  }, [extension, delay, target]);

  const { x, y } = cellToHero(row, col);
  return (
    <div className="absolute pointer-events-none" style={{ left: x - HEAD_HALF, top: y - CONTAINER_HALF, zIndex }}>
      <ExtendedDiamond extension={extension} maxLength={maxLength} />
    </div>
  );
};

// Renders the 16 ExtendedDiamond overlays. Drop as an absolute sibling of
// DiamondGrid inside the hero visual container.
const ExtendedDiamondsOverlay = () => (
  <>
    {EXTENDED_CELLS.map((cell) => (
      <ExtendedDiamondCell key={`${cell.row}-${cell.col}`} {...cell} />
    ))}
  </>
);

export default ExtendedDiamondsOverlay;
