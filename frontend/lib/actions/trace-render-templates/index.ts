import { and, desc, eq } from "drizzle-orm";
import { z } from "zod/v4";

import { db } from "@/lib/db/drizzle";
import { traceRenderTemplates } from "@/lib/db/migrations/schema";

export const GetTraceRenderTemplatesSchema = z.object({
  projectId: z.guid(),
});

export const CreateTraceRenderTemplateSchema = z.object({
  projectId: z.guid(),
  name: z.string().min(1, "Template name is required"),
  code: z.string().min(1, "Template code is required"),
  whereClause: z.string().nullish(),
});

export const GetTraceRenderTemplateSchema = z.object({
  projectId: z.guid(),
  templateId: z.guid(),
});

export const UpdateTraceRenderTemplateSchema = z.object({
  projectId: z.guid(),
  templateId: z.guid(),
  name: z.string().min(1, "Template name is required"),
  code: z.string().min(1, "Template code is required"),
  whereClause: z.string().nullish(),
});

export const DeleteTraceRenderTemplateSchema = z.object({
  projectId: z.guid(),
  templateId: z.guid(),
});

export async function getTraceRenderTemplates(input: z.infer<typeof GetTraceRenderTemplatesSchema>) {
  const { projectId } = GetTraceRenderTemplatesSchema.parse(input);

  return await db.query.traceRenderTemplates.findMany({
    where: eq(traceRenderTemplates.projectId, projectId),
    columns: {
      id: true,
      name: true,
      createdAt: true,
    },
    orderBy: desc(traceRenderTemplates.createdAt),
  });
}

export async function createTraceRenderTemplate(input: z.infer<typeof CreateTraceRenderTemplateSchema>) {
  const { projectId, name, code, whereClause } = CreateTraceRenderTemplateSchema.parse(input);

  const [result] = await db
    .insert(traceRenderTemplates)
    .values({
      projectId,
      name,
      code,
      whereClause: whereClause ?? null,
    })
    .returning();

  if (!result) {
    throw new Error("Failed to create template");
  }

  return result;
}

export async function getTraceRenderTemplate(input: z.infer<typeof GetTraceRenderTemplateSchema>) {
  const { projectId, templateId } = GetTraceRenderTemplateSchema.parse(input);

  const template = await db.query.traceRenderTemplates.findFirst({
    where: and(eq(traceRenderTemplates.id, templateId), eq(traceRenderTemplates.projectId, projectId)),
  });

  if (!template) {
    throw new Error("Template not found");
  }

  return template;
}

export async function updateTraceRenderTemplate(input: z.infer<typeof UpdateTraceRenderTemplateSchema>) {
  const { projectId, templateId, name, code, whereClause } = UpdateTraceRenderTemplateSchema.parse(input);

  const [result] = await db
    .update(traceRenderTemplates)
    .set({
      name,
      code,
      whereClause: whereClause ?? null,
    })
    .where(and(eq(traceRenderTemplates.id, templateId), eq(traceRenderTemplates.projectId, projectId)))
    .returning();

  if (!result) {
    throw new Error("Template not found");
  }

  return result;
}

export async function deleteTraceRenderTemplate(input: z.infer<typeof DeleteTraceRenderTemplateSchema>) {
  const { projectId, templateId } = DeleteTraceRenderTemplateSchema.parse(input);

  const [result] = await db
    .delete(traceRenderTemplates)
    .where(and(eq(traceRenderTemplates.id, templateId), eq(traceRenderTemplates.projectId, projectId)))
    .returning();

  if (!result) {
    throw new Error("Template not found");
  }

  return result;
}
