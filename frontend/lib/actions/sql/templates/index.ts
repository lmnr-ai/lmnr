import { and, eq } from "drizzle-orm";
import { z } from "zod/v4";

import { db } from "@/lib/db/drizzle";
import { sqlTemplates } from "@/lib/db/migrations/schema";

export const CreateSqlTemplateSchema = z.object({
  id: z.guid(),
  projectId: z.guid(),
  name: z.string().min(1, "Template name is required"),
  query: z.string(),
});

// Name and query are updated by different UI paths (inline rename vs. editor autosave) that race
// each other, so each PUT carries only the field it owns — a rename that also had to send a query
// would write back whatever stale copy of it the caller happened to hold.
export const UpdateSqlTemplateSchema = z
  .object({
    projectId: z.guid(),
    templateId: z.guid(),
    name: z.string().min(1, "Template name is required").optional(),
    query: z.string().optional(),
  })
  .refine((input) => input.name !== undefined || input.query !== undefined, {
    message: "Either name or query is required",
  });

export const DeleteSqlTemplateSchema = z.object({
  projectId: z.guid(),
  templateId: z.guid(),
});

export async function getSqlTemplates(input: { projectId: string }) {
  const { projectId } = input;

  const templates = await db.query.sqlTemplates.findMany({
    where: eq(sqlTemplates.projectId, projectId),
    columns: {
      id: true,
      name: true,
      query: true,
      createdAt: true,
    },
    orderBy: (sqlTemplates, { desc }) => [desc(sqlTemplates.createdAt)],
  });

  return templates;
}

export async function createSqlTemplate(input: z.infer<typeof CreateSqlTemplateSchema>) {
  const { id, projectId, name, query } = CreateSqlTemplateSchema.parse(input);

  const [result] = await db
    .insert(sqlTemplates)
    .values({
      id,
      projectId,
      name,
      query,
    })
    .returning();

  if (!result) {
    throw new Error("Failed to create SQL template");
  }

  return result;
}

export async function updateSqlTemplate(input: z.infer<typeof UpdateSqlTemplateSchema>) {
  const { projectId, templateId, name, query } = UpdateSqlTemplateSchema.parse(input);

  const [result] = await db
    .update(sqlTemplates)
    .set({
      ...(name !== undefined && { name }),
      ...(query !== undefined && { query }),
    })
    .where(and(eq(sqlTemplates.id, templateId), eq(sqlTemplates.projectId, projectId)))
    .returning();

  if (!result) {
    throw new Error("SQL template not found");
  }

  return result;
}

export async function deleteSqlTemplate(input: z.infer<typeof DeleteSqlTemplateSchema>) {
  const { projectId, templateId } = DeleteSqlTemplateSchema.parse(input);

  const [result] = await db
    .delete(sqlTemplates)
    .where(and(eq(sqlTemplates.id, templateId), eq(sqlTemplates.projectId, projectId)))
    .returning();

  if (!result) {
    throw new Error("SQL template not found");
  }

  return result;
}
