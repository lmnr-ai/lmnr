import useSWR from "swr";

import { sessionTracesUrl } from "@/components/traces/chat-session-view/session-api";
import { swrFetcher } from "@/lib/api/fetch-api";
import { type TraceRow } from "@/lib/traces/types";

type State = { status: "loading" } | { status: "error" } | { status: "ready"; traces: TraceRow[] };

/** The session's turns (trace rows, start-time order); hovering the same session across rows reuses one request. */
export function useSessionTurns(projectId: string, sessionId: string): State {
  const { data, error } = useSWR<{ items: TraceRow[] }>(
    // A hover isn't opening the session, so it's not audited as a view.
    sessionTracesUrl(projectId, sessionId, true),
    swrFetcher
  );
  if (error) return { status: "error" };
  return data ? { status: "ready", traces: data.items } : { status: "loading" };
}
