import { sample } from "lodash";
import { z } from "zod/v4";

import { executeQuery } from "@/lib/actions/sql";
import { db } from "@/lib/db/drizzle";
import { tagClasses } from "@/lib/db/migrations/schema";
import { defaultColors } from "@/lib/tags/colors";

const GetSpanTagsSchema = z.object({
  projectId: z.guid(),
  traceId: z.guid(),
  spanId: z.guid(),
});

export const getSpanTags = async (
  input: z.infer<typeof GetSpanTagsSchema>
): Promise<
  {
    name: string;
    id: string;
  }[]
> => {
  const { traceId, spanId, projectId } = GetSpanTagsSchema.parse(input);

  const rows = await executeQuery<{ name: string }>({
    projectId,
    query: `
      SELECT DISTINCT arrayJoin(tags) as name
      FROM spans
      WHERE trace_id = {traceId: UUID} AND span_id = {spanId: UUID}
    `,
    parameters: { traceId, spanId },
  });

  return rows.map((tag) => ({
    name: tag.name,
    id: tag.name,
  }));
};

const CreateOrUpdateTagClassSchema = z.object({
  projectId: z.guid(),
  name: z.string(),
  color: z.string().optional(),
});

const CreateOrUpdateTagClassReturnSchema = z.object({
  name: z.string(),
  color: z.string(),
});

export const createOrUpdateTagClass = async (
  input: z.infer<typeof CreateOrUpdateTagClassSchema>
): Promise<z.infer<typeof CreateOrUpdateTagClassReturnSchema>> => {
  const parseResult = CreateOrUpdateTagClassSchema.parse(input);
  const { projectId, name, color } = parseResult;

  const newColor = color ?? sample(defaultColors)!.color;

  const result = await db
    .insert(tagClasses)
    .values({
      projectId,
      name,
      color: newColor,
    })
    .onConflictDoUpdate({
      target: [tagClasses.name, tagClasses.projectId],
      set: {
        color: newColor,
      },
    })
    .returning();

  return {
    name: result[0].name,
    color: result[0].color,
  };
};
