"use client";

import { X } from "lucide-react";
import React, { memo, useEffect, useMemo } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { shallow } from "zustand/shallow";

import { Button } from "@/components/ui/button";

import { selectMediaChapters, useSessionViewStore } from "../store";
import BrowserSessionSurface from "./browser-session-surface";
import ChapterSeekBar from "./chapter-seek-bar";
import ImagesSurface from "./images-surface";
import PlayerControls from "./player-controls";

/**
 * Orchestrator for the session-view media player. Picks the active chapter,
 * decides which surface (browser-session | images) to render, and drives
 * playback-loop state (start-of-chapter auto-advance on playback end, etc.).
 */
function SessionMediaPlayer() {
  const {
    chapters,
    activeMediaTraceId,
    setActiveMediaTraceId,
    setMediaPanelOpen,
    playheadEpochMs,
    seekTo,
    togglePlay,
  } = useSessionViewStore(
    (s) => ({
      chapters: selectMediaChapters(s),
      activeMediaTraceId: s.activeMediaTraceId,
      setActiveMediaTraceId: s.setActiveMediaTraceId,
      setMediaPanelOpen: s.setMediaPanelOpen,
      playheadEpochMs: s.playheadEpochMs,
      seekTo: s.seekTo,
      togglePlay: s.togglePlay,
    }),
    shallow
  );

  // Select an initial chapter the first time the panel opens.
  useEffect(() => {
    if (activeMediaTraceId || chapters.length === 0) return;
    setActiveMediaTraceId(chapters[0].traceId);
    seekTo(chapters[0].startTimeMs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapters.length, activeMediaTraceId]);

  // Advance the active chapter when the playhead crosses its boundary. This
  // keeps the surface following the global timeline instead of stranding the
  // playhead in a chapter that no longer contains it. If the playhead is past
  // the active chapter's end (either because playback reached the tail or the
  // user seeked into a gap), jump to the start of the next chapter so playback
  // continues across the session.
  useEffect(() => {
    if (playheadEpochMs === undefined || chapters.length === 0) return;

    const containingIdx = chapters.findIndex((c) => playheadEpochMs >= c.startTimeMs && playheadEpochMs <= c.endTimeMs);
    if (containingIdx !== -1) {
      const c = chapters[containingIdx];
      if (c.traceId !== activeMediaTraceId) setActiveMediaTraceId(c.traceId);
      return;
    }

    // Playhead is between chapters (gap or past-end). Find the next chapter
    // whose start is after the playhead and snap to it; if none, stop.
    const nextIdx = chapters.findIndex((c) => c.startTimeMs > playheadEpochMs);
    if (nextIdx !== -1) {
      const next = chapters[nextIdx];
      setActiveMediaTraceId(next.traceId);
      seekTo(next.startTimeMs);
    }
  }, [playheadEpochMs, chapters, activeMediaTraceId, setActiveMediaTraceId, seekTo]);

  const activeChapter = useMemo(
    () => chapters.find((c) => c.traceId === activeMediaTraceId),
    [chapters, activeMediaTraceId]
  );

  const timelineStartMs = chapters[0]?.startTimeMs;
  const timelineEndMs = chapters[chapters.length - 1]?.endTimeMs;

  useHotkeys("space", togglePlay, { preventDefault: true });

  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-background border-l">
      <div className="flex items-center gap-2 px-2 h-8 border-b shrink-0">
        <span className="text-xs font-medium">Media</span>
        <Button onClick={() => setMediaPanelOpen(false)} className="ml-auto" variant="ghost" size="icon">
          <X className="w-4 h-4" />
        </Button>
      </div>

      <div className="flex-1 min-h-0 relative">
        {!activeChapter ? (
          <div className="flex w-full h-full items-center justify-center p-4">
            <p className="text-sm text-muted-foreground">No traces to play.</p>
          </div>
        ) : activeChapter.kind === "images" ? (
          <ImagesSurface traceId={activeChapter.traceId} />
        ) : activeChapter.kind === "empty" ? (
          // For chapters with no media, probe both surfaces — browser-session
          // is authoritative, so mount it first. If that also comes back
          // empty, the surface renders its own empty-state message.
          <BrowserSessionSurface traceId={activeChapter.traceId} />
        ) : (
          // `browser` or `unknown` — browser-session surface probes on mount
          // and publishes its kind to the store (either `browser` or `empty`).
          // If the probe finds no events AND the trace has llm-image spans
          // loaded, we'll fall through on next render to ImagesSurface via the
          // `empty → images` fallback. For now the surface handles its own
          // empty state explicitly.
          <BrowserSessionSurface traceId={activeChapter.traceId} />
        )}
      </div>

      <div className="flex items-center gap-2 px-2 h-10 border-t shrink-0">
        <PlayerControls timelineStartMs={timelineStartMs} timelineEndMs={timelineEndMs} />
        <ChapterSeekBar />
      </div>
    </div>
  );
}

export default memo(SessionMediaPlayer);
