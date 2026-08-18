"use client";

import { motion } from "framer-motion";
import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

import { DEMO_AGENT_INPUT, type MockSpan } from "../../demo-trace";
import InputRow from "./input-row";
import { useSpanSelection } from "./selection";
import SpanRow from "./span-row";

// The run as a readable list: the task, then one row per span in start order.
//
// It does NOT own the reveal. `spans` is the prefix the panel has revealed so
// far, which is the same prefix the condensed timeline draws — that is what
// keeps a span appearing in both on the same frame.
//
// Rows MOUNT as they arrive rather than sitting at opacity 0. Held in layout
// they would reserve the whole run's height from the first frame, and the list
// would scroll over blank space instead of visibly growing. Hence framer rather
// than a CSS transition: a class toggled on mount has no starting frame.
//
// The list does NOT follow its own tail. Rows arriving below the fold are meant
// to be missed — chasing them would leave the reader looking at the end of the
// run instead of the start.

/** How far a row rises as it arrives. */
const ROW_RISE_PX = 10;

interface Props {
  spans: MockSpan[];
  /** Leading spans that get no enter animation: the head of the run is the
   *  panel's resting state, and animating it in makes an idle panel look like
   *  it is loading. An UPPER bound, since those spans include the root, which
   *  renders no row — which is all it needs to be. */
  instantSpans: number;
  /** Blocks USER scrolling while leaving `scrollIntoView` working — an
   *  `overflow: hidden` box is still a scroll container programmatically. Set
   *  on touch, where an inner scroller only traps the page. */
  scrollLocked?: boolean;
}

const Transcript = ({ spans, instantSpans, scrollLocked }: Props) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { selectedSpanId, selectSpan } = useSpanSelection();

  // The run's root renders no row of its own — it is the whole run, and the
  // rows below it are what it contains.
  const rows = spans.filter((span) => span.spanType !== "DEFAULT");

  useEffect(() => {
    if (!selectedSpanId) return;
    scrollRef.current
      ?.querySelector(`[data-landing-span="${CSS.escape(selectedSpanId)}"]`)
      ?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [selectedSpanId]);

  return (
    <div
      ref={scrollRef}
      className={cn(
        "h-full w-full overflow-x-hidden styled-scrollbar pb-16",
        scrollLocked ? "overflow-y-hidden" : "overflow-y-auto"
      )}
    >
      {/* The task is not a span, so it is simply there from the first frame. */}
      <InputRow text={DEMO_AGENT_INPUT} />

      {rows.map((span, i) => (
        <motion.div
          key={span.spanId}
          data-landing-span={span.spanId}
          // `initial={false}` snaps the opening rows straight to `animate`.
          initial={i < instantSpans ? false : { opacity: 0, y: ROW_RISE_PX }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
          // An LLM row gets air above it unless it directly follows the input,
          // which it pairs with.
          className={cn(span.spanType === "LLM" && i > 0 && "pt-4")}
        >
          <SpanRow span={span} isSelected={selectedSpanId === span.spanId} onSelect={selectSpan} />
        </motion.div>
      ))}
    </div>
  );
};

export default Transcript;
