import { sample } from "lodash";
import { z } from "zod/v4";

import { clickhouseClient } from "@/lib/clickhouse/client";
import { db } from "@/lib/db/drizzle";
import { tagClasses } from "@/lib/db/migrations/schema";
import { defaultColors } from "@/lib/tags/colors";

const AddSpanTagSchema = z.object({
  spanId: z.guid(),
  projectId: z.guid(),
  name: z.string(),
});

const AddSpanTagReturnSchema = AddSpanTagSchema.extend({
  id: z.string(),
});

const GetSpanTagsSchema = z.object({
  projectId: z.guid(),
  spanId: z.guid(),
});

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
  await addTagToCHSpan({ spanId, projectId, tag: name });
  return {
    spanId,
    projectId,
    id: name,
    name,
  };
};

const AddTagToSpanSchema = z.object({
  spanId: z.guid(),
  projectId: z.guid(),
  tag: z.string(),
});

export type AddTagToSpanSchema = z.infer<typeof AddTagToSpanSchema>;

export const addTagToCHSpan = async (input: z.infer<typeof AddTagToSpanSchema>): Promise<void> => {
  const parseResult = AddTagToSpanSchema.parse(input);
  const { spanId, projectId, tag } = parseResult;

  // With mutations_sync=0, this returns immediately while the mutation runs in the background.
  await clickhouseClient.command({
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
  });
};

const RemoveTagFromSpanSchema = z.object({
  spanId: z.guid(),
  projectId: z.guid(),
  tag: z.string(),
});

export type RemoveTagFromSpanSchema = z.infer<typeof RemoveTagFromSpanSchema>;

export const removeTagFromCHSpan = async (input: z.infer<typeof RemoveTagFromSpanSchema>): Promise<void> => {
  const parseResult = RemoveTagFromSpanSchema.parse(input);
  const { spanId, projectId, tag } = parseResult;

  // With mutations_sync=0, this returns immediately while the mutation runs in the background.
  await clickhouseClient.command({
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
  });
};

export const getSpanTags = async (
  input: z.infer<typeof GetSpanTagsSchema>
): Promise<
  {
    name: string;
    id: string;
  }[]
> => {
  const { spanId, projectId } = GetSpanTagsSchema.parse(input);

  const chResponse = await clickhouseClient.query({
    query: `
      SELECT DISTINCT arrayJoin(tags_array) as name
      FROM spans
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
  }>;

  return chData.map((tag) => ({
    name: tag.name,
    id: tag.name,
  }));
};

const TraceTagsSchema = z.object({
  projectId: z.guid(),
  traceId: z.guid(),
});

export const getTraceTags = async (input: z.infer<typeof TraceTagsSchema>): Promise<string[]> => {
  const { projectId, traceId } = TraceTagsSchema.parse(input);

  const result = await clickhouseClient.query({
    query: `
      SELECT tags
      FROM trace_tags FINAL
      WHERE project_id = {projectId:UUID} AND trace_id = {traceId:UUID}
    `,
    format: "JSONEachRow",
    query_params: { projectId, traceId },
  });

  const rows = await result.json<{ tags: string[] }>();
  return rows.length > 0 ? rows[0].tags : [];
};

const SetTraceTagsSchema = TraceTagsSchema.extend({
  tags: z.array(z.string()),
});

// Writes the full tag set as a new `trace_tags` version (ReplacingMergeTree
// keeps the latest `updated_at`). `start_time` is copied from the trace so
// `traces_v0` can bound its `trace_tags` scan; a trace with no aggregate yet
// falls back to the column default (epoch), which the view also matches.
export const setTraceTags = async (input: z.infer<typeof SetTraceTagsSchema>): Promise<void> => {
  const { projectId, traceId, tags } = SetTraceTagsSchema.parse(input);

  const startTimeResult = await clickhouseClient.query({
    query: `
      SELECT toString(min(start_time)) AS start_time
      FROM traces_agg
      WHERE project_id = {projectId:UUID} AND id = {traceId:UUID}
      HAVING count() > 0
    `,
    format: "JSONEachRow",
    query_params: { projectId, traceId },
  });
  const startTimeRows = await startTimeResult.json<{ start_time: string }>();
  const startTime = startTimeRows.length > 0 ? { start_time: startTimeRows[0].start_time } : {};

  await clickhouseClient.insert({
    table: "trace_tags",
    values: [{ project_id: projectId, trace_id: traceId, tags, ...startTime }],
    format: "JSONEachRow",
  });
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
