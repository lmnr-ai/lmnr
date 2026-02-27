import { sample } from "lodash";
import z from "zod";

import { clickhouseClient } from "@/lib/clickhouse/client";
import { db } from "@/lib/db/drizzle";
import { tagClasses } from "@/lib/db/migrations/schema";
import { defaultColors } from "@/lib/tags/colors";
import { generateUuid } from "@/lib/utils";

const AddSpanTagSchema = z.object({
  spanId: z.string(),
  projectId: z.string(),
  name: z.string(),
});

const AddSpanTagReturnSchema = AddSpanTagSchema.extend({
  id: z.string(),
  createdAt: z.iso.date(),
  source: z.enum(["MANUAL", "AUTO", "CODE"]),
});

const GetSpanTagsSchema = z.object({
  projectId: z.string(),
  spanId: z.string(),
});

const TagSourceMap: Record<number, "MANUAL" | "AUTO" | "CODE"> = {
  0: "MANUAL",
  1: "AUTO",
  2: "CODE",
};

export const addSpanTag = async (
  input: z.infer<typeof AddSpanTagSchema>
): Promise<z.infer<typeof AddSpanTagReturnSchema>> => {
  const parseResult = AddSpanTagSchema.parse(input);
  const { spanId, projectId, name } = parseResult;

  const existingTags = await getSpanTags({ spanId, projectId });
  const existingTag = existingTags.find((tag) => tag.name === name);
  if (existingTag) {
    return {
      ...existingTag,
      spanId,
      projectId,
    };
  }
  const id = generateUuid();
  const createdAt = new Date();
  await clickhouseClient.insert({
    table: "default.tags",
    format: "JSONEachRow",
    values: [
      {
        span_id: spanId,
        id: id,
        name: name,
        project_id: projectId,
        source: 0,
        created_at: createdAt.getTime() * 1e6,
      },
    ],
  });
  await addTagToCHSpan({ spanId, projectId, tag: name });
  return {
    spanId,
    projectId,
    id,
    name,
    createdAt: createdAt.toISOString(),
    source: "MANUAL",
  };
};

const AddTagToSpanSchema = z.object({
  spanId: z.string(),
  projectId: z.string(),
  tag: z.string(),
});

export type AddTagToSpanSchema = z.infer<typeof AddTagToSpanSchema>;

export const addTagToCHSpan = async (input: z.infer<typeof AddTagToSpanSchema>): Promise<void> => {
  const parseResult = AddTagToSpanSchema.parse(input);
  const { spanId, projectId, tag } = parseResult;

  // No await here because we don't want to block the request,
  // ALTER TABLE may be slow.
  clickhouseClient
    .command({
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
  const parseResult = RemoveTagFromSpanSchema.parse(input);
  const { spanId, projectId, tag } = parseResult;

  // No await here because we don't want to block the request,
  // ALTER TABLE may be slow.
  clickhouseClient
    .command({
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

export const getSpanTags = async (
  input: z.infer<typeof GetSpanTagsSchema>
): Promise<
  {
    name: string;
    source: "MANUAL" | "AUTO" | "CODE";
    id: string;
    createdAt: string;
  }[]
> => {
  const { spanId, projectId } = GetSpanTagsSchema.parse(input);

  const chResponse = await clickhouseClient.query({
    query: `
      SELECT name, id, source, created_at
      FROM tags
      WHERE span_id = {spanId: UUID} AND project_id = {projectId: UUID}
    `,
    format: "JSONEachRow",
    query_params: {
      spanId,
      projectId,
    },
  });

  const chData = (await chResponse.json()) as Array<{
    name: string;
    source: number;
    id: string;
    created_at: string;
  }>;

  return chData.map((tag) => ({
    name: tag.name,
    source: TagSourceMap[tag.source] ?? "MANUAL",
    id: tag.id,
    createdAt: tag.created_at,
  }));
};

const CreateOrUpdateTagClassSchema = z.object({
  projectId: z.string(),
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
