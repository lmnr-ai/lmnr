"use client";

import { motion, type MotionValue, useTransform } from "framer-motion";
import { useLayoutEffect, useState } from "react";

import MorphingSignalCard, { type PillMetrics } from "../has-this-issue/morphing-signal-card";
import { SIGNAL_CLUSTER_EVENT_COUNT } from "../signal-cluster";
import { SIGNAL_CARD_W } from "../signal-event-card";
import { FRAME_H, FRAME_W, TRAY_X } from "./geometry";
import { phase, type StackTiming } from "./stack-timing";

// Step 6 — the signal card leaves the trace panel, becomes the front of a
// receding stack of identical cards, collapses into its cluster pill, and the
// pill drops out of the frame.
//
//   ┌── frame ────────┐   ┌─────────────────┐   ┌─────────────────┐
//   │ ┌ trace ┐       │   │ ┌──────┐        │   │                 │
//   │ │[card] │ ─────▶│   │ │[card]│╲╲╲     │──▶│    ╭─pill─╮     │──▶ drops out
//   │ └───────┘ flight│   │ └──────┘ ghosts │   │                 │
//   └─────────────────┘   └─────────────────┘   └─────────────────┘
//        flight 0→1            collapse 0→1          drop 0→1
//
// EVERY position below is a pure function of a scroll-derived MotionValue.
// Nothing runs on a clock, so scrolling back up rewinds it frame for frame,
// which is what the rest of this section already does.
//
// That requirement is why this is NOT `layoutId`. A shared-layout animation is
// driven by its own spring/tween the instant a re-render moves the element —
// there is no way to bind it to a MotionValue, so a reversal mid-flight snaps
// instead of rewinding. The flight is a plain lerp between a MEASURED source
// box and a DERIVED destination instead, which costs one ResizeObserver and
// buys full scrubbing.
//
// It is also why nothing needs scale correction: the card is SIGNAL_CARD_W in
// the panel and SIGNAL_CARD_W in the stack, so the flight is a pure translate.
// Give the stack cards a different width and the text starts stretching.

/** The stack IS the cluster's events, so the pill's count and the number of
 *  cards are one number. */
const CARDS = SIGNAL_CLUSTER_EVENT_COUNT;
/** Painted back to front, so slot 0 ends up on top. */
const SLOTS = Array.from({ length: CARDS }, (_, i) => CARDS - 1 - i);

/** Content opacity per slot — a monotonic front-to-back ramp, so the ladder
 *  still reads as depth wherever the live card happens to sit in it. Derived
 *  rather than authored so it survives a change to CARDS. */
const BACK_OPACITY = 0.25;
const SLOT_OPACITY = Array.from({ length: CARDS }, (_, i) => 1 - (i / (CARDS - 1)) * (1 - BACK_OPACITY));

/** Where in the collapse the opaque backings start fading. Late: they must
 *  outlast the cards converging on top of each other, but be gone before the
 *  pill, whose own background is translucent — an opaque plate behind it would
 *  read as a second, solid pill. */
const BACKING_FADE_AT = 0.6;

/** Seeds the vertical centring for the one frame before the card is measured.
 *  The section is far below the fold, so this is never on screen. */
const CARD_H_ESTIMATE = 150;

/** How hard the opaque backing snaps in behind a card. Multiplied against the
 *  fan, so the backing is solid well before the card behind it is legible —
 *  but absent at fan 0, where the card is still over the trace panel and a
 *  backing would show as an abrupt change of ground. */
const BACKING_GAIN = 5;

const mix = (from: number, to: number, t: number) => from + (to - from) * t;

/** Left edge of the front card. The cascade is wider than the frame, so it is
 *  centred and bleeds off BOTH edges — as drawn. A negative value is expected. */
const stackLeft = (dx: number) => (FRAME_W - (SIGNAL_CARD_W + (CARDS - 1) * dx)) / 2;
const stackTop = (cardH: number, dy: number) => (FRAME_H - (cardH + (CARDS - 1) * dy)) / 2;

