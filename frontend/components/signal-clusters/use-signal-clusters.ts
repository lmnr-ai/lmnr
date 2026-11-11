"use client";

import { useCallback } from "react";
import useSWR, { useSWRConfig } from "swr";

import { useUserContext } from "@/contexts/user-context.tsx";
import { type SignalCluster, type SignalClustersResponse } from "@/lib/actions/signal-clusters/types";
import { fetchApi, swrFetcher } from "@/lib/api/fetch-api";
import { useToast } from "@/lib/hooks/use-toast";

export const unreadClusterCountsKey = (projectId: string) => `/api/projects/${projectId}/signals/clusters-unread`;

/** A signal's clusters plus the per-user actions on them; actions refresh the sidebar counts too. */
export function useSignalClusters(projectId: string, signalId: string) {
  const key = `/api/projects/${projectId}/signals/${signalId}/clusters`;
  const { data, isLoading, mutate } = useSWR<SignalClustersResponse>(key, swrFetcher);
  const { mutate: mutateGlobal } = useSWRConfig();
  const { toast } = useToast();
  // The optimistic activity entries name the current user, as the server will.
  const me = useUserContext().name;

  const markViewed = useCallback(
    async (clusterId: string) => {
      void mutate((d) => d && { ...d, items: d.items.map((i) => (i.id === clusterId ? { ...i, unread: false } : i)) }, {
        revalidate: false,
      });
      const { error } = await fetchApi(`${key}/${clusterId}/view`, { method: "POST" });
      if (error) return toast({ title: error, variant: "destructive" });
      void mutateGlobal(unreadClusterCountsKey(projectId));
    },
    [key, mutate, mutateGlobal, projectId, toast]
  );

  /**
   * Shows `patch` on the cluster at once, POSTs `body` to its `action` route, then caches the refetched list.
   * Rolls back and toasts on error. Returns whether the write succeeded.
   */
  const update = useCallback(
    async (
      clusterId: string,
      action: "resolve" | "archive",
      body: object,
      patch: (cluster: SignalCluster) => SignalCluster
    ) => {
      const write = async () => {
        const { error } = await fetchApi(`${key}/${clusterId}/${action}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (error) throw new Error(error);
        // The server derives status and order, so its list replaces the optimistic one.
        return swrFetcher<SignalClustersResponse>(key);
      };
      try {
        await mutate(write, {
          // Actions only run on a loaded list, so `d` is always there.
          optimisticData: (d) =>
            ({
              ...d,
              items: (d?.items ?? []).map((i) => (i.id === clusterId ? patch(i) : i)),
            }) as SignalClustersResponse,
          rollbackOnError: true,
          revalidate: false,
        });
      } catch (e) {
        toast({ title: e instanceof Error ? e.message : String(e), variant: "destructive" });
        return false;
      }
      // Archived clusters don't count as unread.
      if (action === "archive") void mutateGlobal(unreadClusterCountsKey(projectId));
      return true;
    },
    [key, mutate, mutateGlobal, projectId, toast]
  );

  const setResolved = useCallback(
    (clusterId: string, resolved: boolean) =>
      update(clusterId, "resolve", { resolved }, (i) => {
        if (resolved) {
          if (i.status === "resolved") return i;
          const now = new Date().toISOString();
          const resolution = { resolvedAt: now, resolvedBy: me, reopenedAt: null, reopenedBy: null };
          return { ...i, status: "resolved", resolutions: [...i.resolutions, resolution] };
        }
        const now = new Date().toISOString();
        const resolutions = i.resolutions.map((r) =>
          r.reopenedAt === null ? { ...r, reopenedAt: now, reopenedBy: me } : r
        );
        return { ...i, status: "open", resolutions };
      }),
    [update, me]
  );

  const setArchived = useCallback(
    (clusterId: string, archived: boolean) =>
      update(clusterId, "archive", { archived }, (i) => ({
        ...i,
        archived: archived ? { archivedAt: new Date().toISOString(), archivedBy: me } : null,
      })),
    [update, me]
  );

  return { data, isLoading, markViewed, setResolved, setArchived };
}
