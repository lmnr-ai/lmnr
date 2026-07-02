import { and, eq } from "drizzle-orm";
import { z } from "zod/v4";

import { db } from "@/lib/db/drizzle";
import { renderTemplates } from "@/lib/db/migrations/schema";

export const RenderTemplateScopeSchema = z.enum(["span", "trace"]);
export type RenderTemplateScope = z.infer<typeof RenderTemplateScopeSchema>;

export const CreateRenderTemplateSchema = z.object({
  projectId: z.guid(),
  name: z.string().min(1, "Template name is required"),
  code: z.string().min(1, "Template code is required"),
  scope: RenderTemplateScopeSchema.default("span"),
  whereClause: z.string().nullish(),
});

export const GetRenderTemplateSchema = z.object({
  projectId: z.guid(),
  templateId: z.guid(),
});

export const UpdateRenderTemplateSchema = z.object({
  projectId: z.guid(),
  templateId: z.guid(),
  name: z.string().min(1, "Template name is required"),
  code: z.string().min(1, "Template code is required"),
  whereClause: z.string().nullish(),
});

export const DeleteRenderTemplateSchema = z.object({
  projectId: z.guid(),
  templateId: z.guid(),
});
export async function createRenderTemplate(input: z.infer<typeof CreateRenderTemplateSchema>) {
  const { projectId, name, code, scope, whereClause } = CreateRenderTemplateSchema.parse(input);

  const [result] = await db
    .insert(renderTemplates)
    .values({
      projectId,
      name,
      code,
      scope,
      whereClause: whereClause ?? null,
    })
    .returning();

  if (!result) {
    throw new Error("Failed to create template");
  }

  return result;
}

export async function getRenderTemplate(input: z.infer<typeof GetRenderTemplateSchema>) {
  const { projectId, templateId } = GetRenderTemplateSchema.parse(input);

  const template = await db.query.renderTemplates.findFirst({
    where: and(eq(renderTemplates.id, templateId), eq(renderTemplates.projectId, projectId)),
  });

  if (!template) {
    throw new Error("Template not found");
  }

  return template;
}

export async function updateRenderTemplate(input: z.infer<typeof UpdateRenderTemplateSchema>) {
  const { projectId, templateId, name, code, whereClause } = UpdateRenderTemplateSchema.parse(input);

  const [result] = await db
    .update(renderTemplates)
    .set({
      name,
      code,
      // Scope is immutable after creation; only the trace-scope filter is editable.
      ...(whereClause !== undefined && { whereClause }),
    })
    .where(and(eq(renderTemplates.id, templateId), eq(renderTemplates.projectId, projectId)))
    .returning();

  if (!result) {
    throw new Error("Template not found");
  }

  return result;
}

export async function deleteRenderTemplate(input: z.infer<typeof DeleteRenderTemplateSchema>) {
  const { projectId, templateId } = DeleteRenderTemplateSchema.parse(input);

  const [result] = await db
    .delete(renderTemplates)
    .where(and(eq(renderTemplates.id, templateId), eq(renderTemplates.projectId, projectId)))
    .returning();

  if (!result) {
    throw new Error("Template not found");
  }

  return result;
}
