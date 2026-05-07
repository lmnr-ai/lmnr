"use client";

import { Loader2 } from "lucide-react";
import { useParams } from "next/navigation";
import React, { memo, useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { shallow } from "zustand/shallow";

import { type SpanImage } from "@/lib/actions/span/images";
import { SpanType } from "@/lib/traces/types";
import { cn } from "@/lib/utils";

import { selectMediaChapters, useSessionViewStore, useSessionViewStoreRaw } from "../store";

interface ImagesSurfaceProps {
  traceId: string;
}

const postFetcher = async ({ url, spanIds }: { url: string; spanIds: string[] }) => {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ spanIds }),
  });
  if (!response.ok) throw new Error("Failed to fetch images");
  return response.json();
};

function ImagesSurfaceInner({ traceId }: ImagesSurfaceProps) {
  const { projectId } = useParams<{ projectId: string }>();
  const rawStore = useSessionViewStoreRaw();

  const { traceSpans, setChapterMeta, playheadEpochMs, isPlaying } = useSessionViewStore(
    (s) => ({
      traceSpans: s.traceSpans,
      setChapterMeta: s.setChapterMeta,
      playheadEpochMs: s.playheadEpochMs,
      isPlaying: s.isPlaying,
    }),
    shallow
  );

  const llmSpanIds = useMemo(
    () => (traceSpans[traceId] ?? []).filter((s) => s.spanType === SpanType.LLM).map((s) => s.spanId),
    [traceSpans, traceId]
  );

  const swrKey = llmSpanIds.length
    ? { url: `/api/projects/${projectId}/traces/${traceId}/spans/images`, spanIds: llmSpanIds }
    : null;

  const { data, isLoading } = useSWR<{ images: SpanImage[] }>(swrKey, postFetcher);
  const images = useMemo(() => {
    if (!data?.images) return [];
    return [...data.images].sort((a, b) => a.timestamp - b.timestamp);
  }, [data]);

  // Preload images so playhead-driven swaps don't flicker. Mark each url ready
  // as soon as it loads (or errors) instead of waiting for the whole batch, so
  // one slow/broken image can't hide later frames indefinitely.
  const [preloaded, setPreloaded] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!images.length) return;
    let cancelled = false;
    const reveal = (url: string) => {
      if (cancelled) return;
      setPreloaded((prev) => {
        if (prev.has(url)) return prev;
        const next = new Set(prev);
        next.add(url);
        return next;
      });
    };
    for (const img of images) {
      const el = new Image();
      el.onload = () => reveal(img.imageUrl);
      // Don't reveal on error — leave the frame hidden rather than flashing a
      // broken-image placeholder. A subsequent frame still reveals normally.
      el.src = img.imageUrl;
    }
    return () => {
      cancelled = true;
    };
  }, [images]);

  // Publish chapter meta once images resolve.
  useEffect(() => {
    if (!images.length) {
      if (!isLoading) setChapterMeta(traceId, { kind: "empty" });
      return;
    }
    setChapterMeta(traceId, {
      kind: "images",
      contentStartMs: images[0].timestamp,
      contentEndMs: images[images.length - 1].timestamp,
    });
  }, [images, isLoading, traceId, setChapterMeta]);

  // Derive the displayed image index directly from the playhead and the
  // sorted image list. Using useMemo avoids the setState-in-effect pattern
  // and keeps the index perfectly in sync without extra subscriptions.
  const currentIdx = useMemo(() => {
    if (!images.length) return 0;
    if (playheadEpochMs === undefined) return 0;
    let best = 0;
    for (let i = 0; i < images.length; i++) {
      if (images[i].timestamp <= playheadEpochMs) best = i;
      else break;
    }
    return best;
  }, [images, playheadEpochMs]);

  // Playback ticker: advance playhead based on speed when playing. Only
  // schedules a timer while isPlaying is true so we don't burn cycles on a
  // 24Hz no-op when the user has the images chapter paused.
  //
  // At the end of this chapter we must nudge the playhead PAST `last` (by
  // 1ms) — the orchestrator's containment check uses `<=`, so a playhead
  // clamped exactly to `last` still registers as "inside this chapter" and
  // auto-advance never fires. Stepping 1ms past pushes the playhead into the
  // gap / next-chapter region so the orchestrator can snap to the next
  // chapter's start. If this is the last chapter (no next target), pause.
  useEffect(() => {
    if (!isPlaying || !images.length) return;
    const interval = setInterval(() => {
      const state = rawStore.getState();
      if (!state.isPlaying) return;
      const playhead = state.playheadEpochMs ?? images[0].timestamp;
      const last = images[images.length - 1].timestamp;
      if (playhead >= last) {
        const chapters = selectMediaChapters(state);
        const hasNext = chapters.some((c) => c.startTimeMs > last);
        if (hasNext) {
          // Let the orchestrator auto-advance to the next chapter.
          rawStore.getState().setPlayheadEpochMs(last + 1);
        } else {
          rawStore.getState().setIsPlaying(false);
        }
        return;
      }
      const next = Math.min(last, playhead + 42 * state.playbackSpeed);
      rawStore.getState().setPlayheadEpochMs(next);
    }, 42);
    return () => clearInterval(interval);
  }, [images, rawStore, isPlaying]);

  if (isLoading) {
    return (
      <div className="flex w-full h-full gap-2 p-4 items-center justify-center">
        <Loader2 className="animate-spin w-4 h-4" /> Loading images...
      </div>
    );
  }

  if (!images.length) {
    return (
      <div className="flex w-full h-full gap-2 p-4 items-center justify-center">
        <div className="text-center">
          <h3 className="text-sm font-medium mb-1">No media</h3>
          <p className="text-xs text-muted-foreground">
            This trace has no recorded session or images. Skip to the next chapter.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex items-center justify-center p-4 h-full min-h-0 relative">
      {images.map((image, index) => (
        <img
          key={`${index}-${image.imageUrl}`}
          src={image.imageUrl}
          alt={`Frame ${index}`}
          className={cn("absolute max-w-full max-h-full object-contain opacity-0", {
            "opacity-100": index === currentIdx,
          })}
          style={{ display: preloaded.has(image.imageUrl) ? "block" : "none" }}
        />
      ))}
    </div>
  );
}

export default memo(ImagesSurfaceInner);
