import { and, eq } from "drizzle-orm";
import { z } from "zod/v4";

import { db } from "@/lib/db/drizzle";
import { views } from "@/lib/db/migrations/schema";

export class ViewNameConflictError extends Error {
  constructor(message = "A view with this name already exists") {
    super(message);
    this.name = "ViewNameConflictError";
  }
}

export const ViewConfigSchema = z.object({
  columnOrder: z.array(z.string()).optional(),
  columnVisibility: z.record(z.string(), z.boolean()).optional(),
  columnSizing: z.record(z.string(), z.number()).optional(),
  customColumns: z.array(z.any()).optional(),
  sorting: z.array(z.object({ id: z.string(), desc: z.boolean() })).optional(),
  filters: z.unknown().optional(),
});

export const CreateViewSchema = z.object({
  projectId: z.guid(),
  resourceType: z.string().min(1),
  name: z.string().min(1).max(120),
  config: ViewConfigSchema,
});

export async function createView(input: z.infer<typeof CreateViewSchema>) {
  const { projectId, resourceType, name, config } = CreateViewSchema.parse(input);

  try {
    const [result] = await db.insert(views).values({ projectId, resourceType, name, config }).returning();
    if (!result) throw new Error("Failed to create view");
    return result;
  } catch (e) {
    if ((e as { code?: string })?.code === "23505") throw new ViewNameConflictError();
    throw e;
  }
}

export const GetViewSchema = z.object({
  projectId: z.guid(),
  viewId: z.guid(),
});

export async function getView(input: z.infer<typeof GetViewSchema>) {
  const { projectId, viewId } = GetViewSchema.parse(input);

  const view = await db.query.views.findFirst({
    where: and(eq(views.id, viewId), eq(views.projectId, projectId)),
  });
  if (!view) throw new Error("View not found");
  return view;
}

export const UpdateViewSchema = z.object({
  projectId: z.guid(),
  viewId: z.guid(),
  name: z.string().min(1).max(120).optional(),
  config: ViewConfigSchema.optional(),
});

export async function updateView(input: z.infer<typeof UpdateViewSchema>) {
  const { projectId, viewId, name, config } = UpdateViewSchema.parse(input);

  try {
    const [result] = await db
      .update(views)
      .set({
        ...(name !== undefined && { name }),
        ...(config !== undefined && { config }),
        updatedAt: new Date().toISOString(),
      })
      .where(and(eq(views.id, viewId), eq(views.projectId, projectId)))
      .returning();
    if (!result) throw new Error("View not found");
    return result;
  } catch (e) {
    if ((e as { code?: string })?.code === "23505") throw new ViewNameConflictError();
    throw e;
  }
}

export const DeleteViewSchema = z.object({
  projectId: z.guid(),
  viewId: z.guid(),
});

export async function deleteView(input: z.infer<typeof DeleteViewSchema>) {
  const { projectId, viewId } = DeleteViewSchema.parse(input);

  const [result] = await db
    .delete(views)
    .where(and(eq(views.id, viewId), eq(views.projectId, projectId)))
    .returning();
  if (!result) throw new Error("View not found");
  return result;
}
