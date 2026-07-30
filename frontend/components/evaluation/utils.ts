import { flow, get, isNumber, mean, round } from "lodash";

import { interpolateColor, normalizeValue, type RGBColor, type ScoreRange } from "@/lib/colors";
import {
  type EvalRow,
  type Evaluation,
  type EvaluationScoreDistributionBucket,
  type EvaluationScoreStatistics,
} from "@/lib/evaluation/types";

export type EvalDatapointStatus = "error" | "pending" | "success";

const NIL_UUID = "00000000-0000-0000-0000-000000000000";

export const deriveStatus = (row: EvalRow): EvalDatapointStatus => {
  if (row["traceStatus"] === "error") return "error";

  const scores = get(row, "scores");
  const hasScoresString = typeof scores === "string" && scores.length > 0 && scores !== "{}";
  const hasFlattenedScores = Object.keys(row).some((k) => k.startsWith("score:") && row[k] != null);
  if (!hasScoresString && !hasFlattenedScores) return "pending";

  const topSpanId = get(row, "topSpanId");
  if (typeof topSpanId !== "string" || topSpanId === "" || topSpanId === NIL_UUID) {
    return "pending";
  }
  return "success";
};

/**
 * Explode a `{name: number}` JSON string into `{score:<name>: number}` keys.
 */
export const flattenScores = (scores: unknown): Record<string, number> => {
  if (typeof scores !== "string" || scores.length === 0) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(scores);
  } catch {
    return {};
  }
  if (parsed == null || typeof parsed !== "object") return {};
  const out: Record<string, number> = {};
  for (const [name, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof value === "number" && Number.isFinite(value)) {
      out[`score:${name}`] = value;
    }
  }
  return out;
};

/**
 * Server-computed stats payload returned by `/api/.../evaluations/[id]/stats`.
 * Score names are NOT returned here — they live in the eval store
 * (`useEvalStore.scoreNames`), seeded from the server-side
 * `getEvaluationScoreNames` and updated by realtime events.
 */
export type EvaluationStatsPayload = {
  evaluation: Evaluation;
  allStatistics: Record<string, EvaluationScoreStatistics>;
  allDistributions: Record<string, EvaluationScoreDistributionBucket[]>;
};

export type ScoreRanges = Record<string, ScoreRange>;
export type ScoreValue = number | undefined;
export type DisplayValue = string | number;

export const formatCostIntl = (cost: number): string =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumSignificantDigits: 5,
  }).format(cost);

export const calculatePercentageChange = (original: number, compared: number): string =>
  round(((original - compared) / compared) * 100, 2).toFixed(2);

export const formatScoreValue = (value: number) => {
  if (value === 0) return "0";

  const absValue = Math.abs(value);
  if (absValue >= 100) return round(value).toString();
  if (absValue >= 1) return round(value, 2).toString();
  return value.toPrecision(3);
};

export const isValidScore = (value: unknown): value is number => isNumber(value) && !isNaN(value) && isFinite(value);

const SCORE_COLORS = {
  red: [204, 51, 51] as RGBColor, // Pure, vivid red (poor scores)
  yellow: [245, 158, 11] as RGBColor, // amber-500 (average scores)
  green: [34, 197, 94] as RGBColor, // green-500 (good scores)
  gray: [243, 244, 246] as RGBColor, // gray-100 (fallback)
} as const;

const getColorByNormalizedValue = (normalized: number): RGBColor => {
  const { red, yellow, green } = SCORE_COLORS;

  if (normalized <= 0.5) {
    // Red to yellow transition (0 to 0.5)
    const factor = normalized * 2;
    return interpolateColor(red, yellow, factor);
  } else {
    // Yellow to green transition (0.5 to 1)
    const factor = (normalized - 0.5) * 2;
    return interpolateColor(yellow, green, factor);
  }
};

const getScoreBackgroundColor = (min: number, max: number, value: number, isHigherBetter = true): RGBColor => {
  if (min === max) return SCORE_COLORS.gray;

  // When lower is better, reflect the normalized position about the midpoint so
  // the "good" end of the range maps to green regardless of magnitude.
  const toColor = (n: number) => getColorByNormalizedValue(isHigherBetter ? n : 1 - n);
  return flow((val: number) => normalizeValue(min, max, val), toColor)(value);
};

