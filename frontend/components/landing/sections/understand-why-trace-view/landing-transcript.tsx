"use client";

import { motion, useInView } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { shallow } from "zustand/shallow";

import {
  type TraceViewListSpan,
  type TraceViewSpan,
  useTraceViewBaseStore,
} from "@/components/traces/trace-view/store/base";
import { TranscriptRow, type TranscriptRowData } from "@/components/traces/trace-view/transcript/item/transcript-row";
import { convertToTimeParameters } from "@/lib/time";
import { cn } from "@/lib/utils";

import { SHARED_TRACE_API } from "./shared-trace-api";

// Landing-only replacement for the product's <Transcript>, which cannot do
// what this needs: it virtualizes, so rows do not exist until they are
// scrolled to, and there is nothing to stagger. Rows here are laid out
// normally and revealed one at a time, which is what makes a finished trace
// read as a run happening live.
//
// It renders the SAME production <TranscriptRow>, so the rows themselves stay
// pixel-identical to the product and this file owns only the list. Dropping
// virtualization is safe because the trace is ten spans; do NOT point this at
// a large trace.
//
// The reveal runs in BATCHES, capped by the caller's `visibleRows`: the
// section's opening step shows only the head of the run and the next step lets
// the rest stream in. A whole trace dumped at once is both a wall to read and
// a wasted beat.
//
// Behaviours of the product transcript deliberately NOT reimplemented, because
// this trace has no subagents and no realtime feed: sticky group headers,
// group expand/collapse, pending-span preview deferral, and visible-time-range
// reporting to the condensed timeline.

/** Wall-clock gap between rows arriving. Long enough to read as separate
 *  events landing rather than one list fading in. */
const ROW_STEP_MS = 380;

/** How far a row rises as it arrives. */
const ROW_RISE_PX = 10;

interface Props {
  onSpanSelect: (span: TraceViewSpan) => void;
  /** Cap on how many rows may be revealed so far. Raising it resumes the
   *  stagger from where it stopped rather than replaying from the top. */
  visibleRows: number;
}

/** Walks a counter up to `limit`, one step per `stepMs`, once `enabled`. Never
 *  counts back down: a step that lowered the cap would retract rows the reader
 *  has already seen arrive. */
const useStagger = (limit: number, enabled: boolean, stepMs: number): number => {
  const [revealed, setRevealed] = useState(0);
  // Read once rather than per tick: a preference flipped mid-page should not
  // restart a reveal that is already running.
  const [instant] = useState(
    () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );

  useEffect(() => {
    if (!enabled || revealed >= limit) return;
    // Reduced motion jumps the whole batch, but still through the timer — a
    // synchronous setState in an effect body cascades renders.
    const id = window.setTimeout(
      () => setRevealed((n) => (instant ? limit : Math.min(n + 1, limit))),
      instant ? 0 : stepMs
    );
    return () => window.clearTimeout(id);
  }, [revealed, limit, enabled, stepMs, instant]);

  return revealed;
};

/** Row bodies, in ONE request for the whole trace.
 *
 *  Not the product's `useBatchedSpanPreviews`: that debounces around what the
 *  virtualizer currently has on screen and hardcodes the shared-trace base,
 *  and this list has neither a virtualizer nor a local copy of the trace to
 *  read. Four spans fetched once is the whole job. */
const useSpanPreviews = (
  trace: { id?: string; startTime?: string; endTime?: string } | undefined,
  spans: { spanId: string; spanType: string }[]
): Record<string, string | null> => {
  const [previews, setPreviews] = useState<Record<string, string | null>>({});

  const traceId = trace?.id;
  const startTime = trace?.startTime;
  const endTime = trace?.endTime;
  const spanKey = spans.map((s) => s.spanId).join(",");

  useEffect(() => {
    if (!traceId || spans.length === 0) return;

    const body: Record<string, unknown> = {
      spanIds: spans.map((s) => s.spanId),
      spanTypes: Object.fromEntries(spans.map((s) => [s.spanId, s.spanType])),
    };
    // Padded by a second either side, matching the product's batch call — the
    // window is a scan bound, not an exact filter.
    if (startTime && endTime) {
      const params = convertToTimeParameters({
        startTime: new Date(new Date(startTime).getTime() - 1000).toISOString(),
        endTime: new Date(new Date(endTime).getTime() + 1000).toISOString(),
      });
      body.startDate = params.start_time;
      body.endDate = params.end_time;
    }

    const controller = new AbortController();
    fetch(`${SHARED_TRACE_API}/${traceId}/spans/previews`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data: { previews?: Record<string, string | null> }) => setPreviews(data.previews ?? {}))
      // A landing mock with no row bodies still reads as a trace; a toast on a
      // marketing page does not.
      .catch(() => {});

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [traceId, startTime, endTime, spanKey]);

  return previews;
};

