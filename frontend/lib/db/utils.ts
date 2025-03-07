import { and, eq, getTableColumns, gt, lt, SQL, sql } from "drizzle-orm";
import { PgTable, SelectedFields, TableConfig } from "drizzle-orm/pg-core";
import { getServerSession } from 'next-auth';

import { authOptions } from "../auth";
import { cache } from "../cache";
import { PaginatedResponse } from "../types";
import { db } from "./drizzle";
import { apiKeys, membersOfWorkspaces, projects, users } from "./migrations/schema";

export const isUserMemberOfProject = async (projectId: string, apiKey: string) => {
  const cacheKey = `project-id+user-api-key:${projectId}:${apiKey}`;
  try {
    const cachedResult = await cache.get(cacheKey);
    if (cachedResult) {
      return cachedResult;
    }
  } catch (e) {
    console.error("Error getting entry from cache", e);
  }

  const result = await db
    .select({ userId: users.id })
    .from(users)
    .innerJoin(membersOfWorkspaces, eq(users.id, membersOfWorkspaces.userId))
    .innerJoin(projects, eq(membersOfWorkspaces.workspaceId, projects.workspaceId))
    .innerJoin(apiKeys, eq(users.id, apiKeys.userId))
    .where(and(
      eq(apiKeys.apiKey, apiKey),
      eq(projects.id, projectId)
    ))
    .limit(1);

  try {
    await cache.set(cacheKey, result.length > 0);
  } catch (e) {
    console.error("Error setting entry in cache", e);
  }

  return result.length > 0;
};

export const isCurrentUserMemberOfWorkspace = async (workspaceId: string) => {
  const session = await getServerSession(authOptions);
  const user = session?.user;

  if (!user) {
    return false;
  }

  const result = await db
    .select({ userId: users.id })
    .from(users)
    .innerJoin(membersOfWorkspaces, eq(users.id, membersOfWorkspaces.userId))
    .where(and(
      eq(users.email, user.email!),
      eq(membersOfWorkspaces.workspaceId, workspaceId)
    ))
    .limit(1);

  return result.length > 0;
};

export const getDateRangeFilters = (
  startTime: string | null,
  endTime: string | null,
  pastHours: string | null
): SQL[] => {
  if (pastHours && !isNaN(parseFloat(pastHours))) {
    // sql.raw is a concious choice, because `sql` operator will bind the value as a query
    // parameter, which postgres driver will reject as it cannot infer the data type.
    return [gt(sql`start_time`, sql.raw(`NOW() - INTERVAL '${parseFloat(pastHours)} HOUR'`))];
  }
  if (startTime) {
    return [gt(sql`end_time`, startTime), lt(sql`end_time`, endTime ?? sql`NOW()`)];
  }
  return [];
};

interface PaginatedGetParams<T extends TableConfig, R> {
  table: PgTable<T>;
  pageNumber?: number;
  pageSize?: number;
  filters: SQL[];
  orderBy: SQL;
  /**
   * If provided, only these columns will be selected.
   * Useful to remove columns that are too heavy to query, or
   * to add columns to compute query time, e.g. latency.
   */
  columns?: SelectedFields;
}

export const paginatedGet = async<T extends TableConfig, R>(
  {
    table,
    pageNumber,
    pageSize,
    filters,
    orderBy,
    columns,
  }: PaginatedGetParams<T, R>
): Promise<PaginatedResponse<R>> => {

  const itemsQuery = pageNumber !== undefined && pageSize !== undefined
    ? db
      .select(columns ?? getTableColumns(table))
      .from(table)
      .where(and(...filters))
      .orderBy(orderBy)
      .limit(pageSize).offset(pageNumber * pageSize)
    : db
      .select(columns ?? getTableColumns(table))
      .from(table)
      .where(and(...filters))
      .orderBy(orderBy);

  const countQuery = async () =>
    db.select({ count: sql<number>`COUNT(*)` })
      .from(table)
      .where(and(...filters))
      .then(([{ count }]) => count);

  const [items, totalCount] = await Promise.all([
    itemsQuery,
    countQuery(),
  ]);

  return { items: items as R[], totalCount };
};
