"use client";

import { motion } from "framer-motion";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { type TraceRow } from "@/lib/traces/types";
import { cn } from "@/lib/utils";

import { type DebuggerSessionViewStore, useDebuggerSessionViewStore, useDebuggerSessionViewStoreRaw } from "../store";
import { headingAnchorId, parseNoteHeadings } from "./utils";

// One outline row per markdown heading pulled from the runs' notes — the
// outline is a pure note TOC; traces themselves get no row.
type OutlineRow = { key: string; anchor: string; level: number; text: string };

const buildRows = (state: DebuggerSessionViewStore): OutlineRow[] => {
  const rows: OutlineRow[] = [];
  state.traces.forEach((trace: TraceRow) => {
    for (const h of parseNoteHeadings(state.noteForTrace(trace.id))) {
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
  useEffect(() => {
    if (rows.length === 0) return;
    const targets = rows.map((r) => document.getElementById(r.anchor)).filter((el): el is HTMLElement => el !== null);
    if (targets.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (suppressRef.current) return;
        entries.forEach((e) => {
          if (e.isIntersecting) setActiveAnchor(e.target.id);
        });
      },
      { rootMargin: "0px 0px -85% 0px" }
    );
    targets.forEach((t) => observer.observe(t));
    return () => observer.disconnect();
  }, [rows]);

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
    <nav className={cn("flex flex-col gap-6 overflow-y-auto thin-scrollbar pt-1", className)}>
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
  );
}
