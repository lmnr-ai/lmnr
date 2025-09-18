import { and, eq } from "drizzle-orm";
import { NextRequest } from "next/server";

import { getSpanTagNames, setSpanTagNames } from "@/lib/actions/tags";
import { clickhouseClient } from "@/lib/clickhouse/client";
import { db } from "@/lib/db/drizzle";
import { tagClasses, tags } from "@/lib/db/migrations/schema";

export async function DELETE(
  _req: NextRequest,
  props: { params: Promise<{ projectId: string; spanId: string; tagId: string }> }
): Promise<Response> {
  const params = await props.params;
  const projectId = params.projectId;
  const spanId = params.spanId;
  const tagId = params.tagId;

  const [res] = await db
    .delete(tags)
    .where(and(eq(tags.id, tagId), eq(tags.spanId, spanId), eq(tags.projectId, projectId)))
    .returning();

  const tagClass = await db.query.tagClasses.findFirst({
    columns: {
      name: true,
    },
    where: and(eq(tagClasses.id, res?.classId), eq(tagClasses.projectId, projectId)),
  });
  const deletedTagName = tagClass?.name;

  await clickhouseClient.exec({
    query: `
      DELETE FROM default.tags 
      WHERE id = {id: UUID} AND span_id = {span_id: UUID} AND project_id = {project_id: UUID}
    `,
    query_params: {
      id: tagId,
      span_id: spanId,
      project_id: projectId,
    },
  });

  const tagNames = await getSpanTagNames({ spanId, projectId });
  if (tagNames.length > 0 && deletedTagName && tagNames.includes(deletedTagName)) {
    await setSpanTagNames({ spanId, projectId, tags: tagNames.filter((name) => name !== deletedTagName) });
  }

  return new Response("Span label deleted successfully", { status: 200 });
}
