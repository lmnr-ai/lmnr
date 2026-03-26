import { type NextRequest } from "next/server";

import { removeTagFromCHSpan } from "@/lib/actions/tags";

export async function DELETE(
  _req: NextRequest,
  props: { params: Promise<{ projectId: string; spanId: string; tagId: string }> }
): Promise<Response> {
  const params = await props.params;
  const projectId = params.projectId;
  const spanId = params.spanId;
  // tagId is the tag name (used as id since tags_array stores names)
  const tagName = decodeURIComponent(params.tagId);

  await removeTagFromCHSpan({
    spanId,
    projectId,
    tag: tagName,
  });

  return new Response("Span tag deleted successfully", { status: 200 });
}
