"use client";

import { motion } from "framer-motion";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { type TraceRow } from "@/lib/traces/types";
import { cn } from "@/lib/utils";

import { spanTagsToLinks } from "../note-markdown";
import { type DebuggerSessionViewStore, useDebuggerSessionViewStore, useDebuggerSessionViewStoreRaw } from "../store";
import { headingAnchorId, parseNoteHeadings } from "./utils";

// One outline row per markdown heading pulled from the runs' notes — the
// outline is a pure note TOC; traces themselves get no row.
type OutlineRow = { key: string; anchor: string; level: number; text: string };

const buildRows = (state: DebuggerSessionViewStore): OutlineRow[] => {
  const rows: OutlineRow[] = [];
  state.traces.forEach((trace: TraceRow) => {
    const note = state.noteForTrace(trace.id);
    if (!note) return;
    // Parse the SAME span-tag-transformed string RunComment renders, so heading
    // order and slugs line up exactly with the ids it stamps.
    for (const h of parseNoteHeadings(spanTagsToLinks(note, trace.id))) {
      const a = headingAnchorId(trace.id, h.slug);
      rows.push({ key: a, anchor: a, level: h.level, text: h.text });
    }
  });
  return rows;
};

interface SessionOutlineProps {
  className?: string;
}

/**
 * Left-rail session outline: a continuous left track with a single
 * framer-motion indicator that slides to the active row. Rows are the markdown
 * headings from each run's note (a pure note TOC — no per-trace rows). Active
 * state is tracked with an IntersectionObserver rooted at the browser viewport.
 */
export default function SessionOutline({ className }: SessionOutlineProps) {
  const storeApi = useDebuggerSessionViewStoreRaw();
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

  // Primitive signature: rebuild rows only when order / start-time / note text
  // actually changes (not on every streamed span that mutates traceSpans).
  const signature = useDebuggerSessionViewStore((s) =>
    s.traces.map((t) => `${t.id}${t.startTime}${s.noteForTrace(t.id) ?? ""}`).join("")
  );
  // `signature` is the change-trigger; the rows are read from the store snapshot.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const rows = useMemo(() => buildRows(storeApi.getState()), [signature]);

  const [activeAnchor, setActiveAnchor] = useState<string | null>(null);
  const rowRefs = useRef<Map<string, HTMLAnchorElement>>(new Map());
  const [indicator, setIndicator] = useState<{ top: number; height: number } | null>(null);

  // Derive (don't store) the effective active row, falling back to the first row
  // when the stored anchor no longer exists — avoids a reset effect.
  const active = useMemo(
    () => (activeAnchor && rows.some((r) => r.anchor === activeAnchor) ? activeAnchor : (rows[0]?.anchor ?? null)),
    [activeAnchor, rows]
  );

  // After a click we optimistically highlight the clicked row and ignore the
  // observer briefly, so a row that can't be scrolled high enough to enter the
  // top band still lights up.
  const suppressRef = useRef(false);
  const suppressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectOnClick = (anchor: string) => {
    setActiveAnchor(anchor);
    suppressRef.current = true;
    if (suppressTimer.current) clearTimeout(suppressTimer.current);
    suppressTimer.current = setTimeout(() => {
      suppressRef.current = false;
    }, 700);
  };
  useEffect(() => () => (suppressTimer.current ? clearTimeout(suppressTimer.current) : undefined), []);

  // Active-row detection. Root is the browser viewport (root: null) — works
  // regardless of WHICH element scrolls. Active = crossed into the top 15%.
  // Setup is deferred one frame: heading ids are stamped by RunComment's
  // post-render effect, which can flush after this one in the same commit.
  useEffect(() => {
    if (rows.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (suppressRef.current) return;
        entries.forEach((e) => {
          if (e.isIntersecting) setActiveAnchor(e.target.id);
        });
      },
      { rootMargin: "0px 0px -85% 0px" }
    );
    const rafId = requestAnimationFrame(() => {
      rows
        .map((r) => document.getElementById(r.anchor))
        .filter((el): el is HTMLElement => el !== null)
        .forEach((t) => observer.observe(t));
    });
    return () => {
      cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, [rows]);

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
            const isActive = active === row.anchor;
            return (
              <a
                key={row.key}
                ref={(el) => {
                  if (el) rowRefs.current.set(row.anchor, el);
                  else rowRefs.current.delete(row.anchor);
                }}
                href={`#${row.anchor}`}
                onClick={() => selectOnClick(row.anchor)}
                className="flex h-[30px] items-center pl-4 text-left no-underline"
              >
                <span
                  className={cn(
                    "truncate text-sm transition-colors",
                    row.level === 2 && "pl-3",
                    row.level >= 3 && "pl-6",
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
