"use client";

import { motion } from "framer-motion";
import { FileText, FlaskConical, MessageCircle } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";

import { type SessionBlockView, useDebuggerSessionViewStore } from "../store";

// A row per block (trace / eval / text), in timeline order (blocks are ordered
// by created_at). Keyed by block id — the same key the virtualized list tracks
// as `activeBlockId` and accepts in scroll requests.
type OutlineRow = {
  blockId: string;
  text: string;
  kind: "trace" | "eval" | "text";
};

// A short label for a standalone text block: the first N characters of its
// content (whitespace collapsed), truncated with an ellipsis.
const TEXT_BLOCK_TITLE_LEN = 40;
const textBlockTitle = (text: string): string => {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > TEXT_BLOCK_TITLE_LEN ? `${oneLine.slice(0, TEXT_BLOCK_TITLE_LEN)}…` : oneLine || "Note";
};

const buildRows = (blocks: SessionBlockView[]): OutlineRow[] => {
  const rows: OutlineRow[] = [];
  let traceIndex = 0;
  for (const block of blocks) {
    if (block.type === "evaluation") {
      rows.push({ blockId: block.id, text: block.evaluation.name, kind: "eval" });
    } else if (block.type === "text") {
      rows.push({ blockId: block.id, text: textBlockTitle(block.text), kind: "text" });
    } else if (block.type === "trace") {
      traceIndex += 1;
      rows.push({ blockId: block.id, text: `Trace ${traceIndex}`, kind: "trace" });
    }
  }
  return rows;
};

interface SessionOutlineProps {
  className?: string;
}

/**
 * Left-rail session outline: a continuous left track with a single
 * framer-motion indicator that slides to the active row. One row per block
 * (trace / eval / text). Active state comes from the store (`activeBlockId`,
 * written by the virtualized list's scroll tracking) — IntersectionObserver
 * can't work here because offscreen virtual rows unmount. Clicks route through
 * `requestScrollToBlock` so the list can scroll to not-yet-mounted blocks.
 */
