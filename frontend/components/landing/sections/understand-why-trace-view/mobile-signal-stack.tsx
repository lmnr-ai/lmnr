"use client";

import { motion, type MotionValue, useScroll, useTransform } from "framer-motion";
import { useRef, useState } from "react";

import MorphingSignalCard, { type PillMetrics } from "../has-this-issue/morphing-signal-card";
import { SIGNAL_CLUSTER_EVENT_COUNT } from "../signal-cluster";
import { SIGNAL_CARD_W, SIGNAL_HEADER_H } from "../signal-event-card";
import { DEFAULT_MOBILE_STACK_TIMING, type MobileStackTiming } from "./mobile-stack-timing";
import { DEFAULT_STACK_TIMING, easeInCubic, phase, smootherstep } from "./stack-timing";

// Mobile twin of ./signal-stack minus the flight: the cards start stacked, so
// this owns only the collapse and the drop. Scroll-bound, choreography in
// ./mobile-stack-timing. The pill exits CENTRED because ../has-this-issue
// catches it on the same centre line.

/** The stack IS the cluster's events, so the card count and the pill's count are
 *  one number. */
const CARDS = SIGNAL_CLUSTER_EVENT_COUNT;
/** Painted back to front, so slot 0 ends up on top. */
const SLOTS = Array.from({ length: CARDS }, (_, i) => CARDS - 1 - i);
/** Which slot is the real card. Structural, not a tuning knob — it decides which
 *  way the other four lean. */
const LIVE_SLOT = Math.min(Math.max(Math.round(DEFAULT_STACK_TIMING.liveSlot), 0), CARDS - 1);

/** Rearmost card's opacity; the ramp to the front is derived, so a change to
 *  CARDS still reads as depth. */
const BACK_OPACITY = 0.25;
const SLOT_OPACITY = Array.from({ length: CARDS }, (_, i) => 1 - (i / (CARDS - 1)) * (1 - BACK_OPACITY));

/** Where in the collapse the opaque backings start fading. Late: they must
 *  outlast the cards converging on top of each other, but be gone before the
 *  pill, whose own fill is translucent — a plate behind it would read as a
 *  second, solid pill. */
const BACKING_FADE_AT = 0.6;

/** The frame's height. NOT a dial: it is the panel's box. Deliberately shorter
 *  than the cropped trace panels above — those are cropping something taller,
 *  this one holds a fan that fits. */
const FRAME_H = 360;

/** Seeds the pill's landing spot for the frame before it is measured. */
const PILL_H_ESTIMATE = SIGNAL_HEADER_H;

const mix = (from: number, to: number, t: number) => from + (to - from) * t;

interface CardProps {
  slot: number;
  collapse: MotionValue<number>;
  collapseEased: MotionValue<number>;
  dropEased: MotionValue<number>;
  /** The live card's top edge when the fan is open. */
  fannedTop: number;
  /** Where the pill's box lands, in stage units: horizontally always the frame's
   *  centre, vertically the centre plus `timing.pillOffsetY`. */
  pillTop: number;
  dropTo: number;
  pill: PillMetrics | null;
  timing: MobileStackTiming;
  onMeasure?: (metrics: PillMetrics) => void;
}