const hasSignificantRange = ({ min, max }: ScoreRange): boolean => {
  const range = max - min;
  const avgValue = mean([min, max]);

  return !(min === max || (avgValue !== 0 && Math.abs(range / avgValue) < 0.01) || Math.abs(range) < 0.001);
};

export const shouldShowHeatmap = (range: ScoreRange): boolean => hasSignificantRange(range);

/**
 * Merge a realtime `datapoint_upsert` payload into the existing rows array.
 *
 * Updates an existing row in place if it matches by id; otherwise inserts the
 * new row at the position implied by `index` (datapoints are conventionally
 * rendered ascending by index).
 */
export const mergeDatapointUpsertIntoRows = (
  rows: EvalRow[],
  incoming: EvalRow & { id: string },
  flattened: Record<string, number>
): EvalRow[] => {
  const idx = rows.findIndex((r) => r["id"] === incoming.id);
  if (idx !== -1) {
    const next = [...rows];
    next[idx] = { ...next[idx], ...incoming, ...flattened };
    return next;
  }
  const seeded: EvalRow = { ...incoming, ...flattened };
  const incomingIndex = Number(seeded["index"] ?? Number.POSITIVE_INFINITY);
  const insertAt = rows.findIndex((r) => Number(r["index"] ?? -1) > incomingIndex);
  if (insertAt === -1) return [...rows, seeded];
  const next = [...rows];
  next.splice(insertAt, 0, seeded);
  return next;
};

// Accumulate a `trace_update` delta onto the matching row (no-op if not yet
// fetched).
export const mergeTraceUpdateIntoRows = (
  rows: EvalRow[],
  trace: Record<string, unknown> & { id: string }
): EvalRow[] => {
  const idx = rows.findIndex((r) => r["traceId"] === trace.id);
  if (idx === -1) return rows;

  const prev = rows[idx];
  const num = (key: string): number => Number(prev[key] ?? 0) + Number(trace[key] ?? 0);

  const inputCost = num("inputCost");
  const outputCost = num("outputCost");
  const totalCost = num("totalCost");
  const sumCost = inputCost + outputCost;
  const cost = totalCost > 0 ? Math.max(sumCost, totalCost) : sumCost;

  const startTime = minIso(prev["startTime"] as string | undefined, trace["startTime"] as string | undefined);
  const endTime = maxIso(prev["endTime"] as string | undefined, trace["endTime"] as string | undefined);
  const duration = startTime && endTime ? (Date.parse(endTime) - Date.parse(startTime)) / 1000 : undefined;

  const status =
    prev["traceStatus"] === "error" || trace["status"] === "error" ? "error" : (trace["status"] ?? prev["traceStatus"]);

  const next = [...rows];
  next[idx] = {
    ...prev,
    cost,
    inputCost,
    outputCost,
    totalCost,
    inputTokens: num("inputTokens"),
    outputTokens: num("outputTokens"),
    totalTokens: num("totalTokens"),
    cacheReadInputTokens: num("cacheReadInputTokens"),
    cacheCreationInputTokens: num("cacheCreationInputTokens"),
    reasoningTokens: num("reasoningTokens"),
    traceStatus: status,
    topSpanId: trace["topSpanId"] ?? prev["topSpanId"],
    startTime,
    endTime,
    ...(duration != null ? { duration } : {}),
  };
  return next;
};

const minIso = (a: string | undefined, b: string | undefined): string | undefined => {
  if (!a) return b;
  if (!b) return a;
  return Date.parse(b) < Date.parse(a) ? b : a;
};

const maxIso = (a: string | undefined, b: string | undefined): string | undefined => {
  if (!a) return b;
  if (!b) return a;
  return Date.parse(b) > Date.parse(a) ? b : a;
};

// rgb(...) string for the heatmap color, or null when the range is too narrow
// to be meaningful — callers treat null as "render the plain number".
// `isHigherBetter` (default true) inverts the gradient for lower-is-better scores.
export const getHeatmapColor = (value: number, { min, max }: ScoreRange, isHigherBetter = true): string | null => {
  if (!shouldShowHeatmap({ min, max })) return null;
  const [r, g, b] = getScoreBackgroundColor(min, max, value, isHigherBetter);
  return `rgb(${r}, ${g}, ${b})`;
};
