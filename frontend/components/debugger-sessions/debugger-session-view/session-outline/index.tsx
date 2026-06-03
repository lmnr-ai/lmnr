"use client";

import { motion } from "framer-motion";
import { ArrowDown } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";

import { type DebuggerSessionViewStore, useDebuggerSessionViewStore, useDebuggerSessionViewStoreRaw } from "../store";
import { headingAnchorId, parseNoteHeadings, traceAnchorId } from "./utils";

// One outline row: a trace (rendered as a chip) or a heading pulled from that
// trace's note. The note's headings come BEFORE the trace chip — matching the
// article, where the comment renders above its trace body.
type OutlineRow =
  | { kind: "trace"; key: string; anchor: string; index: number }
  | { kind: "heading"; key: string; anchor: string; level: number; text: string };

const buildRows = (state: DebuggerSessionViewStore): OutlineRow[] => {
  const rows: OutlineRow[] = [];
  state.traceOrder.forEach((traceId, i) => {
    const ts = state.traces.get(traceId);
    for (const h of parseNoteHeadings(ts?.comment)) {
      const a = headingAnchorId(traceId, h.slug);
      rows.push({ kind: "heading", key: a, anchor: a, level: h.level, text: h.text });
    }
    const anchor = traceAnchorId(traceId);
    rows.push({ kind: "trace", key: anchor, anchor, index: i + 1 });
  });
  return rows;
};

interface SessionOutlineProps {
  // Scrolls the confirmed scroll container to its very end.
  onJumpToBottom: () => void;
  className?: string;
}

/**
 * Right-rail session outline (Figma node 4296:35849), modeled on the blog
 * TableOfContents: a continuous left track with a single framer-motion indicator
 * that slides to the active row. Each trace is a chip; its note headings are
 * indented rows above it. Rows are native `#anchor` links (the browser scrolls
 * whichever element actually scrolls); active state is tracked with an
 * IntersectionObserver rooted at the browser viewport (exactly like the blog).
 */
export default function SessionOutline({ onJumpToBottom, className }: SessionOutlineProps) {
  const storeApi = useDebuggerSessionViewStoreRaw();

  // Primitive signature: rebuild rows only when order / load-state / note text
  // actually changes (not on every streamed span that swaps the traces Map).
  const signature = useDebuggerSessionViewStore((s) =>
    s.traceOrder
      .map((id) => {
        const t = s.traces.get(id);
        return `${id}${t?.trace?.startTime ?? ""}${t?.comment ?? ""}`;
      })
      .join("")
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

  // Newest run is the last row (each run pushes its headings then its trace chip).
  const lastAnchor = rows[rows.length - 1]?.anchor;

  // After a click we optimistically highlight the clicked row and ignore the
  // observer briefly, so a row that can't be scrolled high enough to enter the
  // top band (the last row, short rows with padding below) still lights up.
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

  // Active-row detection. Root is the browser viewport (root: null), like the
  // blog — works regardless of WHICH element scrolls, because the targets move
  // on screen as any ancestor scrolls. Active = crossed into the top 15%.
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

  // Slide the indicator to the active row (post-layout so the first paint is
  // positioned) and keep that row visible inside the rail.
  useLayoutEffect(() => {
    if (!active) return;
    const el = rowRefs.current.get(active);
    if (!el) return;
    setIndicator({ top: el.offsetTop, height: el.offsetHeight });
    el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [active, rows]);

  if (rows.length === 0) return null;

  return (
    <nav className={cn("flex flex-col gap-6 overflow-y-auto thin-scrollbar pt-1", className)}>
      <button
        onClick={() => {
          if (lastAnchor) selectOnClick(lastAnchor);
          onJumpToBottom();
        }}
        className="flex h-7 w-full items-center justify-center gap-1.5 rounded bg-primary px-3 py-1 text-xs text-primary-foreground transition-opacity hover:opacity-90"
      >
        Jump to bottom
        <ArrowDown className="size-3.5" />
      </button>

      <div className="h-px w-full bg-border" />

      {/* Continuous track + a single sliding indicator (blog pattern). The
          relative wrapper is the containing block for both. */}
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
              {row.kind === "trace" ? (
                <span
                  className={cn(
                    "inline-flex items-center rounded border border-border bg-secondary px-2 py-0.5 text-xs transition-colors",
                    isActive ? "text-primary-foreground" : "text-muted-foreground"
                  )}
                >
                  Trace {row.index}
                </span>
              ) : (
                <span
                  className={cn(
                    "truncate text-sm leading-none transition-colors",
                    row.level === 2 && "pl-3",
                    row.level >= 3 && "pl-6",
                    isActive ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {row.text}
                </span>
              )}
            </a>
          );
        })}
      </div>
    </nav>
  );
}
