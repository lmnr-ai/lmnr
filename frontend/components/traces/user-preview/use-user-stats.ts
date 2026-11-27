import useSWR from "swr";

import { type TraceUserStats } from "@/lib/actions/trace-users";
import { swrFetcher } from "@/lib/api/fetch-api";

type State = { status: "loading" } | { status: "error" } | { status: "ready"; stats: TraceUserStats | null };

/** A user's lifetime stats; hovering the same user across rows reuses one request. */
export function useUserStats(projectId: string, userId: string): State {
  const { data, error } = useSWR<TraceUserStats | null>(
    `/api/projects/${projectId}/trace-users/stats?userId=${encodeURIComponent(userId)}`,
    swrFetcher
  );
  if (error) return { status: "error" };
  return data === undefined ? { status: "loading" } : { status: "ready", stats: data };
}
