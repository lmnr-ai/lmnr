"use client";

import { animate, useInView, useMotionValue } from "framer-motion";
import { useEffect, useRef, useState } from "react";

import PatternGridCell from "./pattern-grid-cell";

const CELL_SIZE = 24;
const DEFAULT_COLUMN_COUNT = 80;
const MAX_CELL_COUNT = 5000;
const PALETTE = ["#2e2e2e", "#494949"] as const;
const SHAPE_COUNT = 3;
const RESAMPLE_PERIOD_MS = 100;
const RESAMPLE_PROBABILITY = 0.04;

interface Cell {
  /** Uniform in [0, 1); the cell is bright when it falls under its row's bright chance. */
  colorSeed: number;
  revision: number;
  shape: number;
}

const hash = (value: number) => {
  let result = value + 0x6d2b79f5;
  result = Math.imul(result ^ (result >>> 15), result | 1);
  result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
  return (result ^ (result >>> 14)) >>> 0;
};

const toUnit = (value: number) => value / 0x100000000;

const createInitialCells = () =>
  Array.from({ length: MAX_CELL_COUNT }, (_, index) => ({
    colorSeed: toUnit(hash(index + 0x2c1b3c6d)),
    revision: 0,
    shape: hash(index) % SHAPE_COUNT,
  }));

// Always picks a different shape so every resample is visible.
const resampleCell = (cell: Cell): Cell => {
  let shape = Math.floor(Math.random() * (SHAPE_COUNT - 1));
  if (shape >= cell.shape) shape += 1;
  return { colorSeed: Math.random(), revision: cell.revision + 1, shape };
};

// rowBias 0 is an even 50/50 everywhere; 1 makes the top row all dark and the bottom row all bright.
const brightChance = (row: number, rowCount: number, rowBias: number) =>
  0.5 + rowBias * (row / Math.max(1, rowCount - 1) - 0.5);

interface Props {
  backgroundColor?: string;
  /** Seconds for the cells to pop in once the grid scrolls into view. */
  revealDuration: number;
  rowBias?: number;
  rowCount: number;
}

const PatternGrid = ({ backgroundColor = "transparent", revealDuration, rowBias = 0, rowCount }: Props) => {
  const gridRef = useRef<HTMLDivElement>(null);
  const [columnCount, setColumnCount] = useState(DEFAULT_COLUMN_COUNT);
  const [cells, setCells] = useState(createInitialCells);
  // Time-based, not scroll-linked, so a fast scroll to the bottom still sees the whole reveal.
  const revealProgress = useMotionValue(0);
  const isInView = useInView(gridRef, { once: true });
  const isVisible = useInView(gridRef);

  useEffect(() => {
    if (!isInView) return;
    const controls = animate(revealProgress, 1, { duration: revealDuration, ease: "linear" });
    return () => controls.stop();
  }, [isInView, revealDuration, revealProgress]);

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;

    const observer = new ResizeObserver(([entry]) => {
      setColumnCount(Math.max(1, Math.floor(entry.contentRect.width / CELL_SIZE)));
    });
    observer.observe(grid);
    return () => observer.disconnect();
  }, []);

  const visibleCellCount = Math.min(MAX_CELL_COUNT, columnCount * rowCount);

  useEffect(() => {
    if (!isVisible) return;
    const interval = window.setInterval(() => {
      // Only the resampled indexes get new objects, so memoised cells skip the rest.
      setCells((current) => {
        const next = current.slice();
        const resampleCount = Math.round(visibleCellCount * RESAMPLE_PROBABILITY);
        for (let i = 0; i < resampleCount; i++) {
          const index = Math.floor(Math.random() * visibleCellCount);
          next[index] = resampleCell(next[index]);
        }
        return next;
      });
    }, RESAMPLE_PERIOD_MS);
    return () => window.clearInterval(interval);
  }, [isVisible, visibleCellCount]);

  return (
    <div
      ref={gridRef}
      className="w-screen overflow-hidden"
      style={{ backgroundColor, height: rowCount * CELL_SIZE }}
      aria-hidden="true"
    >
      <div
        className="grid w-full justify-center"
        style={{ gridAutoRows: CELL_SIZE, gridTemplateColumns: `repeat(auto-fill, ${CELL_SIZE}px)` }}
      >
        {cells.slice(0, visibleCellCount).map((cell, index) => (
          <PatternGridCell
            key={index}
            appearanceThreshold={1 - (hash(index + 0x51f15e) + 1) / 0x100000000}
            color={PALETTE[cell.colorSeed < brightChance(Math.floor(index / columnCount), rowCount, rowBias) ? 1 : 0]}
            revealProgress={revealProgress}
            revision={cell.revision}
            shape={cell.shape}
          />
        ))}
      </div>
    </div>
  );
};

export default PatternGrid;