interface SourceBox {
  x: number;
  y: number;
  h: number;
}

/** Where the panel's own signal card sits, in FRAME coordinates.
 *
 *  Measured against the TRAY, not the frame, so the tray's live `translateX`
 *  cancels out of the subtraction and the reading is valid at any scroll
 *  position; `TRAY_X.trace2` then adds the parked offset back. Steps 5 and 6
 *  share the `trace2` view, so the tray is stationary for the whole flight and
 *  that constant is the correct one.
 *
 *  FLAG: keyed off `[data-landing-signal-card]`, which only trace 2 renders —
 *  it is the sole panel with `showSignals`. Giving trace 1 a signal card would
 *  make this query ambiguous and silently pick the wrong one. */
const useSourceBox = (): SourceBox | null => {
  const [box, setBox] = useState<SourceBox | null>(null);

  useLayoutEffect(() => {
    const card = document.querySelector<HTMLElement>("[data-landing-signal-card]");
    const tray = document.querySelector<HTMLElement>("[data-landing-tray]");
    if (!card || !tray) return;

    const measure = () => {
      const c = card.getBoundingClientRect();
      const t = tray.getBoundingClientRect();
      const next = { x: c.left - t.left + TRAY_X.trace2, y: c.top - t.top, h: c.height };
      setBox((prev) =>
        prev && Math.abs(prev.x - next.x) < 0.5 && Math.abs(prev.y - next.y) < 0.5 && Math.abs(prev.h - next.h) < 0.5
          ? prev
          : next
      );
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(card);
    observer.observe(tray);
    // The collapser wrapping the card animates its own maxHeight open, which
    // moves the card's TOP without resizing the card itself.
    if (card.parentElement) observer.observe(card.parentElement);
    return () => observer.disconnect();
  }, []);

  return box;
};

interface StackCardProps {
  slot: number;
  liveSlot: number;
  /** The LIVE card's position. Every other slot is an offset from it, so the
   *  whole stack follows it through the collapse with no second copy of that
   *  maths — and the offsets are what the entry animates. */
  x: MotionValue<number>;
  y: MotionValue<number>;
  /** 0 = off-frame, 1 = arrived in its slot. */
  entry: MotionValue<number>;
  collapse: MotionValue<number>;
  timing: StackTiming;
  onMeasure?: (metrics: PillMetrics) => void;
}

// One run in the stack, live or not. Every card runs the SAME morph, so the
// whole stack collapses together; only the live one grows the pill, because
// five events resolve to one cluster, not five.
//
// OPAQUE BASE with faded CONTENT, not a faded card: fading the whole card would
// let the one behind show through it, which reads as stacked glass. What we
// want is depth, where each card hides the one behind. `surface-400` on the
// frame's `surface-500` is the same one-step lift the design uses.
//
// No explicit width — the wrapper shrink-wraps the morphing card, so the
// backing tracks the collapse for free instead of duplicating its transforms.
const StackCard = ({ slot, liveSlot, x, y, entry, collapse, timing, onMeasure }: StackCardProps) => {
  const offset = slot - liveSlot;
  const isLive = offset === 0;

  // ONE scalar places every card, and its SIGN is the whole trick: slots before
  // the live one have a negative offset so they come in from up-LEFT, slots
  // after it from down-RIGHT. They arrive from opposite sides rather than
  // splitting out of the live card, and they converge onto the pill rather than
  // retreating the way they came.
  //
  //   entrySpread ──▶ 1 ──▶ 0
  //   off-frame     slot    on the pill
  const factor = useTransform([entry, collapse], ([e, c]: number[]) => mix(timing.entrySpread, 1, e) * (1 - c));
  const cx = useTransform([x, factor], ([vx, f]: number[]) => vx + offset * timing.dx * f);
  const cy = useTransform([y, factor], ([vy, f]: number[]) => vy + offset * timing.dy * f);

  // The live card is already on screen, so it never fades in — it dims to its
  // place in the depth ladder as the stack forms around it, then returns to
  // full as it becomes the pill.
  const opacity = useTransform([entry, collapse], ([e, c]: number[]) =>
    isLive ? mix(mix(1, SLOT_OPACITY[slot], e), 1, c) : e * SLOT_OPACITY[slot]
  );
  // Absent until something is actually behind this card — a backing during the
  // flight would show as an abrupt change of ground over the trace panel.
  const backing = useTransform(
    [entry, collapse],
    ([e, c]: number[]) => Math.min(e * BACKING_GAIN, 1) * (1 - phase(c, BACKING_FADE_AT, 1 - BACKING_FADE_AT))
  );

  return (
    <motion.div aria-hidden={!isLive} className="absolute top-0 left-0" style={{ x: cx, y: cy }}>
      <motion.div className="absolute inset-0 rounded-md bg-surface-400" style={{ opacity: backing }} />
      <motion.div className="relative" style={{ opacity }}>
        <MorphingSignalCard progress={collapse} showPill={isLive} onMeasure={onMeasure} />
      </motion.div>
    </motion.div>
  );
};

interface Props {
  /** 0 = card is still in the trace panel, 1 = card is the front of the stack. */
  flight: MotionValue<number>;
  /** 0 = stack, 1 = bare cluster pill. */
  collapse: MotionValue<number>;
  /** 0 = pill parked centre-frame, 1 = pill clear of the bottom edge. */
  drop: MotionValue<number>;
  /** The trace panel still owns the card until this flips. Both sides swap on
   *  the same boolean so the card is never drawn twice, and never zero times. */
  visible: boolean;
  timing: StackTiming;
}

const SignalStack = ({ flight, collapse, drop, visible, timing }: Props) => {
  const source = useSourceBox();
  const [pill, setPill] = useState<PillMetrics | null>(null);

  // Before measurement the card simply starts where it will land, so the worst
  // case is a flight with no distance rather than one from a wrong place.
  const cardH = source?.h ?? CARD_H_ESTIMATE;
  // Clamped because it indexes SLOT_OPACITY, and it arrives from a dial.
  const liveSlot = Math.min(Math.max(Math.round(timing.liveSlot), 0), CARDS - 1);

  // The cascade is centred as a WHOLE; the live card lands on its own slot
  // within it, which is why the flight's destination is not the cascade origin.
  const liveX = stackLeft(timing.dx) + liveSlot * timing.dx;
  const liveY = stackTop(cardH, timing.dy) + liveSlot * timing.dy;
  const from = source ?? { x: liveX, y: liveY };

  // Pill parks dead centre. Note MorphingSignalCard shrinks toward its own
  // top-left, so the box's origin IS what we position — hence the half-size
  // offsets rather than a translate.
  const pillX = pill ? (FRAME_W - pill.width) / 2 : liveX;
  const pillY = pill ? (FRAME_H - pill.height) / 2 : liveY;

  const x = useTransform([flight, collapse], ([f, c]: number[]) => mix(mix(from.x, liveX, f), pillX, c));
  const y = useTransform([flight, collapse, drop], ([f, c, d]: number[]) => {
    const parked = mix(mix(from.y, liveY, f), pillY, c);
    return parked + d * (FRAME_H + timing.dropClearance - pillY);
  });

  /** The other runs sliding in from off-frame, late in the flight. */
  const entry = useTransform(flight, (f) => phase(f, timing.entryStart, 1 - timing.entryStart));

  return (
    <div className="absolute inset-0 pointer-events-none" style={{ opacity: visible ? 1 : 0 }}>
      {SLOTS.map((slot) => (
        <StackCard
          key={slot}
          slot={slot}
          liveSlot={liveSlot}
          x={x}
          y={y}
          entry={entry}
          collapse={collapse}
          timing={timing}
          onMeasure={slot === liveSlot ? setPill : undefined}
        />
      ))}
    </div>
  );
};

export default SignalStack;
