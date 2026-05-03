import { flow, get, isNumber, mean, round } from "lodash";

import { getOptimalTextColor, interpolateColor, normalizeValue, type RGBColor, type ScoreRange } from "@/lib/colors";
import {
  type EvalRow,
  type Evaluation,
  type EvaluationScoreAnalysis,
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
  allScoreAnalyses: Record<string, EvaluationScoreAnalysis>;
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

const getScoreBackgroundColor = (min: number, max: number, value: number): RGBColor => {
  if (min === max) return SCORE_COLORS.gray;

  return flow((val: number) => normalizeValue(min, max, val), getColorByNormalizedValue)(value);
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

/**
 * Merge a realtime `trace_update` payload into the row whose `traceId`
 * matches. No-op for rows that haven't been fetched yet.
 */
export const mergeTraceUpdateIntoRows = (
  rows: EvalRow[],
  trace: Record<string, unknown> & { id: string }
): EvalRow[] => {
  const idx = rows.findIndex((r) => r["traceId"] === trace.id);
  if (idx === -1) return rows;

  const totalCost = Number(trace["totalCost"] ?? 0);
  const inputCost = Number(trace["inputCost"] ?? 0);
  const outputCost = Number(trace["outputCost"] ?? 0);
  const sumCost = inputCost + outputCost;
  const cost = totalCost > 0 ? Math.max(sumCost, totalCost) : sumCost;
  const startTime = trace["startTime"] as string | undefined;
  const endTime = trace["endTime"] as string | undefined;
  const duration = startTime && endTime ? (Date.parse(endTime) - Date.parse(startTime)) / 1000 : undefined;

  const next = [...rows];
  next[idx] = {
    ...next[idx],
    cost,
    inputCost,
    outputCost,
    totalCost,
    inputTokens: trace["inputTokens"],
    outputTokens: trace["outputTokens"],
    totalTokens: trace["totalTokens"],
    traceStatus: trace["status"],
    topSpanId: trace["topSpanId"],
    startTime,
    endTime,
    ...(duration != null ? { duration } : {}),
  };
  return next;
};

export const createHeatmapStyle = (value: number, { min, max }: ScoreRange) => {
  if (!shouldShowHeatmap({ min, max })) {
    return {
      background: "transparent",
      color: "inherit",
    };
  }

  const bgColor = getScoreBackgroundColor(min, max, value);

  return {
    background: `rgb(${bgColor.join(", ")})`,
    color: getOptimalTextColor(bgColor),
  };
};
