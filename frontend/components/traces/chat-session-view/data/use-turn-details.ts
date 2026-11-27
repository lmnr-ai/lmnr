import useSWR from "swr";

import { type TraceRow } from "@/lib/traces/types";

import { useChatSession } from "../store";
import { replyOf } from "./live-traces";

/**
 * A turn's reply (once it's not live) and span counts, fetched while it's on screen. Settled fetches are keyed by the
 * trace's end time, so a turn that settles again after new spans fetches both anew.
 */
export function useTurnDetails({ id: traceId, endTime }: TraceRow, live: boolean) {
  const loadReply = useChatSession((s) => s.loadReply);
  const loadCounts = useChatSession((s) => s.loadCounts);
  // `null`: the turn has no reply (the route omits it), as opposed to `undefined`, not loaded yet.
  const reply = useSWR(
    live ? null : ["chat-turn-reply", traceId, endTime],
    async () => (await loadReply(traceId)) ?? null,
    {
      revalidateOnFocus: false,
      // Failures surface a Retry button instead.
      shouldRetryOnError: false,
    }
  );
  const { data: counts } = useSWR(["chat-turn-counts", traceId, live || endTime], () => loadCounts(traceId), {
    revalidateOnFocus: false,
    keepPreviousData: true,
  });
  return {
    reply: replyOf(live, reply.data, !!reply.error),
    retryReply: () => void reply.mutate(),
    counts,
  };
}
