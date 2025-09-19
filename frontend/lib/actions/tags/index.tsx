
import z from "zod";

import { clickhouseClient } from "@/lib/clickhouse/client";
import { dateToNanoseconds } from "@/lib/clickhouse/utils";
import { db } from "@/lib/db/drizzle";
import { tags } from "@/lib/db/migrations/schema";

const AddSpanTagSchema = z.object({
  spanId: z.string(),
  projectId: z.string(),
  name: z.string(),
  classId: z.string(),
  userId: z.string(),
});

export const addSpanTag = async (input: z.infer<typeof AddSpanTagSchema>): Promise<typeof tags.$inferSelect> => {
  const parseResult = AddSpanTagSchema.safeParse(input);
  if (!parseResult.success) {
    throw new Error(parseResult.error.message);
  }
  const { spanId, projectId, name, classId, userId } = parseResult.data;

  const [res] = await db
    .insert(tags)
    .values({
      projectId,
      classId,
      spanId,
      userId,
    })
    .returning();

  if (res?.id) {
    await clickhouseClient.insert({
      table: "default.tags",
      format: "JSONEachRow",
      values: [
        {
          class_id: classId,
          span_id: spanId,
          id: res.id,
          name: name,
          project_id: projectId,
          source: 0,
          created_at: dateToNanoseconds(new Date()),
        },
      ],
    });

    await addTagToCHSpan({ spanId, projectId, tag: name });
  }

  return res;
};

const GetSpanTagNamesSchema = z.object({
  spanId: z.string(),
  projectId: z.string(),
});

export type GetSpanTagNamesSchema = z.infer<typeof GetSpanTagNamesSchema>;

export const getSpanTagNames = async (input: z.infer<typeof GetSpanTagNamesSchema>): Promise<string[]> => {
  const parseResult = GetSpanTagNamesSchema.safeParse(input);
  if (!parseResult.success) {
    throw new Error(parseResult.error.message);
  }
  const { spanId, projectId } = parseResult.data;

  const chRes = await clickhouseClient.query({
    query: `
      SELECT tags_array FROM spans WHERE span_id = {spanId: UUID} AND project_id = {projectId: UUID}
      LIMIT 1
    `,
    format: "JSONEachRow",
    query_params: {
      spanId,
      projectId,
    },
  });
  const chTags = await chRes.json() as { tags_array: string[] }[];
  if (chTags.length === 0) {
    throw new Error("Span not found");
  }
  return chTags[0].tags_array;
};

const AddTagToSpanSchema = z.object({
  spanId: z.string(),
  projectId: z.string(),
  tag: z.string(),
});

export type AddTagToSpanSchema = z.infer<typeof AddTagToSpanSchema>;

export const addTagToCHSpan = async (input: z.infer<typeof AddTagToSpanSchema>): Promise<void> => {
  const parseResult = AddTagToSpanSchema.safeParse(input);
  if (!parseResult.success) {
    throw new Error(parseResult.error.message);
  }
  const { spanId, projectId, tag } = parseResult.data;

  // No await here because we don't want to block the request,
  // ALTER TABLE may be slow.
  clickhouseClient.command({
    query: `
      ALTER TABLE spans
      UPDATE tags_array = arrayDistinct(arrayConcat(tags_array, [{tag: String}]))
      WHERE span_id = {spanId: UUID} AND project_id = {projectId: UUID} 
    `,
    query_params: {
      tag,
      spanId,
      projectId,
    },
  })
    .catch((error) => {
      console.error("Error updating tags in ClickHouse", error);
    });
};

const RemoveTagFromSpanSchema = z.object({
  spanId: z.string(),
  projectId: z.string(),
  tag: z.string(),
});

export type RemoveTagFromSpanSchema = z.infer<typeof RemoveTagFromSpanSchema>;

export const removeTagFromCHSpan = async (input: z.infer<typeof RemoveTagFromSpanSchema>): Promise<void> => {
  const parseResult = RemoveTagFromSpanSchema.safeParse(input);
  if (!parseResult.success) {
    throw new Error(parseResult.error.message);
  }
  const { spanId, projectId, tag } = parseResult.data;

  // No await here because we don't want to block the request,
  // ALTER TABLE may be slow.
  clickhouseClient.command({
    query: `
      ALTER TABLE spans
      UPDATE tags_array = arrayFilter(x -> x != {tag: String}, tags_array)
      WHERE span_id = {spanId: UUID} AND project_id = {projectId: UUID} 
    `,
    query_params: {
      tag,
      spanId,
      projectId,
    },
  })
    .catch((error) => {
      console.error("Error removing tag from ClickHouse", error);
    });
};
