import { z } from "zod/v4";

import { AUDIT_ACTIONS, AUDIT_OUTCOMES, AUDIT_RESOURCES, AUDIT_SOURCES } from "@/lib/audit/events";
import { clickhouseClient } from "@/lib/clickhouse/client";

import { AUDIT_EXPORT_MAX_ROWS, type AuditLogEvent } from "./types";

export { AUDIT_EXPORT_MAX_ROWS, type AuditLogEvent } from "./types";

// Filterable columns. `enum` columns take one of a fixed vocabulary; `string`
// columns also allow substring matching.
const FILTER_COLUMNS = {
  actor_label: { type: "string" },
  project_name: { type: "string" },
  resource_label: { type: "string" },
  resource_id: { type: "string" },
  resource_type: { type: "enum", values: AUDIT_RESOURCES },
  action: { type: "enum", values: AUDIT_ACTIONS },
  source: { type: "enum", values: AUDIT_SOURCES },
  outcome: { type: "enum", values: AUDIT_OUTCOMES },
  actor_type: { type: "enum", values: ["user", "api_key"] },
  actor_role: { type: "enum", values: ["owner", "admin", "member"] },
} as const satisfies Record<string, { type: "string" } | { type: "enum"; values: readonly string[] }>;

type FilterColumn = keyof typeof FILTER_COLUMNS;

const AuditFilterSchema = z.object({
  column: z.enum(Object.keys(FILTER_COLUMNS) as [FilterColumn, ...FilterColumn[]]),
  operator: z.enum(["eq", "ne", "includes"]),
  value: z.string().min(1),
});

export type AuditFilter = z.infer<typeof AuditFilterSchema>;

const AuditEventsQuerySchema = z.object({
  workspaceId: z.guid(),
  filters: z.array(AuditFilterSchema).default([]),
  projectId: z.guid().optional(),
  pastHours: z.coerce.number().int().min(1).optional(),
  startDate: z.iso.datetime().optional(),
  endDate: z.iso.datetime().optional(),
});

