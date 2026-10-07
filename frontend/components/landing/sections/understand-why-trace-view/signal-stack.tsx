"use client";

import { motion, type MotionValue, useTransform } from "framer-motion";
import { useLayoutEffect, useState } from "react";

import MorphingSignalCard, { type PillMetrics } from "../has-this-issue/morphing-signal-card";
import { SIGNAL_CLUSTER_EVENT_COUNT } from "../signal-cluster";
import { SIGNAL_CARD_W } from "../signal-event-card";
import { FRAME_H } from "./geometry";
import { easeInCubic, easeInOutCubic, easeOutCubic, phase, smootherstep, type StackTiming } from "./stack-timing";

// The last step: the card leaves the panel, fronts a receding stack, collapses
// to its pill, and the pill drops into ./clusters-stage's card. Every position
// is a pure function of a scroll MotionValue, which is why it is NOT `layoutId`.
// Phases arrive linear and are eased HERE: POSITION eased, OPACITY linear.
const easeFor = {
  /** Leaves a card at rest, lands in a waiting formation. */
  flight: easeInOutCubic,
  /** Overlapped by cardRise on the way out; must be near-stopped at its end. */
  collapse: smootherstep,
  /** Taken in by the clusters card. */
  pillEnter: easeInCubic,
  /** Arrives from off-frame with no prior rest state, so it decelerates in. */
  entry: easeOutCubic,
};

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

/** Point WITHIN the flight by which the other runs have reached their slots.
 *  Short of 1 so the live card is the last thing to arrive. */
const ENTRY_END = 0.85;

/** The pill's opacity once the clusters card has taken it in, and how far
 *  through the enter it gets there. See `absorb` below. */
const PILL_ABSORBED_OPACITY = 0.5;
const PILL_FADE_END = 0.4;

const mix = (from: number, to: number, t: number) => from + (to - from) * t;

/** Left edge of the front card, centring the whole cascade. Legally negative
 *  once the deck fans past the frame — it then bleeds off both edges. `frameW`
 *  is measured because the result is lerped against a measured box, and CSS
 *  centring has nothing to interpolate with. */
const stackLeft = (dx: number, frameW: number, cardW: number) => (frameW - (cardW + (CARDS - 1) * dx)) / 2;
const stackTop = (cardH: number, dy: number) => (FRAME_H - (cardH + (CARDS - 1) * dy)) / 2;

interface SourceBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface FrameGeometry {
  /** Where the panel's own signal card sits, in FRAME coordinates. */
  source: SourceBox | null;
  /** The frame's live width. 0 until the first measurement, which lands in a
   *  layout effect long before the stack is visible. */
  frameW: number;
}

/** Measures what the flight is placed against, in FRAME coordinates — which is
 *  what the consumer's own coordinates are, so it cannot drift. */
