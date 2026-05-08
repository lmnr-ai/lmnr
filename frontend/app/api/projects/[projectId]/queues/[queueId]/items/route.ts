import { prettifyError, ZodError } from "zod/v4";

import { getQueueProgress, listQueueItemIds, listQueueItems } from "@/lib/actions/queue";

/**
 * Two response shapes from one endpoint, distinguished by query params.
 *
 * 1) `?ids=<csv>` — fetcher mode. Returns `{ items }` for the supplied ids
 *    only, in `(created_at, id)` order. Used by the queue UI to lazy-fetch
 *    the 5-item window around `currentIndex`. No progress is included to
 *    avoid an extra FINAL count on every window slide.
 *
 * 2) No `ids` — index mode. Returns `{ ids, progress }`: the full ordered
 *    id list plus the labelled/total counts. Used once on mount and on
 *    revalidate-after-mutation. Items themselves are NOT included; the UI
 *    fetches the window via mode (1) once it knows currentIndex.
 *
 * Two clients sharing one route. The shape divergence is intentional —
 * keeping the URL stable means SWR cache keys for the index are simple
 * (just the URL) and don't have to encode an opaque `mode` param.
 */
export async function GET(req: Request, props: { params: Promise<{ projectId: string; queueId: string }> }) {
  const { projectId, queueId } = await props.params;
  const url = new URL(req.url);
  const idsParam = url.searchParams.get("ids");
  const requestedIds = idsParam
    ? idsParam
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
    : null;

  try {
    if (requestedIds) {
      const items = await listQueueItems({ projectId, queueId, ids: requestedIds });
      return Response.json({ items });
    }

    const [ids, progress] = await Promise.all([
      listQueueItemIds({ projectId, queueId }),
      getQueueProgress({ projectId, queueId }),
    ]);
    return Response.json({ ids, progress });
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }
    console.error("Error fetching queue items:", error);
    return Response.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 });
  }
}
