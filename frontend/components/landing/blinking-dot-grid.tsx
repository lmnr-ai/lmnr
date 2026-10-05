"use client";

import { useEffect, useState } from "react";

const COLUMNS = 256;
const ROWS = 3;
const CELL_COUNT = COLUMNS * ROWS;
const BLUE_DENSITY = 0.2;
const CHANGE_PROBABILITY = 0.4;
const ISOLATION_WEIGHT = 9.25;
const SEED = 209;

function hash(cell: number, channel: number) {
  let value = (SEED ^ Math.imul(cell + 1, 0x9e3779b1) ^ Math.imul(channel + 1, 0x85ebca6b)) | 0;
  value = Math.imul(value ^ (value >>> 16), 0x21f0aaad);
  value = Math.imul(value ^ (value >>> 15), 0x735a2d97);
  return ((value ^ (value >>> 15)) >>> 0) / 4294967296;
}

function neighborFraction(states: readonly boolean[], cell: number) {
  const row = Math.floor(cell / COLUMNS);
  const column = cell % COLUMNS;
  let neighbors = 0;
  let blueNeighbors = 0;

  for (const [rowOffset, columnOffset] of [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ] as const) {
    const nextRow = row + rowOffset;
    const nextColumn = column + columnOffset;
    if (nextRow < 0 || nextRow >= ROWS || nextColumn < 0 || nextColumn >= COLUMNS) continue;
    neighbors++;
    if (states[nextRow * COLUMNS + nextColumn]) blueNeighbors++;
  }

  return neighbors === 0 ? 0 : blueNeighbors / neighbors;
}

function spatialProbabilities(states: readonly boolean[]) {
  const targetSum = states.length * BLUE_DENSITY;
  const baseLogit = Math.log(BLUE_DENSITY / (1 - BLUE_DENSITY));
  const scores = states.map((_, cell) => -neighborFraction(states, cell));
  let low = -40;
  let high = 40;

  for (let iteration = 0; iteration < 48; iteration++) {
    const offset = (low + high) / 2;
    const sum = scores.reduce(
      (total, score) => total + 1 / (1 + Math.exp(-(baseLogit + offset + ISOLATION_WEIGHT * score))),
      0
    );
    if (sum < targetSum) low = offset;
    else high = offset;
  }

  const offset = (low + high) / 2;
  return scores.map((score) => 1 / (1 + Math.exp(-(baseLogit + offset + ISOLATION_WEIGHT * score))));
}

function nextStates(states: readonly boolean[], tick: number) {
  const probabilities = spatialProbabilities(states);
  return states.map((isBlue, cell) => {
    const directionalProbability = isBlue ? 1 - probabilities[cell] : probabilities[cell];
    return hash(cell, 10 + tick) < CHANGE_PROBABILITY * directionalProbability ? !isBlue : isBlue;
  });
}

export default function BlinkingDotGrid() {
  const [blueDots, setBlueDots] = useState(() =>
    Array.from({ length: CELL_COUNT }, (_, cell) => hash(cell, 0) < BLUE_DENSITY)
  );

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let tick = 1;
    const interval = window.setInterval(() => {
      setBlueDots((states) => nextStates(states, tick++));
    }, 250);

    return () => window.clearInterval(interval);
  }, []);

  return blueDots.map((isBlue, cell) => {
    const row = Math.floor(cell / COLUMNS);
    const column = cell % COLUMNS;
    return (
      <span
        key={cell}
        className={`absolute size-1 translate-x-1/2 -translate-y-1/2 rounded-full transition-colors duration-150 ${isBlue ? "bg-[#8fbbfe]" : "bg-[#4e4e4e]"}`}
        style={{ right: column * 18 + 9, top: row * 17 + 3 }}
      />
    );
  });
}
