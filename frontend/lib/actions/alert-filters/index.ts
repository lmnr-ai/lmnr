import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod/v4";

import { type Filter, FilterSchema } from "@/lib/actions/common/filters";
import { ALERT_FILTERS_CACHE_KEY, cache } from "@/lib/cache.ts";
import { db } from "@/lib/db/drizzle";
import { alertFilters } from "@/lib/db/migrations/schema";

export type AlertFilter = {
  id: string;
  filters: Filter[];
  createdAt?: string;
};

export const GetAlertFiltersSchema = z.object({
  projectId: z.guid(),
  alertId: z.guid(),
});

export const CreateAlertFilterSchema = z.object({
  projectId: z.guid(),
  alertId: z.guid(),
  filters: z.array(FilterSchema).min(1, "At least one condition is required"),
});

export const UpdateAlertFilterSchema = z.object({
  projectId: z.guid(),
  alertId: z.guid(),
  filterId: z.guid(),
  filters: z.array(FilterSchema).min(1, "At least one condition is required"),
});

export const DeleteAlertFiltersSchema = z.object({
  projectId: z.guid(),
  alertId: z.guid(),
  filterIds: z.array(z.guid()).min(1, "At least one filter ID is required"),
});

export async function getAlertFilters(input: z.infer<typeof GetAlertFiltersSchema>) {
  const { projectId, alertId } = GetAlertFiltersSchema.parse(input);

  const rows = (await db
    .select({
      id: alertFilters.id,
      value: alertFilters.value,
      createdAt: alertFilters.createdAt,
    })
    .from(alertFilters)
    .where(and(eq(alertFilters.projectId, projectId), eq(alertFilters.alertId, alertId)))
    .orderBy(desc(alertFilters.createdAt))) as {
    id: string;
    value: Filter[];
    createdAt: string;
  }[];

  return {
    items: rows.map((row) => ({
      id: row.id,
      filters: row.value,
      createdAt: row.createdAt,
    })),
  };
}

export async function createAlertFilter(input: z.infer<typeof CreateAlertFilterSchema>) {
  const { projectId, alertId, filters } = CreateAlertFilterSchema.parse(input);

  const [result] = await db
    .insert(alertFilters)
    .values({
      projectId,
      alertId,
      value: filters,
    })
    .returning();

  await cache.remove(`${ALERT_FILTERS_CACHE_KEY}:${projectId}:${alertId}`);

  return {
    id: result.id,
    filters: result.value as Filter[],
    createdAt: result.createdAt,
  };
}

export async function updateAlertFilter(input: z.infer<typeof UpdateAlertFilterSchema>) {
  const { projectId, alertId, filterId, filters } = UpdateAlertFilterSchema.parse(input);

  const [result] = await db
    .update(alertFilters)
    .set({ value: filters })
    .where(and(eq(alertFilters.projectId, projectId), eq(alertFilters.alertId, alertId), eq(alertFilters.id, filterId)))
    .returning();

  if (!result) {
    return undefined;
  }

  await cache.remove(`${ALERT_FILTERS_CACHE_KEY}:${projectId}:${alertId}`);

  return {
    id: result.id,
    filters: result.value as Filter[],
    createdAt: result.createdAt,
  };
}

export async function deleteAlertFilters(input: z.infer<typeof DeleteAlertFiltersSchema>) {
  const { projectId, alertId, filterIds } = DeleteAlertFiltersSchema.parse(input);

  const results = await db
    .delete(alertFilters)
    .where(
      and(eq(alertFilters.projectId, projectId), eq(alertFilters.alertId, alertId), inArray(alertFilters.id, filterIds))
    )
    .returning();

  await cache.remove(`${ALERT_FILTERS_CACHE_KEY}:${projectId}:${alertId}`);

  return { deletedCount: results.length };
}
