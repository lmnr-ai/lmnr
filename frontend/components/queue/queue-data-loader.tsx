"use client";

import { useEffect, useRef } from "react";
import useSWR from "swr";

import { useToast } from "@/lib/hooks/use-toast";
import { type LabelingQueueItem } from "@/lib/queue/types";
import { swrFetcher } from "@/lib/utils";

import { useQueueStore } from "./queue-store";

interface QueueIndexResponse {
  ids: string[];
  progress: { total: number; labelled: number };
}

interface QueueWindowResponse {
  items: LabelingQueueItem[];
}

/**
 * Two-phase data loader for the windowed queue UI:
 *
 *  1) The "index" SWR call hits `/items` with no `?ids` and gets back just
 *     the ordered id list + progress counters. This is the cheap, cacheable
 *     query that lets the user see total/approved counts and lets the store
 *     know the queue size BEFORE we've fetched any rows.
 *
 *  2) The "window" effect watches `currentIndex` and fetches only the rows
 *     in `[currentIndex - 2, currentIndex + 2]` that aren't already loaded.
 *     Window fetches are issued via a manual `fetch` (not SWR) keyed by the
 *     comma-joined id list, which would explode the SWR cache as the user
 *     pages through a large queue. An `AbortController` cancels in-flight
 *     window fetches when nav supersedes them, preventing late hydrate-on
 *     -wrong-window from clobbering the user's actual viewport.
 *
 * No props are threaded — the component reads `currentIndex` reactively and
 * calls store helpers (`getMissingWindowIds`, `hydrateWindow`) so the loader
 * stays a passive consumer of store-derived window math.
 */
export default function QueueDataLoader() {
  const { toast } = useToast();
  const projectId = useQueueStore((s) => s.projectId);
  const queueId = useQueueStore((s) => s.queue.id);
  const idsListLength = useQueueStore((s) => s.idsList.length);
  const currentIndex = useQueueStore((s) => s.currentIndex);

  const hydrateIndex = useQueueStore((s) => s.hydrateIndex);
  const hydrateWindow = useQueueStore((s) => s.hydrateWindow);
  const getMissingWindowIds = useQueueStore((s) => s.getMissingWindowIds);
  const registerRevalidate = useQueueStore((s) => s.registerRevalidate);
  const flushPendingSaves = useQueueStore((s) => s.flushPendingSaves);

  const { data, error, mutate } = useSWR<QueueIndexResponse>(
    `/api/projects/${projectId}/queues/${queueId}/items`,
    swrFetcher
  );

  useEffect(() => {
    registerRevalidate(() => mutate());
  }, [registerRevalidate, mutate]);

  useEffect(() => {
    if (data?.ids) hydrateIndex(data.ids, data.progress);
  }, [data, hydrateIndex]);

  useEffect(() => {
    if (error) toast({ variant: "destructive", title: "Failed to load queue items" });
  }, [error, toast]);

  // Window fetch — re-runs whenever the focused index moves into a new window
  // OR when a revalidate (post-mutation) lengthens / shifts idsList. The
  // controller ref guarantees a stale fetch can't overwrite a newer one.
  const windowControllerRef = useRef<AbortController | null>(null);
  useEffect(() => {
    if (idsListLength === 0) return;
    const missing = getMissingWindowIds(currentIndex);
    if (missing.length === 0) return;

    const previousController = windowControllerRef.current;
    if (previousController) previousController.abort();
    const controller = new AbortController();
    windowControllerRef.current = controller;

    void (async () => {
      try {
        const url = `/api/projects/${projectId}/queues/${queueId}/items?ids=${encodeURIComponent(missing.join(","))}`;
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) {
          // We deliberately do NOT toast here — the index already loaded, so
          // the empty cells will refetch on the next nav. Toasting on every
          // window failure would spam the user mid-labelling.
          return;
        }
        const json = (await res.json()) as QueueWindowResponse;
        if (controller.signal.aborted) return;
        hydrateWindow(json.items);
      } catch {
        // AbortError or network blip — newer fetch will replace this one.
      } finally {
        if (windowControllerRef.current === controller) windowControllerRef.current = null;
      }
    })();
  }, [currentIndex, idsListLength, getMissingWindowIds, hydrateWindow, projectId, queueId]);

  // Leaving the page should not silently drop in-flight debounced edits.
  useEffect(() => () => flushPendingSaves(), [flushPendingSaves]);

  return null;
}
