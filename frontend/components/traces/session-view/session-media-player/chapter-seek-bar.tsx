"use client";

import { ChevronDown } from "lucide-react";
import React, { memo, useCallback, useMemo, useRef } from "react";
import { shallow } from "zustand/shallow";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

import { type MediaChapter, selectMediaChapters, useSessionViewStore } from "../store";

/** Youtube-style seek bar with one band per chapter.
 *
 *  Each band's width is proportional to its chapter's contentDurationMs (real
 *  media duration, independent of session-timeline gaps). The playhead is
 *  computed by locating which chapter contains the current epoch and
 *  projecting inside its band.
 *
 *  Click anywhere to seek; double-click inside a non-active band snaps to its
 *  start (also available via the dropdown picker). */
function ChapterSeekBar() {
  const { chapters, playheadEpochMs, activeMediaTraceId, seekTo, seekToChapter } = useSessionViewStore(
    (s) => ({
      chapters: selectMediaChapters(s),
      playheadEpochMs: s.playheadEpochMs,
      activeMediaTraceId: s.activeMediaTraceId,
      seekTo: s.seekTo,
      seekToChapter: s.seekToChapter,
    }),
    shallow
  );

  const barRef = useRef<HTMLDivElement>(null);

  const layout = useMemo(() => {
    const durations = chapters.map((c) => Math.max(0, c.endTimeMs - c.startTimeMs));
    const total = durations.reduce((a, b) => a + b, 0);
    const bands: { chapter: MediaChapter; leftPct: number; widthPct: number }[] = [];
    let running = 0;
    for (let i = 0; i < chapters.length; i++) {
      const pct = total > 0 ? (durations[i] / total) * 100 : 100 / chapters.length;
      bands.push({ chapter: chapters[i], leftPct: running, widthPct: pct });
      running += pct;
    }
    return { bands, total, durations };
  }, [chapters]);

  const playheadPct = useMemo(() => {
    if (playheadEpochMs === undefined || !layout.bands.length) return null;
    for (let i = 0; i < layout.bands.length; i++) {
      const { chapter, leftPct, widthPct } = layout.bands[i];
      const dur = layout.durations[i];
      if (playheadEpochMs < chapter.startTimeMs) {
        return leftPct;
      }
      if (playheadEpochMs <= chapter.endTimeMs) {
        // Zero-duration chapter: snap to its left edge instead of dividing
        // by zero. Non-zero: project within the band.
        const frac = dur > 0 ? (playheadEpochMs - chapter.startTimeMs) / dur : 0;
        return leftPct + widthPct * frac;
      }
    }
    // Past the end.
    const last = layout.bands[layout.bands.length - 1];
    return last.leftPct + last.widthPct;
  }, [playheadEpochMs, layout]);

  const handleBarClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = barRef.current?.getBoundingClientRect();
      if (!rect || !layout.bands.length) return;
      const pct = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
      // Locate which band we're in.
      for (let i = 0; i < layout.bands.length; i++) {
        const { chapter, leftPct, widthPct } = layout.bands[i];
        if (pct >= leftPct && pct <= leftPct + widthPct) {
          const localFrac = widthPct > 0 ? (pct - leftPct) / widthPct : 0;
          const dur = layout.durations[i];
          const epoch = chapter.startTimeMs + localFrac * dur;
          seekTo(epoch);
          return;
        }
      }
    },
    [layout, seekTo]
  );

  const activeChapter = chapters.find((c) => c.traceId === activeMediaTraceId);

  if (chapters.length === 0) return null;

  return (
    <div className="flex items-center gap-2 w-full">
      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(
            "flex items-center gap-1 text-xs px-2 py-1 rounded border bg-background hover:bg-secondary",
            "truncate max-w-[220px]"
          )}
          title={activeChapter ? `Chapter: ${activeChapter.label}` : "Select chapter"}
        >
          <span className="truncate">
            {activeChapter
              ? `${chapters.findIndex((c) => c.traceId === activeChapter.traceId) + 1}. ${activeChapter.label}`
              : "Chapters"}
          </span>
          <ChevronDown size={12} className="shrink-0" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-[320px] overflow-y-auto">
          {chapters.map((c, i) => (
            <DropdownMenuItem
              key={c.traceId}
              onClick={() => seekToChapter(c.traceId)}
              className={cn("gap-2 text-xs", c.traceId === activeMediaTraceId && "bg-secondary")}
            >
              <span className="text-muted-foreground tabular-nums w-6 text-right">{i + 1}.</span>
              <span className="flex-1 truncate">{c.label}</span>
              <ChapterKindBadge kind={c.kind} />
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <div
        ref={barRef}
        onClick={handleBarClick}
        className="relative flex-1 h-2 rounded-full bg-secondary cursor-pointer group"
        role="slider"
        aria-label="Media timeline"
      >
        <div className="absolute inset-0 flex items-center gap-[2px] pointer-events-none">
          {layout.bands.map((band) => (
            <Band key={band.chapter.traceId} band={band} isActive={band.chapter.traceId === activeMediaTraceId} />
          ))}
        </div>
        {playheadPct !== null && (
          <div
            className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-primary shadow pointer-events-none"
            style={{ left: `calc(${playheadPct}% - 6px)` }}
          />
        )}
      </div>
    </div>
  );
}

interface BandProps {
  band: { chapter: MediaChapter; leftPct: number; widthPct: number };
  isActive: boolean;
}

const Band = memo(function Band({ band, isActive }: BandProps) {
  return (
    <div
      className={cn(
        "h-full rounded-sm transition-colors",
        isActive ? "bg-primary/40" : "bg-muted-foreground/30",
        band.chapter.kind === "empty" && "bg-muted-foreground/10"
      )}
      style={{ width: `calc(${band.widthPct}% - 2px)` }}
      title={band.chapter.label}
    />
  );
});

function ChapterKindBadge({ kind }: { kind: MediaChapter["kind"] }) {
  const label = kind === "browser" ? "session" : kind === "images" ? "images" : kind === "empty" ? "—" : "…";
  return <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>;
}

export default memo(ChapterSeekBar);
