import { and, eq } from "drizzle-orm";
import { z } from "zod/v4";

import { db } from "@/lib/db/drizzle";
import { renderTemplates } from "@/lib/db/migrations/schema";

export const CreateRenderTemplateSchema = z.object({
  projectId: z.string(),
  name: z.string().min(1, "Template name is required"),
  code: z.string().min(1, "Template code is required"),
});

export const GetRenderTemplateSchema = z.object({
  projectId: z.string(),
  templateId: z.string(),
});

export const UpdateRenderTemplateSchema = z.object({
  projectId: z.string(),
  templateId: z.string(),
  name: z.string().min(1, "Template name is required"),
  code: z.string().min(1, "Template code is required"),
});

export const DeleteRenderTemplateSchema = z.object({
  projectId: z.string(),
  templateId: z.string(),
});
export async function createRenderTemplate(input: z.infer<typeof CreateRenderTemplateSchema>) {
  const { projectId, name, code } = CreateRenderTemplateSchema.parse(input);

  const [result] = await db
    .insert(renderTemplates)
    .values({
      projectId,
      name,
      code,
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
  const { projectId, templateId, name, code } = UpdateRenderTemplateSchema.parse(input);

  const [result] = await db
    .update(renderTemplates)
    .set({
      name,
      code,
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