const LandingTranscript = ({ onSpanSelect, visibleRows }: Props) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const inView = useInView(scrollRef, { once: true, amount: 0.3 });
  const { getTranscriptListData, spans, trace, selectedSpan } = useTraceViewBaseStore(
    (state) => ({
      getTranscriptListData: state.getTranscriptListData,
      spans: state.spans,
      trace: state.trace,
      selectedSpan: state.selectedSpan,
    }),
    shallow
  );

  const entries = useMemo(
    () => getTranscriptListData(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [getTranscriptListData, spans]
  );

  const userInput = trace?.agentInput ?? null;

  const rows: TranscriptRowData[] = useMemo(() => {
    const list: TranscriptRowData[] = userInput ? [{ type: "user-input" }] : [];
    // Group children are dropped rather than expanded: nothing here can toggle
    // a group, so rendering them would show a permanently-open subagent.
    for (const entry of entries) {
      if (entry.type !== "group-span" && entry.type !== "group-input") list.push(entry);
    }
    return list;
  }, [entries, userInput]);

  const previews = useSpanPreviews(trace, spans);

  const revealed = useStagger(Math.min(visibleRows, rows.length), inView, ROW_STEP_MS);

  const spansById = useMemo(() => new Map(spans.map((s) => [s.spanId, s])), [spans]);
  const selectedSpanId = selectedSpan?.spanId;

  // The product transcript scrolls to a selection through the virtualizer; with
  // real DOM nodes the element can just do it itself.
  useEffect(() => {
    if (!selectedSpanId) return;
    scrollRef.current
      ?.querySelector(`[data-landing-span="${CSS.escape(selectedSpanId)}"]`)
      ?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [selectedSpanId]);

  // Follow the tail as rows land, the way a live log does. Without it most of
  // the run arrives below the panel's fold and the reveal is invisible.
  //
  // Hand-rolled rather than `scrollIntoView`: that walks up and scrolls every
  // scrollable ancestor, and the ancestor here is the PAGE, whose scroll
  // position is what drives the entire section. Only ever scrolls down, and
  // only when the new row is actually past the bottom edge.
  useEffect(() => {
    const el = scrollRef.current;
    const row = el?.children[revealed - 1] as HTMLElement | undefined;
    if (!el || !row) return;
    const target = row.offsetTop + row.offsetHeight - el.clientHeight;
    if (target > el.scrollTop) el.scrollTo({ top: target, behavior: "smooth" });
  }, [revealed]);

  const handleSelect = useCallback(
    (listSpan: TraceViewListSpan) => {
      const full = spansById.get(listSpan.spanId);
      if (full) onSpanSelect(full);
    },
    [onSpanSelect, spansById]
  );

  // Never toggles: group rows are rendered collapsed and have no children here.
  const noop = useCallback(() => {}, []);

  return (
    <div ref={scrollRef} className="h-full w-full overflow-y-auto overflow-x-hidden styled-scrollbar pb-16">
      {/* Only what has been revealed is MOUNTED. Holding the rest at opacity 0
          leaves them in layout, so the container reserves the whole run's
          height from the first frame and scrolls over blank space. Mounting as
          they arrive also means the list visibly grows, which is the point.
          Hence framer rather than a CSS transition: a class toggled on mount
          has no starting frame to animate from. */}
      {rows.slice(0, revealed).map((row, i) => {
        const spanId = row.type === "span" ? row.span.spanId : undefined;
        const prev = rows[i - 1];
        // Matches the product's spacing rule: an LLM row gets air above it
        // unless it directly follows the user's input, which it pairs with.
        const needsSpacing =
          row.type === "span" &&
          (row.span.spanType === "LLM" || row.span.spanType === "CACHED") &&
          !!prev &&
          prev.type !== "user-input";

        return (
          <motion.div
            key={spanId ?? row.type + i}
            data-landing-span={spanId}
            initial={{ opacity: 0, y: ROW_RISE_PX }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: "easeOut" }}
            className={cn(needsSpacing && "pt-4")}
          >
            <TranscriptRow
              row={row}
              previews={previews}
              inputPreviews={EMPTY_PREVIEWS}
              agentNames={EMPTY_PREVIEWS}
              userInput={userInput}
              selectedSpanId={selectedSpanId}
              expandedGroupIds={EMPTY_GROUPS}
              onSpanSelect={handleSelect}
              onToggleGroup={noop}
            />
          </motion.div>
        );
      })}
    </div>
  );
};

// Hoisted so the memoized row's prop identity is stable across renders. Both
// are permanently empty: group rows have no children to expand here, and no
// row type this trace produces reads an input preview or an agent name.
const EMPTY_GROUPS: Set<string> = new Set();
const EMPTY_PREVIEWS: Record<string, string | null> = {};

export default LandingTranscript;
