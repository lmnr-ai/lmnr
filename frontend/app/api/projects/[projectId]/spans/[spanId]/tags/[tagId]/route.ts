import { getSpanTags, removeTagFromCHSpan } from "@/lib/actions/tags";
import { handleRoute } from "@/lib/api/route-handler";
import { clickhouseClient } from "@/lib/clickhouse/client";

export const DELETE = handleRoute<{ projectId: string; spanId: string; tagId: string }, unknown>(
  async (_req, params) => {
    const { projectId, spanId, tagId } = params;

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

    return { success: true };
  }
);
