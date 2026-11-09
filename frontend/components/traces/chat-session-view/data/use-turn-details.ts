import useSWR from "swr";

import { useSessionData } from "./index";
import { replyOf } from "./live-traces";

/**
 * A turn's reply and span counts, fetched once it's on screen and not live. Both are keyed by settled-ness, so a turn
 * that settles again after new spans fetches them anew.
 */
export function useTurnDetails(traceId: string, live: boolean) {
  const { loadReply, loadCounts } = useSessionData();
  // `null`: the turn has no reply (the route omits it), as opposed to `undefined`, not loaded yet.
  const reply = useSWR(live ? null : ["chat-turn-reply", traceId], async () => (await loadReply(traceId)) ?? null, {
    revalidateOnFocus: false,
    // Failures surface a Retry button instead.
    shouldRetryOnError: false,
  });
  const { data: counts } = useSWR(["chat-turn-counts", traceId, live], () => loadCounts(traceId), {
    revalidateOnFocus: false,
    keepPreviousData: true,
  });
  return {
    reply: replyOf(live, reply.data, !!reply.error),
    retryReply: () => void reply.mutate(),
    counts,
  };
}
