import { and, eq } from "drizzle-orm";
import { z } from "zod/v4";

import { FilterSchemaRelaxed } from "@/lib/actions/common/filters";
import { db } from "@/lib/db/drizzle";
import { tableViews } from "@/lib/db/migrations/schema";

export const ViewConfigSchema = z.object({
  columnOrder: z.array(z.string()).optional(),
  columnVisibility: z.record(z.string(), z.boolean()).optional(),
  columnSizing: z.record(z.string(), z.number()).optional(),
  customColumns: z.array(z.any()).optional(),
  // View-managed runtime params persisted alongside column config. searchIn is
  // intentionally omitted — we always search across every searchable field.
  filters: z.array(FilterSchemaRelaxed).optional(),
  search: z.string().optional(),
  sortBy: z.string().optional(),
  sortDirection: z.enum(["asc", "desc"]).optional(),
});

export const CreateViewSchema = z.object({
  projectId: z.guid(),
  resource: z.string().min(1),
  name: z.string().min(1).max(120),
  config: ViewConfigSchema,
});

export async function createView(input: z.infer<typeof CreateViewSchema>) {
  const { projectId, resource, name, config } = CreateViewSchema.parse(input);

  const [result] = await db.insert(tableViews).values({ projectId, resource, name, config }).returning();
  if (!result) throw new Error("Failed to create view");
  return result;
}

export const UpdateViewSchema = z.object({
  projectId: z.guid(),
  viewId: z.guid(),
  name: z.string().min(1).max(120).optional(),
  config: ViewConfigSchema.optional(),
});

export async function updateView(input: z.infer<typeof UpdateViewSchema>) {
  const { projectId, viewId, name, config } = UpdateViewSchema.parse(input);

  const [result] = await db
    .update(tableViews)
    .set({
      ...(name !== undefined && { name }),
      ...(config !== undefined && { config }),
      updatedAt: new Date().toISOString(),
    })
    .where(and(eq(tableViews.id, viewId), eq(tableViews.projectId, projectId)))
    .returning();
  if (!result) throw new Error("View not found");
  return result;
}

export const DeleteViewSchema = z.object({
  projectId: z.guid(),
  viewId: z.guid(),
});

export async function deleteView(input: z.infer<typeof DeleteViewSchema>) {
  const { projectId, viewId } = DeleteViewSchema.parse(input);

  const [result] = await db
    .delete(tableViews)
    .where(and(eq(tableViews.id, viewId), eq(tableViews.projectId, projectId)))
    .returning();
  if (!result) throw new Error("View not found");
  return result;
}
