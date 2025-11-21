import { and, getTableColumns, SQL, sql } from "drizzle-orm";
import { PgTable, SelectedFields, TableConfig } from "drizzle-orm/pg-core";

import { PaginatedResponse } from "../types";
import { db } from "./drizzle";

interface PaginatedGetParams<T extends TableConfig, R> {
  table: PgTable<T>;
  pageNumber?: number;
  pageSize?: number;
  filters: SQL[];
  orderBy: SQL[];
  /**
   * If provided, only these columns will be selected.
   * Useful to remove columns that are too heavy to query, or
   * to add columns to compute query time, e.g. latency.
   */
  columns?: SelectedFields;
}

export const paginatedGet = async <T extends TableConfig, R>({
  table,
  pageNumber,
  pageSize,
  filters,
  orderBy,
  columns,
}: PaginatedGetParams<T, R>): Promise<PaginatedResponse<R>> => {
  const itemsQuery =
    pageNumber !== undefined && pageSize !== undefined
      ? db
        .select(columns ?? getTableColumns(table))
        .from(table)
        .where(and(...filters))
        .orderBy(...orderBy)
        .limit(pageSize)
        .offset(pageNumber * pageSize)
      : db
        .select(columns ?? getTableColumns(table))
        .from(table)
        .where(and(...filters))
        .orderBy(...orderBy);

  const countQuery = async () =>
    db
      .select({ count: sql<string>`COUNT(*)` })
      .from(table)
      .where(and(...filters))
      .then(([{ count }]) => parseInt(count, 10));

  const [items, totalCount] = await Promise.all([itemsQuery, countQuery()]);

  return { items: items as R[], totalCount };
};
