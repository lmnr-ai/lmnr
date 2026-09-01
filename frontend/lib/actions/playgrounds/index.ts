import { and, desc, eq, ilike, inArray } from "drizzle-orm";
import { z } from "zod/v4";

import { parseFilters } from "@/lib/actions/common/filters";
import { PaginationFiltersSchema } from "@/lib/actions/common/types";
import { db } from "@/lib/db/drizzle";
import { playgrounds } from "@/lib/db/migrations/schema";
import { paginatedGet } from "@/lib/db/utils";

export type Playground = {
  id: string;
  name: string;
  createdAt: string;
};

export const GetPlaygroundsSchema = PaginationFiltersSchema.extend({
  projectId: z.guid(),
  search: z.string().nullable().optional(),
});

export const GetPlaygroundSchema = z.object({
  projectId: z.guid(),
  playgroundId: z.guid(),
});

export const CreatePlaygroundSchema = z.object({
  projectId: z.guid(),
  name: z.string().min(1, "Name is required"),
  promptMessages: z.array(z.any()).optional(),
  modelId: z.string().optional(),
  outputSchema: z.string().optional(),
  tools: z.any().optional(),
  toolChoice: z.any().optional(),
  temperature: z.number().optional(),
  maxTokens: z.number().optional(),
  providerOptions: z.record(z.string(), z.any()).optional(),
});

export const UpdatePlaygroundSchema = z.object({
  projectId: z.guid(),
  playgroundId: z.guid(),
  promptMessages: z.array(z.any()),
  modelId: z.string(),
  outputSchema: z.string().optional(),
  tools: z.string().optional(),
  temperature: z.number().optional(),
  maxTokens: z.number().optional(),
  providerOptions: z.record(z.string(), z.any()).optional(),
  toolChoice: z
    .string()
    .or(z.object({ type: z.string(), toolName: z.string().optional() }).optional())
    .optional(),
});

export const DeletePlaygroundsSchema = z.object({
  projectId: z.guid(),
  playgroundIds: z.array(z.string()).min(1, "At least one playground id is required"),
});

export async function getPlaygrounds(input: z.infer<typeof GetPlaygroundsSchema>) {
  const { projectId, pageNumber, pageSize, search, filter } = input;

  const filters = [eq(playgrounds.projectId, projectId)];

  if (search) {
    filters.push(ilike(playgrounds.name, `%${search}%`));
  }

  const filterConditions = parseFilters(filter, {
    name: { type: "string", column: playgrounds.name },
    id: { type: "string", column: playgrounds.id },
  } as const);
  filters.push(...filterConditions);

  const result = await paginatedGet({
    table: playgrounds,
    pageNumber,
    pageSize,
    filters,
    orderBy: [desc(playgrounds.createdAt)],
    columns: {
      id: playgrounds.id,
      name: playgrounds.name,
      createdAt: playgrounds.createdAt,
    },
  });

  return result;
}

export async function getPlayground(input: z.infer<typeof GetPlaygroundSchema>) {
  const { projectId, playgroundId } = GetPlaygroundSchema.parse(input);

  return await db.query.playgrounds.findFirst({
    where: and(eq(playgrounds.id, playgroundId), eq(playgrounds.projectId, projectId)),
  });
}

export async function createPlayground(input: z.infer<typeof CreatePlaygroundSchema>) {
  const {
    projectId,
    name,
    promptMessages,
    modelId,
    outputSchema,
    tools,
    toolChoice,
    temperature,
    maxTokens,
    providerOptions,
  } = CreatePlaygroundSchema.parse(input);

  const [result] = await db
    .insert(playgrounds)
    .values({
      projectId,
      name,
      ...(promptMessages !== undefined && { promptMessages }),
      ...(modelId !== undefined && { modelId }),
      ...(outputSchema !== undefined && { outputSchema }),
      ...(tools !== undefined && { tools }),
      ...(toolChoice !== undefined && { toolChoice }),
      ...(temperature !== undefined && { temperature }),
      ...(maxTokens !== undefined && { maxTokens }),
      ...(providerOptions !== undefined && { providerOptions }),
    })
    .returning();

  if (!result) {
    throw new Error("Failed to create playground");
  }

  return result;
}

export async function updatePlayground(input: z.infer<typeof UpdatePlaygroundSchema>) {
  const { projectId, playgroundId, ...data } = UpdatePlaygroundSchema.parse(input);

  const [result] = await db
    .update(playgrounds)
    .set({
      tools: data.tools,
      toolChoice: data.toolChoice,
      promptMessages: data.promptMessages,
      modelId: data.modelId,
      outputSchema: data.outputSchema ?? null,
      temperature: data.temperature,
      maxTokens: data.maxTokens,
      providerOptions: data.providerOptions,
    })
    .where(and(eq(playgrounds.id, playgroundId), eq(playgrounds.projectId, projectId)))
    .returning();

  if (!result) {
    throw new Error("Playground not found");
  }

  return result;
}

export async function deletePlaygrounds(input: z.infer<typeof DeletePlaygroundsSchema>) {
  const { projectId, playgroundIds } = DeletePlaygroundsSchema.parse(input);

  await db.delete(playgrounds).where(and(inArray(playgrounds.id, playgroundIds), eq(playgrounds.projectId, projectId)));

  return { success: true };
}
