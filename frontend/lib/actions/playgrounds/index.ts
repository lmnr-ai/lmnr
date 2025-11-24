import { and, desc, eq, ilike, inArray } from "drizzle-orm";
import { z } from "zod/v4";

import { db } from "@/lib/db/drizzle";
import { parseFilters } from "@/lib/db/filter-parser";
import { playgrounds } from "@/lib/db/migrations/schema";
import { paginatedGet } from "@/lib/db/utils";

export type Playground = {
  id: string;
  name: string;
  createdAt: string;
};

export const GetPlaygroundsSchema = z.object({
  projectId: z.string(),
  pageNumber: z.coerce.number().default(0),
  pageSize: z.coerce.number().default(50),
  search: z.string().nullable().optional(),
  filter: z.array(z.any()).optional().default([]),
});

export const CreatePlaygroundSchema = z.object({
  projectId: z.string(),
  name: z.string().min(1, "Name is required"),
});

export const DeletePlaygroundsSchema = z.object({
  projectId: z.string(),
  playgroundIds: z.array(z.string()).min(1, "At least one playground id is required"),
});

export async function getPlaygrounds(input: z.infer<typeof GetPlaygroundsSchema>) {
  const { projectId, pageNumber, pageSize, search, filter } = GetPlaygroundsSchema.parse(input);

  const filters = [eq(playgrounds.projectId, projectId)];

  if (search) {
    filters.push(ilike(playgrounds.name, `%${search}%`));
  }

  if (filter && Array.isArray(filter)) {
    const filterConditions = parseFilters(filter, {
      name: { column: playgrounds.name, type: "string" },
      id: { column: playgrounds.id, type: "string" },
    });
    filters.push(...filterConditions);
  }

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

export async function createPlayground(input: z.infer<typeof CreatePlaygroundSchema>) {
  const { projectId, name } = CreatePlaygroundSchema.parse(input);

  const [result] = await db
    .insert(playgrounds)
    .values({
      projectId,
      name,
    })
    .returning();

  return result;
}

export async function deletePlaygrounds(input: z.infer<typeof DeletePlaygroundsSchema>) {
  const { projectId, playgroundIds } = DeletePlaygroundsSchema.parse(input);

  await db
    .delete(playgrounds)
    .where(and(inArray(playgrounds.id, playgroundIds), eq(playgrounds.projectId, projectId)));

  return { success: true };
}