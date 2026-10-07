import { and, desc, eq } from "drizzle-orm";
import { z } from "zod/v4";

import { db } from "@/lib/db/drizzle";
import { renderTemplates } from "@/lib/db/migrations/schema";

const TemplateTypeSchema = z.enum(["span", "trace"]);

export const GetRenderTemplatesSchema = z.object({
  projectId: z.guid(),
  type: TemplateTypeSchema.optional(),
});

export const CreateRenderTemplateSchema = z.object({
  projectId: z.guid(),
  name: z.string().min(1, "Template name is required"),
  code: z.string().min(1, "Template code is required"),
  type: TemplateTypeSchema.default("span"),
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

export async function getRenderTemplates(input: z.infer<typeof GetRenderTemplatesSchema>) {
  const { projectId, type } = GetRenderTemplatesSchema.parse(input);

  return await db.query.renderTemplates.findMany({
    where: and(eq(renderTemplates.projectId, projectId), type ? eq(renderTemplates.type, type) : undefined),
    columns: {
      id: true,
      name: true,
      type: true,
      createdAt: true,
    },
    orderBy: desc(renderTemplates.createdAt),
  });
}

export async function createRenderTemplate(input: z.infer<typeof CreateRenderTemplateSchema>) {
  const { projectId, name, code, type, whereClause } = CreateRenderTemplateSchema.parse(input);

  const [result] = await db
    .insert(renderTemplates)
    .values({
      projectId,
      name,
      code,
      type,
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
      whereClause: whereClause ?? null,
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
