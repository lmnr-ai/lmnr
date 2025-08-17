import { and, desc, eq, getTableColumns, sql } from "drizzle-orm";
import { compact } from "lodash";
import { z } from "zod/v4";

import { PaginationFiltersSchema, TimeRangeSchema } from "@/lib/actions/common/types";
import { processEventFilters } from "@/lib/actions/events/utils";
import { db } from "@/lib/db/drizzle";
import { events } from "@/lib/db/migrations/schema";
import { FilterDef } from "@/lib/db/modifiers";
import { getDateRangeFilters } from "@/lib/db/utils";

export const GetEventsSchema = PaginationFiltersSchema.extend({
  ...TimeRangeSchema.shape,
  projectId: z.string(),
  search: z.string().nullable().optional(),
});

export async function getEvents(input: z.infer<typeof GetEventsSchema>) {
  const {
    projectId,
    pastHours,
    startDate: startTime,
    endDate: endTime,
    pageNumber,
    pageSize,
    search,
    filter: inputFilters,
  } = input;

  const urlParamFilters: FilterDef[] = compact(inputFilters);
  const processedFilters = processEventFilters(urlParamFilters);

  const baseFilters = [eq(events.projectId, projectId)];

  const textSearchFilters = search
    ? [sql`(name ILIKE ${`%${search}%`} OR attributes::text ILIKE ${`%${search}%`})`]
    : [];

  const allSqlFilters = [
    ...getDateRangeFilters(startTime || null, endTime || null, pastHours || null, events.timestamp),
    ...processedFilters,
    ...textSearchFilters,
  ];
  const columns = getTableColumns(events);

  const baseQuery = db
    .select({
      ...columns,
      attributes: sql<Record<string, any>>`attributes`.as("attributes"),
    })
    .from(events)
    .where(and(...baseFilters.concat(allSqlFilters)))
    .orderBy(desc(events.timestamp))
    .limit(pageSize)
    .offset(pageNumber * pageSize);

  const countQuery = db
    .select({
      totalCount: sql<number>`COUNT(*)`.as("total_count"),
    })
    .from(events)
    .where(and(...baseFilters.concat(allSqlFilters)));

  const [items, totalCount] = await Promise.all([baseQuery, countQuery]);

  return { items, totalCount: totalCount[0].totalCount };
}