export const GetAuditEventsSchema = AuditEventsQuerySchema.extend({
  pageNumber: z.coerce.number().int().min(0).default(0),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

// Each export query sorts at most this many full rows: a single 100k-row query needs over
// 1 GB of ClickHouse memory once rows carry 16 KB of SQL in `metadata`.
const EXPORT_PAGE_SIZE = 5_000;

// Each filter binds its value as a query parameter; column names come only from FILTER_COLUMNS.
const filterCondition = (filter: AuditFilter, index: number): string => {
  const param = `f${index}`;
  if (filter.operator === "includes") {
    return `positionCaseInsensitive(${filter.column}, {${param}:String}) > 0`;
  }
  return `${filter.column} ${filter.operator === "eq" ? "=" : "!="} {${param}:String}`;
};

const buildWhere = (input: z.output<typeof AuditEventsQuerySchema>) => {
  const { workspaceId, filters, projectId, pastHours, startDate, endDate } = input;
  const usable = filters.filter((f) => {
    const column = FILTER_COLUMNS[f.column];
    if (column.type === "enum") {
      return f.operator !== "includes" && (column.values as readonly string[]).includes(f.value);
    }
    return true;
  });

  const conditions = ["workspace_id = {workspaceId:UUID}", ...usable.map(filterCondition)];
  const params: Record<string, string | number> = { workspaceId };
  usable.forEach((f, i) => (params[`f${i}`] = f.value));
  if (projectId) {
    conditions.push("project_id = {projectId:UUID}");
    params.projectId = projectId;
  }
  // An absolute range wins over a relative one, matching the date range picker.
  if (startDate && endDate) {
    conditions.push("audit_events.timestamp >= parseDateTime64BestEffort({startDate:String}, 9)");
    conditions.push("audit_events.timestamp <= parseDateTime64BestEffort({endDate:String}, 9)");
    params.startDate = startDate;
    params.endDate = endDate;
  } else if (pastHours) {
    conditions.push("audit_events.timestamp >= now64(9) - toIntervalHour({pastHours:UInt32})");
    params.pastHours = pastHours;
  }
  return { where: conditions.join(" AND "), params };
};

// Qualified: the queries alias a formatted string as `timestamp`, which would shadow the column.
const ORDER = "ORDER BY audit_events.timestamp DESC, event_id DESC";

export const getAuditEvents = async (
  input: z.input<typeof GetAuditEventsSchema>
): Promise<{ items: AuditLogEvent[] }> => {
  const parsed = GetAuditEventsSchema.parse(input);
  const { where, params } = buildWhere(parsed);

  const result = await clickhouseClient.query({
    query: `
      SELECT
        event_id AS eventId,
        formatDateTime(timestamp, '%Y-%m-%dT%H:%i:%S.%fZ', 'UTC') AS timestamp,
        if(project_id = toUUID('00000000-0000-0000-0000-000000000000'), NULL, toString(project_id)) AS projectId,
        project_name AS projectName,
        actor_type AS actorType,
        actor_id AS actorId,
        actor_label AS actorLabel,
        actor_role AS actorRole,
        actor_owner_label AS actorOwnerLabel,
        source,
        resource_type AS resourceType,
        action,
        resource_id AS resourceId,
        resource_label AS resourceLabel,
        outcome,
        ip,
        user_agent AS userAgent,
        metadata
      FROM audit_events FINAL
      WHERE ${where}
      ${ORDER}
      LIMIT {limit:UInt32} OFFSET {offset:UInt32}
    `,
    format: "JSONEachRow",
    query_params: { ...params, limit: parsed.pageSize, offset: parsed.pageNumber * parsed.pageSize },
  });

  return { items: await result.json<AuditLogEvent>() };
};

const EXPORT_COLUMNS = [
  "timestamp",
  "project",
  "actor_type",
  "actor",
  "actor_role",
  "api_key_created_by",
  "source",
  "resource_type",
  "action",
  "resource_label",
  "resource_id",
  "outcome",
  "ip",
  "user_agent",
  "metadata",
  "event_id",
] as const;

type ExportRow = Record<(typeof EXPORT_COLUMNS)[number] | "cursor_ts", string>;

// A leading formula character is escaped so a spreadsheet shows a user-chosen name instead of evaluating it.
const csvField = (value: string) => {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
};

const csvLine = (values: readonly string[]) => values.map(csvField).join(",") + "\n";

/** The matching events as CSV (header row first), newest first, capped at `AUDIT_EXPORT_MAX_ROWS`. */
export const exportAuditEventsCsv = async (
  input: z.input<typeof AuditEventsQuerySchema>
): Promise<ReadableStream<Uint8Array>> => {
  const { where, params } = buildWhere(AuditEventsQuerySchema.parse(input));
  let cursor: { ts: string; id: string } | undefined;
  let sent = 0;

  // Keyset pages: each continues strictly after the last row of the previous one.
  const fetchPage = async () => {
    const result = await clickhouseClient.query({
      query: `
        SELECT
          formatDateTime(timestamp, '%Y-%m-%dT%H:%i:%S.%fZ', 'UTC') AS timestamp,
          project_name AS project,
          actor_type,
          actor_label AS actor,
          actor_role,
          actor_owner_label AS api_key_created_by,
          source,
          resource_type,
          action,
          resource_label,
          resource_id,
          outcome,
          ip,
          user_agent,
          metadata,
          event_id,
          toString(toUnixTimestamp64Nano(audit_events.timestamp)) AS cursor_ts
        FROM audit_events FINAL
        WHERE ${where}
        ${cursor ? "AND (audit_events.timestamp, event_id) < (fromUnixTimestamp64Nano({cursorTs:Int64}), {cursorId:UUID})" : ""}
        ${ORDER}
        LIMIT {limit:UInt32}
      `,
      format: "JSONEachRow",
      query_params: {
        ...params,
        ...(cursor && { cursorTs: cursor.ts, cursorId: cursor.id }),
        limit: Math.min(EXPORT_PAGE_SIZE, AUDIT_EXPORT_MAX_ROWS - sent),
      },
    });
    return result.json<ExportRow>();
  };

  const encoder = new TextEncoder();
  // Fetched up front so a failing query is an error response rather than a broken download.
  let page = await fetchPage();
  // `pull` runs only when the client has read what was sent, so a slow download holds one page.
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(csvLine(EXPORT_COLUMNS)));
    },
    async pull(controller) {
      try {
        sent += page.length;
        if (page.length > 0) {
          controller.enqueue(encoder.encode(page.map((row) => csvLine(EXPORT_COLUMNS.map((c) => row[c]))).join("")));
        }
        const last = page.at(-1);
        if (!last || page.length < EXPORT_PAGE_SIZE || sent >= AUDIT_EXPORT_MAX_ROWS) {
          controller.close();
          return;
        }
        cursor = { ts: last.cursor_ts, id: last.event_id };
        page = await fetchPage();
      } catch (error) {
        controller.error(error);
      }
    },
  });
};
