"use client";

import { motion, type MotionValue, useMotionValueEvent, useTransform } from "framer-motion";
import { useLayoutEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

import { SignalContent } from "./signal-event-card";
import { SlackContent } from "./slack-notification-card";

interface Props {
  /** 0 = pure Slack notification, 1 = pure Signal event card. */
  progress: MotionValue<number>;
  className?: string;
  /** Forwarded into <SignalContent /> — when set to a span ID that the
   *  signal card knows about, that chip pulses for ~1s. Used by the
   *  trace-bento phase 2 trigger. */
  flashSpanId?: string;
  /** Forwarded into <SignalContent /> — wires chip clicks to the trace
   *  view store's selectSpanById. Omitted on mobile. */
  onSpanClick?: (spanId: string) => void;
}

// Outer card colors at the two endpoints. Framer interpolates rgb/hex
// strings, but NOT CSS `var(...)` references — must use literal color
// values here. FLAG: if you ever update --color-landing-surface-* tokens
// in globals.css, sync these constants by hand (or this morph will drift
// from the rest of the page).
const SLACK_BORDER = "rgb(37 37 38)"; // landing-surface-500
const SLACK_BG = "rgb(22 22 23)"; // landing-surface-700 (was mis-commented)
const SIGNAL_BORDER = "rgb(49 134 255 / 0.6)";
const SIGNAL_BG = "rgb(49 134 255 / 0.12)";
// Midpoint background — exact hex of --color-landing-surface-600.
const MIDPOINT_BG = "#1b1b1c44";

// Morphs from a Slack notification (progress=0) to a Signal event card
// (progress=1). The content swaps at the midpoint; the wrapper's height is
// measured from the rendered content via useLayoutEffect and animated to
// that value — so we get a smooth height tween between slack-natural and
// signal-natural with no hard-coded pixel constants. Border/bg color tween
// continuously through a muted midpoint for visual continuity.
const SlackToSignalMorph = ({ progress, className, flashSpanId, onSpanClick }: Props) => {
  const [showSignal, setShowSignal] = useState(false);
  useMotionValueEvent(progress, "change", (p) => {
    const next = p >= 0.5;
    setShowSignal((prev) => (prev === next ? prev : next));
  });

  // Measure the inner content's natural height after each render and feed it
  // into the wrapper's animate target. useLayoutEffect fires after DOM commit
  // but BEFORE the browser paints, so framer's target updates before the
  // first frame of the tween — no clipped flash mid-swap.
  const innerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | undefined>(undefined);
  useLayoutEffect(() => {
    if (innerRef.current) setHeight(innerRef.current.scrollHeight);
  }, [showSignal]);

  // Border/bg pass through a muted blue at midpoint so a naive 2-point rgba
  // interpolation doesn't flash bright (e.g. opaque slack-gray → 60% blue
  // would peak at ~80% alpha mid-transition). The midpoint clamps alpha down.
  const borderColor = useTransform(progress, [0, 0.5, 1], [SLACK_BORDER, "rgb(49 134 255 / 0.25)", SIGNAL_BORDER]);
  const backgroundColor = useTransform(progress, [0, 0.5, 1], [SLACK_BG, MIDPOINT_BG, SIGNAL_BG]);

  return (
    <motion.div
      initial={false}
      animate={{ height }}
      transition={{ type: "tween", duration: 0.3, ease: "easeInOut" }}
      style={{ borderColor, backgroundColor }}
      className={cn("relative w-[400px] rounded-md border overflow-hidden", className)}
    >
      <div ref={innerRef}>
        {showSignal ? <SignalContent onSpanClick={onSpanClick} flashSpanId={flashSpanId} /> : <SlackContent />}
      </div>
    </motion.div>
  );
};

export default SlackToSignalMorph;
