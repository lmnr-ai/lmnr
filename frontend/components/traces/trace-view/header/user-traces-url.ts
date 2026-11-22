import { createSerializer, parseAsArrayOf, parseAsString } from "nuqs";

import { Operator } from "@/lib/actions/common/operators";

const FREE_TIER_RETENTION_DAYS = 7;

// The traces table reads `filter` through nuqs `parseAsArrayOf(parseAsString)`, which
// splits on unescaped commas — so hand-built `URLSearchParams` shred the filter JSON.
// Serialize with nuqs so the escaping matches the reader.
const serializeTracesFilterQuery = createSerializer({
  view: parseAsString,
  filter: parseAsArrayOf(parseAsString),
  pastHours: parseAsString,
});

const userFilterQuery = (userId: string, logRetentionDays?: number) => ({
  filter: [JSON.stringify({ column: "user_id", operator: Operator.Eq, value: userId, dataType: "string" })],
  pastHours: String((logRetentionDays ?? FREE_TIER_RETENTION_DAYS) * 24),
});

/** Traces table filtered to one user, over the project's full retention window. */
export const userTracesUrl = (projectId: string, userId: string, logRetentionDays?: number) =>
  `/project/${projectId}/traces${serializeTracesFilterQuery(userFilterQuery(userId, logRetentionDays))}`;

/** Sessions table (the Traces page's Sessions tab) filtered to one user. */
export const userSessionsUrl = (projectId: string, userId: string, logRetentionDays?: number) =>
  `/project/${projectId}/traces${serializeTracesFilterQuery({ view: "sessions", ...userFilterQuery(userId, logRetentionDays) })}`;