export default function SessionOutline({ className }: SessionOutlineProps) {
  const blocks = useDebuggerSessionViewStore((s) => s.blocks);
  const activeBlockId = useDebuggerSessionViewStore((s) => s.activeBlockId);
  const requestScrollToBlock = useDebuggerSessionViewStore((s) => s.requestScrollToBlock);
  const navRef = useRef<HTMLElement>(null);

  // Edge state for the fade gradients: hide the top fade at the very top and
  // the bottom fade at the very bottom (both hidden when the nav doesn't
  // scroll at all). Mirrors the blog TOC's scrollable-nav treatment.
  const [edges, setEdges] = useState({ atTop: true, atBottom: true });
  const updateEdges = useCallback(() => {
    const el = navRef.current;
    if (!el) return;
    const atTop = el.scrollTop <= 1;
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
    setEdges((prev) => (prev.atTop === atTop && prev.atBottom === atBottom ? prev : { atTop, atBottom }));
  }, []);

  // Rebuild rows only when block order / eval names actually change (not on
  // every streamed span that mutates traceSpans).
  const signature = blocks
    .map((b) =>
      b.type === "trace"
        ? `t${b.traceId}`
        : b.type === "evaluation"
          ? `e${b.evaluation.id}${b.evaluation.name}`
          : `x${b.id}`
    )
    .join("");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const rows = useMemo(() => buildRows(blocks), [signature]);

  const rowRefs = useRef<Map<string, HTMLAnchorElement>>(new Map());
  const [indicator, setIndicator] = useState<{ top: number; height: number } | null>(null);

  // `requestScrollToBlock` sets `activeBlockId` on click; fall back to the first row.
  const active = useMemo(
    () => (activeBlockId && rows.some((r) => r.blockId === activeBlockId) ? activeBlockId : (rows[0]?.blockId ?? null)),
    [activeBlockId, rows]
  );

  // Re-derive the edge state when rows change (content height moved without a
  // scroll event) and when the nav resizes. Keyed on `rows` so the observer
  // attaches once the nav actually mounts (rows start empty → early return null).
  useEffect(() => {
    updateEdges();
    const el = navRef.current;
    if (!el) return;
    const observer = new ResizeObserver(updateEdges);
    observer.observe(el);
    return () => observer.disconnect();
  }, [rows, updateEdges]);

  // Slide the indicator to the active row (post-layout) and keep it visible.
  useLayoutEffect(() => {
    if (!active) return;
    const el = rowRefs.current.get(active);
    if (!el) return;
    setIndicator({ top: el.offsetTop, height: el.offsetHeight });
    const nav = el.closest("nav");
    if (nav) {
      const elRect = el.getBoundingClientRect();
      const navRect = nav.getBoundingClientRect();
      const delta =
        elRect.top < navRect.top
          ? elRect.top - navRect.top
          : elRect.bottom > navRect.bottom
            ? elRect.bottom - navRect.bottom
            : 0;
      if (delta !== 0) nav.scrollBy({ top: delta, behavior: "smooth" });
    }
  }, [active, rows]);

  if (rows.length === 0) return null;

  return (
    // The relative wrapper carries the caller's sticky/size classes and hosts
    // the edge-fade overlays — they must sit OUTSIDE the scroll port so they
    // stay clipped to the visible area instead of scrolling with the rows.
    <div className={cn("relative", className)}>
      <nav
        ref={navRef}
        onScroll={updateEdges}
        className="no-scrollbar flex max-h-full w-full flex-col gap-6 overflow-y-auto pb-20 pt-1"
      >
        <div className="relative flex flex-col">
          <div className="absolute bottom-0 left-0 top-0 w-px bg-border" />
          {indicator && (
            <motion.div
              className="absolute left-0 w-px bg-primary-foreground"
              initial={false}
              animate={{ top: indicator.top, height: indicator.height }}
              transition={{ type: "spring", stiffness: 380, damping: 30 }}
            />
          )}

          {rows.map((row) => {
            const isActive = active === row.blockId;
            return (
              <a
                key={row.blockId}
                ref={(el) => {
                  if (el) rowRefs.current.set(row.blockId, el);
                  else rowRefs.current.delete(row.blockId);
                }}
                href="#"
                onClick={(e) => {
                  // Not an anchor jump — the target row may be virtualized out
                  // (unmounted); the list scrolls via the virtualizer instead.
                  e.preventDefault();
                  requestScrollToBlock(row.blockId);
                }}
                className="group flex h-[30px] items-center pl-4 text-left no-underline"
              >
                {row.kind === "trace" && (
                  <MessageCircle
                    className={cn(
                      "mr-1.5 size-3 shrink-0 transition-colors",
                      isActive ? "text-llm" : "text-llm/70 group-hover:text-llm"
                    )}
                  />
                )}
                {row.kind === "eval" && (
                  <FlaskConical
                    className={cn(
                      "mr-1.5 size-3 shrink-0 transition-colors",
                      isActive ? "text-emerald-500" : "text-emerald-500/70 group-hover:text-emerald-500"
                    )}
                  />
                )}
                {row.kind === "text" && (
                  <FileText
                    className={cn(
                      "mr-1.5 size-3 shrink-0 transition-colors",
                      isActive ? "text-primary-foreground" : "text-muted-foreground group-hover:text-foreground"
                    )}
                  />
                )}
                <span
                  className={cn(
                    "truncate text-sm transition-colors",
                    isActive ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {row.text}
                </span>
              </a>
            );
          })}
        </div>
      </nav>
      {/* Edge fades: soften the clip when there's more content above/below. */}
      <motion.div
        className="pointer-events-none absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-background to-transparent"
        initial={false}
        animate={{ opacity: edges.atTop ? 0 : 1 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
      />
      <motion.div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-background to-transparent"
        initial={false}
        animate={{ opacity: edges.atBottom ? 0 : 1 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
      />
    </div>
  );
}
