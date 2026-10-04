import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { estimateSignalCostUsd, signalCostPerTraceUsd } from "../components/landing/pricing/signal-cost-estimate";
import { formatTokens, TOKENS_PER_RUN_STEPS } from "../components/landing/pricing/volume-inputs/steps";

const ANALYZED_TRACES = 1_000_000;

const rows = TOKENS_PER_RUN_STEPS.map((traceTokens) => ({
  traceTokens,
  costPerTraceUsd: signalCostPerTraceUsd(traceTokens),
  totalCostUsd: estimateSignalCostUsd(ANALYZED_TRACES, traceTokens, 100),
}));

const downloads = join(homedir(), "Downloads");
const csvPath = join(downloads, "signal-cost-for-1m-traces.csv");
const svgPath = join(downloads, "signal-cost-for-1m-traces.svg");
const pngPath = join(downloads, "signal-cost-for-1m-traces.png");

const csv = [
  "trace_tokens,signal_cost_per_trace_usd,total_cost_for_1m_traces_usd",
  ...rows.map((row) => [row.traceTokens, row.costPerTraceUsd, row.totalCostUsd.toFixed(8)].join(",")),
].join("\n");
writeFileSync(csvPath, `${csv}\n`);

const width = 1200;
const height = 720;
const margin = { top: 72, right: 64, bottom: 104, left: 112 };
const plotWidth = width - margin.left - margin.right;
const plotHeight = height - margin.top - margin.bottom;
const maxCost = Math.max(...rows.map((row) => row.totalCostUsd));
const yMax = Math.ceil((maxCost * 1.15) / 500) * 500;
const x = (index: number) => margin.left + (index / (rows.length - 1)) * plotWidth;
const y = (cost: number) => margin.top + plotHeight - (cost / yMax) * plotHeight;
const yTicks = Array.from({ length: 6 }, (_, index) => (yMax * index) / 5);
const points = rows.map((row, index) => `${x(index)},${y(row.totalCostUsd)}`).join(" ");

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#111214"/>
  <text x="${margin.left}" y="36" fill="#f4f4f5" font-family="Arial, sans-serif" font-size="24" font-weight="700">Signals cost to analyze 1,000,000 traces</text>
  <text x="${margin.left}" y="58" fill="#a1a1aa" font-family="Arial, sans-serif" font-size="14">Flow-1 4K-output measured median cost per trace · 100% coverage</text>
  ${yTicks
    .map(
      (tick) => `
  <line x1="${margin.left}" y1="${y(tick)}" x2="${width - margin.right}" y2="${y(tick)}" stroke="#2b2d31" stroke-width="1"/>
  <text x="${margin.left - 14}" y="${y(tick) + 5}" text-anchor="end" fill="#a1a1aa" font-family="Arial, sans-serif" font-size="13">$${tick.toLocaleString("en-US")}</text>`
    )
    .join("")}
  <line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${margin.top + plotHeight}" stroke="#62646a"/>
  <line x1="${margin.left}" y1="${margin.top + plotHeight}" x2="${width - margin.right}" y2="${margin.top + plotHeight}" stroke="#62646a"/>
  <polyline points="${points}" fill="none" stroke="#ef5da8" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>
  ${rows
    .map(
      (row, index) => `
  <circle cx="${x(index)}" cy="${y(row.totalCostUsd)}" r="6" fill="#111214" stroke="#ef5da8" stroke-width="3"/>
  <text x="${x(index)}" y="${y(row.totalCostUsd) - 14}" text-anchor="middle" fill="#f4f4f5" font-family="Arial, sans-serif" font-size="12">$${row.totalCostUsd.toLocaleString("en-US")}</text>
  <text x="${x(index)}" y="${margin.top + plotHeight + 28}" text-anchor="middle" fill="#d4d4d8" font-family="Arial, sans-serif" font-size="13">${formatTokens(row.traceTokens)}</text>`
    )
    .join("")}
  <text x="${margin.left + plotWidth / 2}" y="${height - 26}" text-anchor="middle" fill="#d4d4d8" font-family="Arial, sans-serif" font-size="15">Tokens in agent trace (calculator slider steps)</text>
  <text x="24" y="${margin.top + plotHeight / 2}" text-anchor="middle" fill="#d4d4d8" font-family="Arial, sans-serif" font-size="15" transform="rotate(-90 24 ${margin.top + plotHeight / 2})">Total Signals cost for 1M traces (USD)</text>
</svg>`;

writeFileSync(svgPath, svg);
execFileSync("magick", [svgPath, pngPath]);

console.table(
  rows.map((row) => ({
    "Trace tokens": formatTokens(row.traceTokens),
    "Cost / trace": `$${row.costPerTraceUsd.toFixed(4)}`,
    "Cost / 1M traces": `$${row.totalCostUsd.toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
  }))
);
console.log(`\nCSV: ${csvPath}\nGraph: ${pngPath}\nSVG: ${svgPath}`);
