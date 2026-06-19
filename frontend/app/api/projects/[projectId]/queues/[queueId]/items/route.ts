import { prettifyError, ZodError } from "zod/v4";

import { listQueueItems, listQueueItemStates } from "@/lib/actions/queue";

/**
 * Two response shapes from one endpoint, distinguished by query params.
 *
 * 1) `?ids=<csv>` — fetcher mode. Returns `{ items }` for the supplied ids
 *    only, in `(created_at, id)` order. Used by the queue UI to lazy-fetch
 *    the 5-item window around `currentIndex`.
 *
 * 2) No `ids` — index mode. Returns `{ items: [{id, state}] }`: one tuple
 *    per queue row in the master `(created_at, id)` order. Tiny per-row
 *    payload (id + 'new' | 'modified' | 'approved') keeps the index call
 *    cheap even for thousands of items. The UI both drives navigation
 *    from this list AND renders the navigator bar / derives counts from it.
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

    const items = await listQueueItemStates({ projectId, queueId });
    return Response.json({ items });
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }
    console.error("Error fetching queue items:", error);
    return Response.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 });
  }
}