const StackCard = ({
  slot,
  collapse,
  collapseEased,
  dropEased,
  fannedTop,
  pillTop,
  dropTo,
  pill,
  timing,
  onMeasure,
}: CardProps) => {
  const offset = slot - LIVE_SLOT;
  const isLive = offset === 0;

  // ONE scalar places every card, and its SIGN is the trick: slots before the
  // live one sit up-LEFT, slots after it down-RIGHT, and all of them converge on
  // the live card as the factor closes.
  const factor = useTransform(collapseEased, (c) => 1 - c);

  // MorphingSignalCard shrinks toward its own TOP-LEFT, so the box ORIGIN is
  // what gets positioned and the pill does not end up where the card was. Both
  // axes therefore lerp to the pill's own box rather than inheriting the card's:
  // x by half-widths off the centre line, y onto the frame's centre.
  const x = useTransform(
    [collapseEased, factor],
    ([c, f]: number[]) => mix(-SIGNAL_CARD_W / 2, -(pill?.width ?? SIGNAL_CARD_W) / 2, c) + offset * timing.dx * f
  );
  const y = useTransform(
    [collapseEased, factor, dropEased],
    ([c, f, d]: number[]) => mix(fannedTop, pillTop, c) + offset * timing.dy * f + d * dropTo
  );

  // The live card is already on screen, so it never fades in — it sits at its
  // place in the depth ladder and returns to full as it becomes the pill.
  const opacity = useTransform(collapse, (c) => (isLive ? mix(SLOT_OPACITY[slot], 1, c) : SLOT_OPACITY[slot]));
  const backing = useTransform(collapse, (c) => 1 - phase(c, BACKING_FADE_AT, 1 - BACKING_FADE_AT));

  return (
    <motion.div aria-hidden={!isLive} className="absolute left-1/2 top-0" style={{ x, y }}>
      <motion.div className="absolute inset-0 rounded-md bg-surface-300" style={{ opacity: backing }} />
      <motion.div className="relative" style={{ opacity }}>
        {/* Eased: this is the card's BOX shrinking. Its internal fades are keyed
            to fractions of that geometry, not of the scroll. */}
        <MorphingSignalCard progress={collapseEased} showPill={isLive} onMeasure={onMeasure} />
      </motion.div>
    </motion.div>
  );
};

const MobileSignalStack = () => {
  const stageRef = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<PillMetrics | null>(null);
  const timing = DEFAULT_MOBILE_STACK_TIMING;

  // Full travel through the viewport. Which part of it is actually on screen is
  // what constrains the phase windows — see ./mobile-stack-timing.
  const { scrollYProgress } = useScroll({ target: stageRef, offset: ["start end", "end start"] });

  const collapse = useTransform(scrollYProgress, (t) => phase(t, timing.collapseAt, timing.collapseSpan));
  const drop = useTransform(scrollYProgress, (t) => phase(t, timing.dropAt, timing.dropSpan));

  // Position and geometry read the eased values; the fades keep reading the raw
  // phases — an eased fade reads as a delay. Same split as the desktop original.
  const collapseEased = useTransform(collapse, smootherstep);
  // Accelerates out of frame: it is falling.
  const dropEased = useTransform(drop, easeInCubic);

  // The stage is scaled, so its own height has to be the frame's divided by that
  // scale for the two to render as the same box. Everything below is in stage
  // units.
  const stageH = Math.round(FRAME_H / timing.scale);
  const pillH = pill?.height ?? PILL_H_ESTIMATE;
  // Horizontal centring is handled by the half-width lerp in StackCard and is
  // not tunable; only the vertical landing is.
  const pillTop = (stageH - pillH) / 2 + timing.pillOffsetY;
  const fannedTop = timing.formationTop + LIVE_SLOT * timing.dy;
  const dropTo = stageH - pillTop + timing.dropOvershoot;

  return (
    <div ref={stageRef} className="relative w-full overflow-hidden" style={{ height: FRAME_H }}>
      {/* `origin-top` (50% 0%) is load-bearing: it leaves the horizontal centre
          where it is, so `left-1/2` on each card still means the frame's centre. */}
      <div className="relative w-full origin-top" style={{ height: stageH, transform: `scale(${timing.scale})` }}>
        {SLOTS.map((slot) => (
          <StackCard
            key={slot}
            slot={slot}
            collapse={collapse}
            collapseEased={collapseEased}
            dropEased={dropEased}
            fannedTop={fannedTop}
            pillTop={pillTop}
            dropTo={dropTo}
            pill={pill}
            timing={timing}
            onMeasure={slot === LIVE_SLOT ? setPill : undefined}
          />
        ))}
      </div>
      {/* Fades the bottom edge, like the cropped panels above — and doubles as
          the pill's exit, which now dissolves into the frame instead of being cut
          off by it. `z-10` keeps it under the footnote, which is `z-20`. */}
      <div className="absolute inset-x-0 bottom-0 h-[120px] bg-gradient-to-t from-surface-250 to-transparent pointer-events-none z-10" />
    </div>
  );
};

export default MobileSignalStack;
