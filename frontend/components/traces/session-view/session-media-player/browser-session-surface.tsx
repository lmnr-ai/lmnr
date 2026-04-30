"use client";

import "rrweb-player/dist/style.css";
import "@/lib/styles/session-player.css";

import { Loader2 } from "lucide-react";
import { useParams } from "next/navigation";
import React, { memo, useEffect, useRef, useState } from "react";
import rrwebPlayer from "rrweb-player";

import { fetchBrowserSessionEvents, type UrlChange } from "@/components/session-player/utils";

import { useSessionViewStore, useSessionViewStoreRaw } from "../store";

interface ChapterContent {
  events: any[];
  urlChanges: UrlChange[];
  startTime: number;
  endTime: number;
}

// Bounded LRU so revisiting chapters is instant but we don't hold a pile of
// decoded rrweb event arrays forever (each can be >10MB after gunzip).
const MAX_CACHED_CHAPTERS = 4;

interface BrowserSessionSurfaceProps {
  traceId: string;
}

function BrowserSessionSurfaceInner({ traceId }: BrowserSessionSurfaceProps) {
  const { projectId } = useParams<{ projectId: string }>();
  const rawStore = useSessionViewStoreRaw();
  const setChapterMeta = useSessionViewStore((s) => s.setChapterMeta);

  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const cacheRef = useRef<Map<string, ChapterContent>>(new Map());
  const currentChapterRef = useRef<string | null>(null);
  // Track last commanded goto to avoid goto-feedback loop from ui-update-current-time.
  const lastSurfaceEpochMsRef = useRef<number>(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isEmpty, setIsEmpty] = useState(false);
  const [currentUrl, setCurrentUrl] = useState("");

  // Resize tracking — the single rrweb instance needs to be re-sized when the
  // panel does.
  const [dimensions, setDimensions] = useState({ width: 800, height: 480 });
  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setDimensions({ width, height });
      }
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (playerRef.current) {
      try {
        playerRef.current.$set({ width: dimensions.width, height: dimensions.height });
        playerRef.current.triggerResize();
      } catch {
        /* rrweb may not have mounted yet */
      }
    }
  }, [dimensions.width, dimensions.height]);

  // --- Load (or reuse cached) chapter events on traceId change ------------
  useEffect(() => {
    if (!traceId) return;
    let cancelled = false;

    const ensureChapter = async (): Promise<ChapterContent | null> => {
      const cached = cacheRef.current.get(traceId);
      if (cached) {
        // Refresh LRU recency.
        cacheRef.current.delete(traceId);
        cacheRef.current.set(traceId, cached);
        return cached;
      }
      setIsLoading(true);
      try {
        const url = `/api/projects/${projectId}/browser-sessions/events?traceId=${traceId}`;
        const result = await fetchBrowserSessionEvents(url);
        if (cancelled) return null;
        if (!result.events.length) {
          setChapterMeta(traceId, { kind: "empty" });
          return null;
        }
        const content: ChapterContent = {
          events: result.events,
          urlChanges: result.urlChanges,
          startTime: result.startTime,
          endTime: result.events[result.events.length - 1].timestamp,
        };
        cacheRef.current.set(traceId, content);
        while (cacheRef.current.size > MAX_CACHED_CHAPTERS) {
          const firstKey = cacheRef.current.keys().next().value;
          if (firstKey === undefined || firstKey === traceId) break;
          cacheRef.current.delete(firstKey);
        }
        setChapterMeta(traceId, {
          kind: "browser",
          contentStartMs: content.startTime,
          contentEndMs: content.endTime,
        });
        return content;
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    (async () => {
      const content = await ensureChapter();
      if (cancelled) return;
      if (!content) {
        setIsEmpty(true);
        // Still destroy previous player so we don't render a stale video
        // behind the empty-state message.
        playerRef.current?.$destroy?.();
        playerRef.current = null;
        currentChapterRef.current = null;
        return;
      }
      setIsEmpty(false);
      mountOrSwap(content);
    })();

    return () => {
      cancelled = true;
    };
    // `mountOrSwap` intentionally not listed — it closes over current refs via
    // a stable inner function, and would cause rebinds on every resize.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [traceId, projectId, setChapterMeta]);

  // --- Mount new player or swap events on the existing one ---------------
  const mountOrSwap = (content: ChapterContent) => {
    const container = containerRef.current;
    if (!container) return;

    // If we already have a player and only the chapter changed, rrweb-player
    // doesn't support swapping events without remount. Cheapest safe path:
    // destroy + remount with new events. The instance is a single DOM
    // subtree we already own, so this is cheap compared to cross-chapter
    // flicker of two concurrent instances.
    if (playerRef.current) {
      try {
        playerRef.current.$destroy();
      } catch {
        /* already gone */
      }
      playerRef.current = null;
    }
    // Also scrub remaining DOM children from the container — $destroy should
    // handle this but be defensive in case of aborted builds.
    container.innerHTML = "";

    playerRef.current = new rrwebPlayer({
      target: container,
      props: {
        showWarning: false,
        showDebug: false,
        autoPlay: false,
        skipInactive: false,
        events: content.events,
        showController: false,
        mouseTail: false,
        width: dimensions.width,
        height: dimensions.height,
        speed: rawStore.getState().playbackSpeed,
      },
    });
    currentChapterRef.current = traceId;
    if (content.urlChanges.length > 0) setCurrentUrl(content.urlChanges[0].url);

    playerRef.current.addEventListener?.("ui-update-current-time", (ev: any) => {
      // ev.payload is ms offset from the chapter's first event.
      const absoluteMs = content.startTime + ev.payload;
      lastSurfaceEpochMsRef.current = absoluteMs;
      rawStore.getState().setPlayheadEpochMs(absoluteMs);
      // URL tracking.
      const urlIdx = findUrlIndex(content.urlChanges, absoluteMs);
      if (urlIdx !== -1) {
        const url = content.urlChanges[urlIdx].url;
        setCurrentUrl((prev) => (prev === url ? prev : url));
      }
    });
    playerRef.current.addEventListener?.("ui-update-player-state", (ev: any) => {
      rawStore.getState().setIsPlaying(ev.payload === "playing");
    });

    // Apply initial seek if the orchestrator already positioned us.
    const playhead = rawStore.getState().playheadEpochMs;
    if (playhead !== undefined) {
      const localMs = Math.max(0, playhead - content.startTime);
      try {
        playerRef.current.goto(localMs);
      } catch {
        /* player not ready */
      }
    }
  };

  // --- Subscribe to seek requests + play/pause from the store ------------
  useEffect(
    () =>
      rawStore.subscribe((state, prev) => {
        const player = playerRef.current;
        if (!player) return;
        const content = cacheRef.current.get(traceId);
        if (!content) return;

        if (state.seekRequest && state.seekRequest !== prev.seekRequest) {
          const localMs = Math.max(0, state.seekRequest.epochMs - content.startTime);
          // Guard the feedback loop: if this seek is within 50ms of the last
          // time we reported up from the player, skip.
          if (Math.abs(state.seekRequest.epochMs - lastSurfaceEpochMsRef.current) < 50) return;
          try {
            const wasPlaying = state.isPlaying;
            if (wasPlaying) player.pause();
            setTimeout(() => {
              try {
                player.goto(localMs);
                if (wasPlaying) player.play();
              } catch {
                /* player disposed */
              }
            }, 0);
          } catch {
            /* ignore */
          }
        }
        if (state.isPlaying !== prev.isPlaying) {
          try {
            if (state.isPlaying) player.play();
            else player.pause();
          } catch {
            /* ignore */
          }
        }
        if (state.playbackSpeed !== prev.playbackSpeed) {
          try {
            player.setSpeed(state.playbackSpeed);
          } catch {
            /* ignore */
          }
        }
      }),
    [rawStore, traceId]
  );

  // --- Cleanup ---
  useEffect(
    () => () => {
      playerRef.current?.$destroy?.();
      playerRef.current = null;
    },
    []
  );

  return (
    <div className="relative w-full h-full flex flex-col min-h-0">
      {currentUrl && (
        <div className="flex items-center px-3 py-1 border-b shrink-0">
          <a
            href={currentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-xs text-secondary-foreground hover:underline hover:text-foreground truncate transition-colors"
            title={currentUrl}
          >
            {currentUrl}
          </a>
        </div>
      )}
      <div className="flex-1 min-h-0 min-w-0 relative">
        {isLoading ? (
          <div className="flex w-full h-full gap-2 p-4 items-center justify-center">
            <Loader2 className="animate-spin w-4 h-4" /> Loading browser session...
          </div>
        ) : isEmpty ? (
          <div className="flex w-full h-full gap-2 p-4 items-center justify-center">
            <div className="text-center">
              <h3 className="text-sm font-medium mb-1">No browser session</h3>
              <p className="text-xs text-muted-foreground">
                This trace has no recorded session. Skip to the next chapter to see available media.
              </p>
            </div>
          </div>
        ) : (
          <div ref={containerRef} className="absolute inset-0 overflow-hidden" />
        )}
      </div>
    </div>
  );
}

function findUrlIndex(urlChanges: UrlChange[], epochMs: number): number {
  if (!urlChanges.length) return -1;
  let left = 0;
  let right = urlChanges.length - 1;
  let result = 0;
  while (left <= right) {
    const mid = (left + right) >> 1;
    if (urlChanges[mid].timestamp <= epochMs) {
      result = mid;
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }
  return result;
}

export default memo(BrowserSessionSurfaceInner);
