"use client";

import { useParams } from "next/navigation";
import useSWR from "swr";

import { unreadClusterCountsKey } from "@/components/signal-clusters/use-signal-clusters";
import { swrFetcher } from "@/lib/api/fetch-api";

/**
 * The sidebar renders on every project page, so it neither refetches on focus nor more than once a minute;
 * actions that change what it shows refresh it explicitly.
 */
export const SIDEBAR_SWR_OPTIONS = { revalidateOnFocus: false, dedupingInterval: 60_000 };

/** The current user's unread cluster count; all signals when `signalId` is omitted. */
export default function SignalsUnreadBadge({ signalId }: { signalId?: string }) {
  const { projectId } = useParams<{ projectId: string }>();
  // One request shared by every badge (SWR dedupes the key).
  const { data } = useSWR<Record<string, number>>(unreadClusterCountsKey(projectId), swrFetcher, SIDEBAR_SWR_OPTIONS);
  const count = signalId ? (data?.[signalId] ?? 0) : Object.values(data ?? {}).reduce((a, b) => a + b, 0);
  if (!count) return null;
  return (
    <span className="ml-auto shrink-0 rounded-full border border-primary/5 bg-primary-400/15 px-1.5 text-[10px] font-medium leading-4 text-primary-200">
      {count}
    </span>
  );
}
