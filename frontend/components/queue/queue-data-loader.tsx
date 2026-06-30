"use client";

import { useEffect, useRef } from "react";
import useSWR from "swr";

import { type QueueItemStateRow } from "@/lib/actions/queue";
import { useToast } from "@/lib/hooks/use-toast";
import { type LabelingQueueItem } from "@/lib/queue/types";
import { swrFetcher } from "@/lib/utils";

import { useQueueStore } from "./queue-store";

interface QueueIndexResponse {
  items: QueueItemStateRow[];
}

interface QueueWindowResponse {
  items: LabelingQueueItem[];
}

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

  const indexUrl = `/api/projects/${projectId}/queues/${queueId}/items`;

  const { data, error, mutate } = useSWR<QueueIndexResponse>(indexUrl, swrFetcher);

  useEffect(() => {
    registerRevalidate(() => mutate());
  }, [registerRevalidate, mutate]);

  useEffect(() => {
    if (data?.items) hydrateIndex(data.items);
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