const useFrameGeometry = (flight: MotionValue<number>): FrameGeometry => {
  const [geometry, setGeometry] = useState<FrameGeometry>({ source: null, frameW: 0 });

  useLayoutEffect(() => {
    // Card looked up THROUGH the frame: mobile mounts panels of its own, and a
    // document-wide query would measure whichever one happens to be first.
    const frame = document.querySelector<HTMLElement>("[data-landing-frame]");
    const card = frame?.querySelector<HTMLElement>("[data-landing-signal-card]");
    if (!card || !frame) return;

    const measure = () => {
      const c = card.getBoundingClientRect();
      const t = frame.getBoundingClientRect();
      const next = {
        source: { x: c.left - t.left, y: c.top - t.top, w: c.width, h: c.height },
        frameW: t.width,
      };
      setGeometry((prev) => {
        const p = prev.source;
        return p &&
          Math.abs(p.x - next.source.x) < 0.5 &&
          Math.abs(p.y - next.source.y) < 0.5 &&
          Math.abs(p.w - next.source.w) < 0.5 &&
          Math.abs(p.h - next.source.h) < 0.5 &&
          Math.abs(prev.frameW - next.frameW) < 0.5
          ? prev
          : next;
      });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(card);
    observer.observe(frame);
    // The collapser wrapping the card animates its own maxHeight open, which
    // moves the card's TOP without resizing the card itself.
    if (card.parentElement) observer.observe(card.parentElement);

    // A ResizeObserver alone misses the collapser's `marginTop` tween — margin
    // is not part of an element's size — so the card detached a few px high.
    // Only while the flight is at 0; past that a re-measure jumps it mid-air.
    const onScroll = () => {
      if (flight.get() === 0) measure();
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
  }, [flight]);

  return geometry;
};

interface StackCardProps {
  slot: number;
  liveSlot: number;
  /** The LIVE card's position, including its flight out of the trace panel. */
  x: MotionValue<number>;
  y: MotionValue<number>;
  /** The same path with the flight already FINISHED. Every other slot offsets
   *  from THIS, not the live card: offsetting from the live card makes them
   *  chase it down the frame, offsetting from here makes them assemble where
   *  the stack will be and the live card slot into a waiting formation. */
  anchorX: MotionValue<number>;
  anchorY: MotionValue<number>;
  /** 0 = off-frame, 1 = arrived in its slot. Raw drives the fades, eased the
   *  travel — see the easing note in this file's header. */
  entry: MotionValue<number>;
  entryEased: MotionValue<number>;
  collapse: MotionValue<number>;
  collapseEased: MotionValue<number>;
  /** The panel card's measured width, so the stack's copies are the same box. */
  cardW: number;
  timing: StackTiming;
  onMeasure?: (metrics: PillMetrics) => void;
}

// One run in the stack. Every card runs the same morph so they collapse
// together; only the live one grows the pill, since five events make one
// cluster. Opaque base with faded CONTENT — fading the whole card would let the
// one behind show through, which reads as glass rather than depth.
const StackCard = ({
  slot,
  liveSlot,
  x,
  y,
  anchorX,
  anchorY,
  entry,
  entryEased,
  collapse,
  collapseEased,
  cardW,
  timing,
  onMeasure,
}: StackCardProps) => {
  const offset = slot - liveSlot;
  const isLive = offset === 0;

  // The live card rides its own flight; everything else is placed off the
  // destination. Choosing WHICH MotionValue to read, not calling a hook
  // conditionally — `isLive` is fixed for the life of a slot.
  const baseX = isLive ? x : anchorX;
  const baseY = isLive ? y : anchorY;

  // One scalar places every card, and its SIGN is the trick: slots before the
  // live one come in from up-LEFT, slots after it from down-RIGHT, so they
  // arrive from opposite sides. entrySpread ▶ 1 ▶ 0 = off-frame, slot, pill.
  const factor = useTransform(
    [entryEased, collapseEased],
    ([e, c]: number[]) => mix(timing.entrySpread, 1, e) * (1 - c)
  );
  const cx = useTransform([baseX, factor], ([vx, f]: number[]) => vx + offset * timing.dx * f);
  const cy = useTransform([baseY, factor], ([vy, f]: number[]) => vy + offset * timing.dy * f);

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
      <motion.div className="absolute inset-0 rounded-md bg-surface-300" style={{ opacity: backing }} />
      <motion.div className="relative" style={{ opacity }}>
        {/* Eased: this is the card's BOX shrinking. Its own internal fades are
            keyed to fractions of the collapse's geometry, not of the scroll, so
            they stay locked to the shape they were tuned against. */}
        <MorphingSignalCard progress={collapseEased} showPill={isLive} cardW={cardW} onMeasure={onMeasure} />
      </motion.div>
    </motion.div>
  );
};

interface Props {
  /** 0 = card is still in the trace panel, 1 = card is the front of the stack. */
  flight: MotionValue<number>;
  /** 0 = stack, 1 = bare cluster pill. */
  collapse: MotionValue<number>;
  /** 0 = pill parked above the clusters card, 1 = pill hidden inside it. */
  pillEnter: MotionValue<number>;
  /** Absolute y of the pill's top edge at rest, from the frame's top — the
   *  clusters card's height decides it, so it is computed by the parent. */
  pillRestY: number;
  /** The trace panel still owns the card until this flips. Both sides swap on
   *  the same boolean so the card is never drawn twice, and never zero times. */
  visible: boolean;
  timing: StackTiming;
}

const SignalStack = ({ flight, collapse, pillEnter, pillRestY, visible, timing }: Props) => {
  const { source, frameW } = useFrameGeometry(flight);
  const [pill, setPill] = useState<PillMetrics | null>(null);

  // Before measurement the card simply starts where it will land, so the worst
  // case is a flight with no distance rather than one from a wrong place.
  const cardH = source?.h ?? CARD_H_ESTIMATE;
  const cardW = source?.w ?? SIGNAL_CARD_W;
  // Clamped because it indexes SLOT_OPACITY, and it arrives from a dial.
  const liveSlot = Math.min(Math.max(Math.round(timing.liveSlot), 0), CARDS - 1);

  // The cascade is centred as a WHOLE; the live card lands on its own slot
  // within it, which is why the flight's destination is not the cascade origin.
  const liveX = stackLeft(timing.dx, frameW, cardW) + liveSlot * timing.dx;
  const liveY = stackTop(cardH, timing.dy) + liveSlot * timing.dy;
  const from = source ?? { x: liveX, y: liveY };

  // Pill parks horizontally centred, and vertically wherever the clusters card
  // leaves room above itself. Note MorphingSignalCard shrinks toward its own
  // top-left, so the box's origin IS what we position — hence the half-size
  // offset rather than a translate.
  const pillX = pill ? (frameW - pill.width) / 2 : liveX;

  // The eased siblings. Position and geometry read these; the fades below keep
  // reading the raw phases. See this file's header for why they are separate.
  const flightEased = useTransform(flight, easeFor.flight);
  const collapseEased = useTransform(collapse, easeFor.collapse);
  const pillEnterEased = useTransform(pillEnter, easeFor.pillEnter);

  const x = useTransform([flightEased, collapseEased], ([f, c]: number[]) => mix(mix(from.x, liveX, f), pillX, c));
  const y = useTransform([flightEased, collapseEased, pillEnterEased], ([f, c, e]: number[]) => {
    const parked = mix(mix(from.y, liveY, f), pillRestY, c);
    // Down past the card's top edge, so the pill is fully roofed by it. The
    // card is painted OVER the pill, so the rest of the travel is out of sight.
    return parked + e * ((pill?.height ?? 0) + timing.pillEnterDepth);
  });

  // The same two paths with the flight pinned at 1 — see `anchorX` on StackCard.
  const anchorX = useTransform(collapseEased, (c) => mix(liveX, pillX, c));
  const anchorY = useTransform([collapseEased, pillEnterEased], ([c, e]: number[]) => {
    const parked = mix(liveY, pillRestY, c);
    return parked + e * ((pill?.height ?? 0) + timing.pillEnterDepth);
  });

  /** The other runs sliding in late in the flight but landing BEFORE it ends,
   *  so the formation is waiting when the live card arrives. Cut from the RAW
   *  flight, so `entryStart` still means the fraction the dial says. */
  const entry = useTransform(flight, (f) => phase(f, timing.entryStart, ENTRY_END - timing.entryStart));
  const entryEased = useTransform(entry, easeFor.entry);

  // Absorbed, not merely covered: the last of the pill visible above the card's
  // edge is already half gone. The ramp finishes EARLY because the card is
  // opaque and painted over the pill — past that point the fade happens out of
  // sight, so spreading it over the whole phase spends most of it on nobody.
  const absorb = useTransform(pillEnter, [0, PILL_FADE_END], [1, PILL_ABSORBED_OPACITY]);
  const opacity = useTransform(absorb, (a) => (visible ? a : 0));

  return (
    <motion.div className="absolute inset-0 pointer-events-none" style={{ opacity }}>
      {SLOTS.map((slot) => (
        <StackCard
          key={slot}
          slot={slot}
          liveSlot={liveSlot}
          x={x}
          y={y}
          anchorX={anchorX}
          anchorY={anchorY}
          entry={entry}
          entryEased={entryEased}
          collapse={collapse}
          collapseEased={collapseEased}
          cardW={cardW}
          timing={timing}
          onMeasure={slot === liveSlot ? setPill : undefined}
        />
      ))}
    </motion.div>
  );
};

export default SignalStack;
