"use client";

import { motion } from "framer-motion";
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
// It does NOT own the reveal. The store is filled one span at a time by
// ../trace-panel, so this list simply renders what the store has — which is
// what keeps it in step with the condensed timeline, whose spans come from the
// same place. A whole trace dumped at once is both a wall to read and a wasted
// beat.
//
// The list does NOT follow its own tail. Rows arriving below the fold are meant
// to be missed: chasing them scrolls the transcript to the end of the run and
// leaves the reader looking at the last span instead of the first.
//
// Behaviours of the product transcript deliberately NOT reimplemented, because
// this trace has no subagents and no realtime feed: sticky group headers,
// group expand/collapse, pending-span preview deferral, and visible-time-range
// reporting to the condensed timeline.

/** How far a row rises as it arrives. */
const ROW_RISE_PX = 10;

interface Props {
  onSpanSelect: (span: TraceViewSpan) => void;
  /** Blocks USER scrolling while leaving both `scrollTo`s below working — an
   *  `overflow: hidden` box is still a scroll container programmatically. Set on
   *  touch, where an inner scroller just traps the page scroll. */
  scrollLocked?: boolean;
  /** Spans the panel opens ON. Their rows get no enter animation: the head of
   *  the run is the panel's resting state, not part of the reveal, and
   *  animating it in makes an idle panel look like it is loading. Everything
   *  the store gains after them arrives one at a time and does animate. */
  instantSpans?: number;
}

/** Row bodies, in ONE request for the whole trace.
 *
 *  Not the product's `useBatchedSpanPreviews`: that debounces around what the
 *  virtualizer currently has on screen and hardcodes the shared-trace base,
 *  and this list has neither a virtualizer nor a local copy of the trace to
 *  read. It re-runs as the store gains spans, which is bounded by the size of
 *  the trace — do NOT point this at a large one. */
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
      // MERGED, not replaced: the store gains one span at a time, so this runs
      // once per arrival and a replace would drop the bodies of the rows
      // already on screen every time a new one landed.
      .then((data: { previews?: Record<string, string | null> }) =>
        setPreviews((prev) => ({ ...prev, ...(data.previews ?? {}) }))
      )
      // A landing mock with no row bodies still reads as a trace; a toast on a
      // marketing page does not.
      .catch(() => {});

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [traceId, startTime, endTime, spanKey]);

  return previews;
};

const LandingTranscript = ({ onSpanSelect, scrollLocked, instantSpans = 0 }: Props) => {
  const scrollRef = useRef<HTMLDivElement>(null);
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

  // Rows, not spans: the user's input heads the list and is not a span, so it
  // rides in with the opening batch rather than animating on its own.
  const instantRows = instantSpans + (userInput ? 1 : 0);

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
    <div
      ref={scrollRef}
      className={cn(
        "h-full w-full overflow-x-hidden styled-scrollbar pb-16",
        scrollLocked ? "overflow-y-hidden" : "overflow-y-auto"
      )}
    >
      {/* The store holds only what has been revealed, so this renders all of
          it. Rows MOUNT as spans arrive rather than sitting at opacity 0:
          holding the whole run in layout would reserve its full height from the
          first frame and scroll over blank space, and mounting is what makes
          the list visibly grow. Hence framer rather than a CSS transition — a
          class toggled on mount has no starting frame to animate from. */}
      {rows.map((row, i) => {
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
            // The opening rows are the panel's resting state, so they get no
            // enter animation at all — `initial={false}` snaps them to `animate`.
            initial={i < instantRows ? false : { opacity: 0, y: ROW_RISE_PX }}
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
