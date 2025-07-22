import { and, eq } from "drizzle-orm";
import { z } from "zod/v4";

import { db } from "@/lib/db/drizzle";
import { sqlTemplates } from "@/lib/db/migrations/schema";

export const CreateSqlTemplateSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  name: z.string().min(1, "Template name is required"),
  query: z.string().min(1, "SQL query is required"),
});

export const UpdateSqlTemplateSchema = z.object({
  projectId: z.string(),
  templateId: z.string(),
  name: z.string().min(1, "Template name is required"),
  query: z.string().min(1, "SQL query is required"),
});

export const DeleteSqlTemplateSchema = z.object({
  projectId: z.string(),
  templateId: z.string(),
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
      name,
      query,
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
