"use client";

import { motion } from "framer-motion";

import { cn } from "@/lib/utils";

import { DEMO_AGENT_INPUT, type MockSpan } from "../../demo-trace";
import InputRow from "./input-row";
import { useSpanSelection } from "./selection";
import SpanRow from "./span-row";

// The task, then one row per span. It does NOT own the reveal — `spans` is the
// prefix the panel revealed, the same one the timeline draws. Rows MOUNT as they
// arrive rather than sitting at opacity 0, which would reserve the run's whole
// height up front, and the list does NOT chase its own tail.

/** How far a row rises as it arrives. */
const ROW_RISE_PX = 10;

interface Props {
  spans: MockSpan[];
  /** Leading spans that get no enter animation: the head of the run is the
   *  panel's resting state, and animating it in makes an idle panel look like
   *  it is loading. An UPPER bound, since those spans include the root, which
   *  renders no row — which is all it needs to be. */
  instantSpans: number;
  /** Blocks USER scrolling of the transcript. Set on touch, where an inner
   *  scroller only traps the page. */
  scrollLocked?: boolean;
}

// Selecting a span highlights its row and nothing else — the list does NOT
// scroll to it. The panel is a picture the copy is talking over, so a row
// moving under the reader reads as the page grabbing the view.
const Transcript = ({ spans, instantSpans, scrollLocked }: Props) => {
  const { selectedSpanId, selectSpan } = useSpanSelection();

  // The run's root renders no row of its own — it is the whole run, and the
  // rows below it are what it contains.
  const rows = spans.filter((span) => span.spanType !== "DEFAULT");

  return (
    <div
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
