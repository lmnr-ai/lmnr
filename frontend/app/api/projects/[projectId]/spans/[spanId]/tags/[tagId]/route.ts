import { type NextRequest } from "next/server";

import { getSpanTags, removeTagFromCHSpan } from "@/lib/actions/tags";
import { clickhouseClient } from "@/lib/clickhouse/client";

export async function DELETE(
  _req: NextRequest,
  props: { params: Promise<{ projectId: string; spanId: string; tagId: string }> }
): Promise<Response> {
  try {
    const params = await props.params;
    const projectId = params.projectId;
    const spanId = params.spanId;
    const tagId = params.tagId;

    const chTags = await getSpanTags({
      spanId,
      projectId,
    });

    const deletedTagName = chTags.find((tag) => tag.id === tagId)?.name;

    await clickhouseClient.exec({
      query: `
      DELETE FROM tags
      WHERE id = {id: UUID} AND span_id = {span_id: UUID} AND project_id = {project_id: UUID}
    `,
      query_params: {
        id: tagId,
        span_id: spanId,
        project_id: projectId,
      },
    });

    // Remove the tag from the span's tags_array in ClickHouse
    if (deletedTagName) {
      await removeTagFromCHSpan({
        spanId,
        projectId,
        tag: deletedTagName,
      });
    }

    return new Response("Span label deleted successfully", { status: 200 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to delete span tag" },
      { status: 500 }
    );
  }
}
