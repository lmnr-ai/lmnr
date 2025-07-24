import { and, eq, inArray, not, SQL, sql } from "drizzle-orm";
import { keyBy, partition } from "lodash";

import { Operator } from "@/components/ui/datatable-filter/utils";
import { processFilters, processors } from "@/lib/actions/common/utils";
import { db } from "@/lib/db/drizzle";
import { labelClasses, labels, spans } from "@/lib/db/migrations/schema";
import { FilterDef, filtersToSql } from "@/lib/db/modifiers";
import { Span, SpanType, Trace } from "@/lib/traces/types";

export type TraceQueryResult = Pick<
  Trace,
  "id" | "inputTokenCount" | "outputTokenCount" | "totalTokenCount" | "inputCost" | "outputCost" | "cost" | "traceType"
> & {
  startTime: string | null;
  endTime: string | null;
  sessionId: string | null;
  status: string | null;
  userId: string | null;
  hasBrowserSession: boolean | null;
  metadata: unknown;
  projectId: string;
  latency?: number;
};

export type SpanQueryResult = Pick<Span, "traceId" | "inputPreview" | "outputPreview" | "name" | "path"> & {
  spanType: SpanType;
};

export type MergedTraceResult = Omit<TraceQueryResult, "metadata" | "startTime" | "endTime" | "sessionId"> & {
  startTime: string;
  endTime: string;
  sessionId: string;
  metadata: Record<string, string> | null;
  topSpanInputPreview: string | null;
  topSpanOutputPreview: string | null;
  topSpanPath: string | null;
  topSpanName: string | null;
  topSpanType: SpanType | null;
};

enum AllowedCastType {
  TraceType = "trace_type",
  SpanType = "span_type",
}

export const processTraceFilters = (filters: FilterDef[]) =>
  processFilters<FilterDef, SQL>(filters, {
    processors: processors<FilterDef, SQL>([
      {
        column: "tags",
        operators: [Operator.Eq, Operator.Ne],
        process: (filter) => {
          const labelName = filter.value;
          const inArrayFilter = inArray(
            sql`id`,
            db
              .select({ id: spans.traceId })
              .from(spans)
              .innerJoin(labels, eq(spans.spanId, labels.spanId))
              .innerJoin(labelClasses, eq(labels.classId, labelClasses.id))
              .where(and(eq(labelClasses.name, labelName)))
          );
          return filter.operator === "eq" ? inArrayFilter : not(inArrayFilter);
        },
      },
      {
        column: "metadata",
        operators: [Operator.Eq],
        process: (filter) => {
          const [key, value] = filter.value.split(/=(.*)/);
          return sql`metadata @> ${JSON.stringify({ [key]: value })}`;
        },
      },
      {
        column: "traceType",
        process: (filter) => filtersToSql([{ ...filter, castType: AllowedCastType.TraceType }], [], {})[0],
      },
      {
        column: "spanType",
        process: (filter) => {
          const uppercased = filter.value.toUpperCase().trim();
          const value = uppercased === "SPAN" ? "'DEFAULT'" : `'${uppercased}'`;
          return filtersToSql([{ ...filter, value, castType: AllowedCastType.SpanType }], [], {})[0];
        },
      },
      {
        column: "status",
        operators: [Operator.Eq, Operator.Ne],
        process: (filter) => {
          if (filter.value === "success") {
            return filter.operator === "eq" ? sql`status IS NULL` : sql`status IS NOT NULL`;
          } else if (filter.value === "error") {
            return filter.operator === "eq" ? sql`status = 'error'` : sql`status IS NULL`;
          }
          return sql`1=1`;
        },
      },
    ]),
    defaultProcessor: (filter) =>
      filtersToSql([filter], [], {
        latency: sql<number>`EXTRACT(EPOCH FROM (end_time - start_time))`,
      })[0] || null,
  });

export const separateFilters = (filters: FilterDef[]) => {
  const [spansFilters, tracesFilters] = partition(
    filters,
    (filter) => filter.column === "span_type" || filter.column === "name"
  );

  return { spansFilters, tracesFilters };
};

export const mergeTracesWithSpans = (
  tracesResult: { items: TraceQueryResult[]; totalCount: number },
  spansResult: SpanQueryResult[]
) => {
  const spansMap = keyBy(spansResult, "traceId");

  const mergedItems: MergedTraceResult[] = tracesResult.items.map((trace) => {
    const span = spansMap[trace.id];
    return {
      ...trace,
      startTime: trace.startTime || "",
      endTime: trace.endTime || "",
      sessionId: trace.sessionId || "",
      metadata: trace.metadata as Record<string, string> | null,
      topSpanInputPreview: span?.inputPreview ?? null,
      topSpanOutputPreview: span?.outputPreview ?? null,
      topSpanPath: span?.path ?? null,
      topSpanName: span?.name ?? null,
      topSpanType: span?.spanType ?? null,
    };
  });

  return { items: mergedItems, totalCount: tracesResult.totalCount };
};
