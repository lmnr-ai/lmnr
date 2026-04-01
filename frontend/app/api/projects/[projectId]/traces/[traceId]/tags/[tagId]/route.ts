import { type NextRequest } from "next/server";

import { removeTagFromCHTrace } from "@/lib/actions/tags";

export async function DELETE(
  _req: NextRequest,
  props: { params: Promise<{ projectId: string; traceId: string; tagId: string }> }
): Promise<Response> {
  const params = await props.params;
  const projectId = params.projectId;
  const traceId = params.traceId;
  // tagId is the tag name (used as id since trace_tags stores names).
  // Next.js auto-decodes dynamic route params, so no decodeURIComponent needed.
  const tagName = params.tagId;

  await removeTagFromCHTrace({
    traceId,
    projectId,
    tag: tagName,
  });

  return new Response("Trace tag deleted successfully", { status: 200 });
}
