
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

    const tags = await getSpanTagNames({ spanId, projectId });

    if (!tags.includes(name)) {
      tags.push(name);
      await setSpanTagNames({ spanId, projectId, tags });
    }
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
      SELECT tags FROM spans WHERE span_id = {spanId: UUID} AND project_id = {projectId: UUID}
      LIMIT 1
    `,
    format: "JSONEachRow",
    query_params: {
      spanId,
      projectId,
    },
  });
  const chTags = await chRes.json() as { tags: string }[];
  if (chTags.length === 0) {
    throw new Error("Span not found");
  }
  return JSON.parse(chTags[0].tags) as string[];
};

const SetSpanTagNamesSchema = z.object({
  spanId: z.string(),
  projectId: z.string(),
  tags: z.array(z.string()),
});

export type SetSpanTagNamesSchema = z.infer<typeof SetSpanTagNamesSchema>;

export const setSpanTagNames = async (input: z.infer<typeof SetSpanTagNamesSchema>): Promise<void> => {
  const parseResult = SetSpanTagNamesSchema.safeParse(input);
  if (!parseResult.success) {
    throw new Error(parseResult.error.message);
  }
  const { spanId, projectId, tags } = parseResult.data;

  clickhouseClient.command({
    query: `
      ALTER TABLE spans
      UPDATE tags = {tags: String}
      WHERE span_id = {spanId: UUID} AND project_id = {projectId: UUID} 
    `,
    query_params: {
      tags: JSON.stringify(tags),
      spanId,
      projectId,
    },
  })
    .catch((error) => {
      console.error("Error updating tags in ClickHouse", error);
    });
};
