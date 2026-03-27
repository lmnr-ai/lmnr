import { type NextRequest } from "next/server";

import { getTraceTags, removeTagFromCHTrace } from "@/lib/actions/tags";
import { clickhouseClient } from "@/lib/clickhouse/client";

export async function DELETE(
  _req: NextRequest,
  props: { params: Promise<{ projectId: string; traceId: string; tagId: string }> }
): Promise<Response> {
  const params = await props.params;
  const projectId = params.projectId;
  const traceId = params.traceId;
  const tagId = params.tagId;

  const chTags = await getTraceTags({
    traceId,
    projectId,
  });

  const deletedTagName = chTags.find((tag) => tag.id === tagId)?.name;

  await clickhouseClient.exec({
    query: `
      DELETE FROM trace_tags
      WHERE id = {id: UUID} AND trace_id = {trace_id: UUID} AND project_id = {project_id: UUID}
    `,
    query_params: {
      id: tagId,
      trace_id: traceId,
      project_id: projectId,
    },
  });

  // Remove the tag from the trace's trace_tags array in ClickHouse
  if (deletedTagName) {
    await removeTagFromCHTrace({
      traceId,
      projectId,
      tag: deletedTagName,
    });
  }

  return new Response("Trace tag deleted successfully", { status: 200 });
}
