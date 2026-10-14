"use client";

import { animate, useInView, useMotionValue } from "framer-motion";
import { useEffect, useRef, useState } from "react";

import PatternGridCell from "./pattern-grid-cell";

const CELL_SIZE = 24;
const DEFAULT_COLUMN_COUNT = 80;
const MAX_CELL_COUNT = 5000;
const PALETTE = ["#2e2e2e", "#494949"] as const;
const SHAPE_COUNT = 3;
const VARIANT_COUNT = PALETTE.length * SHAPE_COUNT;
const RESAMPLE_PERIOD_MS = 100;
const RESAMPLE_PROBABILITY = 0.04;

interface Cell {
  colorIndex: number;
  revision: number;
  shape: number;
}

const hash = (value: number) => {
  let result = value + 0x6d2b79f5;
  result = Math.imul(result ^ (result >>> 15), result | 1);
  result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
  return (result ^ (result >>> 14)) >>> 0;
};

const toCell = (variant: number, revision: number): Cell => ({
  colorIndex: variant % PALETTE.length,
  revision,
  shape: Math.floor(variant / PALETTE.length),
});

const createInitialCells = () =>
  Array.from({ length: MAX_CELL_COUNT }, (_, index) => toCell(hash(index) % VARIANT_COUNT, 0));

// Always picks a different shape/color so every resample is visible.
const resampleCell = (cell: Cell): Cell => {
  const currentVariant = cell.shape * PALETTE.length + cell.colorIndex;
  let nextVariant = Math.floor(Math.random() * (VARIANT_COUNT - 1));
  if (nextVariant >= currentVariant) nextVariant += 1;
  return toCell(nextVariant, cell.revision + 1);
};

interface Props {
  backgroundColor?: string;
  /** Seconds for the cells to pop in once the grid scrolls into view. */
  revealDuration: number;
  rowCount: number;
}

const PatternGrid = ({ backgroundColor = "transparent", revealDuration, rowCount }: Props) => {
  const gridRef = useRef<HTMLDivElement>(null);
  const [columnCount, setColumnCount] = useState(DEFAULT_COLUMN_COUNT);
  const [cells, setCells] = useState(createInitialCells);
  // Time-based, not scroll-linked, so a fast scroll to the bottom still sees the whole reveal.
  const revealProgress = useMotionValue(0);
  const isInView = useInView(gridRef, { once: true });

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

  useEffect(() => {
    if (!isInView) return;
    const interval = window.setInterval(() => {
      setCells((current) => current.map((cell) => (Math.random() < RESAMPLE_PROBABILITY ? resampleCell(cell) : cell)));
    }, RESAMPLE_PERIOD_MS);
    return () => window.clearInterval(interval);
  }, [isInView]);

  const visibleCellCount = Math.min(MAX_CELL_COUNT, columnCount * rowCount);

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
            color={PALETTE[cell.colorIndex]}
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
