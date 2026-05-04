import { z } from "zod/v4";

import { FilterSchemaRelaxed } from "@/lib/actions/common/filters";
import { executeQuery } from "@/lib/actions/sql";

export const SignalEstimateWindow = z.enum(["day", "month"]);
export type SignalEstimateWindow = z.infer<typeof SignalEstimateWindow>;

const TriggerInputSchema = z.object({
  filters: z.array(FilterSchemaRelaxed),
  mode: z.number().int().default(0),
});

export const GetSignalRunEstimateSchema = z.object({
  projectId: z.guid(),
  window: SignalEstimateWindow,
  triggers: z.array(TriggerInputSchema),
});

export type SignalRunEstimate = {
  window: SignalEstimateWindow;
  estimatedRuns: number;
  tracesChecked: number;
  perTrigger: { estimatedMatches: number; filterCount: number; mode: number }[];
};

type Filter = z.infer<typeof FilterSchemaRelaxed>;

const WINDOW_HOURS: Record<SignalEstimateWindow, number> = {
  day: 24,
  month: 24 * 30,
};

const WINDOW_LABEL: Record<SignalEstimateWindow, string> = {
  day: "1 day",
  month: "1 month",
};

/**
 * Convert a single trigger filter into a ClickHouse SQL fragment against the
 * `traces` view. Returns null when the filter cannot be translated (the caller
 * treats a null fragment as "cannot match" so the whole trigger is skipped).
 *
 * Mirrors the semantics of `Trace::evaluate_single_filter` in
 * `app-server/src/db/trace.rs`.
 */
const filterToSql = (filter: Filter, paramKey: string): { sql: string; params: Record<string, any> } | null => {
  const { column, operator, value } = filter;

  switch (column) {
    case "span_name": {
      if (operator !== "eq" && operator !== "ne") return null;
      const hasExpr = `has(span_names, {${paramKey}:String})`;
      return {
        sql: operator === "eq" ? hasExpr : `NOT ${hasExpr}`,
        params: { [paramKey]: String(value) },
      };
    }
    case "status": {
      if (operator !== "eq" && operator !== "ne") return null;
      const op = operator === "eq" ? "=" : "!=";
      return {
        sql: `status ${op} {${paramKey}:String}`,
        params: { [paramKey]: String(value) },
      };
    }
    case "root_span_finished": {
      // Rust `evaluate_single_filter` returns `self.top_span_id.is_some()` for
      // this column regardless of operator/value — the UI only exposes
      // `eq true` today, so we match the backend behavior verbatim.
      return {
        sql: `top_span_id != toUUID('00000000-0000-0000-0000-000000000000')`,
        params: {},
      };
    }
    case "total_token_count": {
      const opMap: Record<string, string> = { eq: "=", ne: "!=", gt: ">", gte: ">=", lt: "<", lte: "<=" };
      const opSql = opMap[operator];
      if (!opSql) return null;
      const num = Number(value);
      if (Number.isNaN(num)) return null;
      return {
        sql: `total_tokens ${opSql} {${paramKey}:Int64}`,
        params: { [paramKey]: num },
      };
    }
    default:
      return null;
  }
};

const triggerToSql = (filters: Filter[], prefix: string): { sql: string | null; params: Record<string, any> } => {
  const allParts: string[] = [];
  const allParams: Record<string, any> = {};
  for (let i = 0; i < filters.length; i++) {
    const part = filterToSql(filters[i], `${prefix}_${i}`);
    if (!part) return { sql: null, params: {} };
    allParts.push(`(${part.sql})`);
    Object.assign(allParams, part.params);
  }
  if (allParts.length === 0) return { sql: null, params: {} };
  return { sql: allParts.join(" AND "), params: allParams };
};

export class NotEnoughDataError extends Error {
  constructor(
    public readonly window: SignalEstimateWindow,
    public readonly oldestTraceAt: string | null
  ) {
    super(
      oldestTraceAt
        ? `Not enough historical data: oldest trace is newer than ${WINDOW_LABEL[window]}.`
        : `Not enough historical data: no traces found in this project.`
    );
    this.name = "NotEnoughDataError";
  }
}

export async function getSignalRunEstimate(
  input: z.infer<typeof GetSignalRunEstimateSchema>
): Promise<SignalRunEstimate> {
  const { projectId, window, triggers } = GetSignalRunEstimateSchema.parse(input);

  const hours = WINDOW_HOURS[window];

  // Verify we have enough history: find the oldest trace in this project,
  // and bail out if it's newer than the requested window.
  const oldest = await executeQuery<{ oldest: string | null }>({
    projectId,
    query: `
      SELECT formatDateTime(min(start_time), '%Y-%m-%dT%H:%i:%S.%fZ') as oldest
      FROM traces
      WHERE trace_type = 'DEFAULT'
    `,
    parameters: {},
  });
  const oldestStr = oldest[0]?.oldest ?? null;
  if (!oldestStr) {
    throw new NotEnoughDataError(window, null);
  }
  const oldestMs = new Date(oldestStr).getTime();
  const windowStartMs = Date.now() - hours * 60 * 60 * 1000;
  if (Number.isNaN(oldestMs) || oldestMs > windowStartMs) {
    throw new NotEnoughDataError(window, oldestStr);
  }

  const tracesCheckedResult = await executeQuery<{ count: string | number }>({
    projectId,
    query: `
      SELECT count() as count
      FROM traces
      WHERE trace_type = 'DEFAULT'
        AND start_time >= now() - INTERVAL {pastHours:UInt32} HOUR
    `,
    parameters: { pastHours: hours },
  });
  const tracesChecked = Number(tracesCheckedResult[0]?.count ?? 0);

  const perTrigger: SignalRunEstimate["perTrigger"] = [];
  for (let i = 0; i < triggers.length; i++) {
    const trigger = triggers[i];
    const filterCount = trigger.filters.length;
    if (filterCount === 0) {
      perTrigger.push({ estimatedMatches: 0, filterCount: 0, mode: trigger.mode });
      continue;
    }

    const { sql, params } = triggerToSql(trigger.filters, `t${i}`);
    if (!sql) {
      // Unsupported filter in this trigger — report zero but keep the count so
      // the UI can still render the trigger. This matches the Rust behavior of
      // returning `false` for unknown columns/operators.
      perTrigger.push({ estimatedMatches: 0, filterCount, mode: trigger.mode });
      continue;
    }

    const result = await executeQuery<{ count: string | number }>({
      projectId,
      query: `
        SELECT count() as count
        FROM traces
        WHERE trace_type = 'DEFAULT'
          AND start_time >= now() - INTERVAL {pastHours:UInt32} HOUR
          AND ${sql}
      `,
      parameters: { pastHours: hours, ...params },
    });
    perTrigger.push({
      estimatedMatches: Number(result[0]?.count ?? 0),
      filterCount,
      mode: trigger.mode,
    });
  }

  // Each trigger runs the signal once per matched trace. Realtime mode (1) is
  // billed as 2 runs; batch mode (0) as 1 (see triggers-section.tsx copy).
  const estimatedRuns = perTrigger.reduce((acc, t) => acc + t.estimatedMatches * (t.mode === 1 ? 2 : 1), 0);

  return {
    window,
    estimatedRuns,
    tracesChecked,
    perTrigger,
  };
}
