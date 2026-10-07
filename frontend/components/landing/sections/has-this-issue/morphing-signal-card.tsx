"use client";

import { motion, type MotionValue, useMotionValue, useTransform } from "framer-motion";
import { X } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";

import {
  ClusterPill,
  SIGNAL_BG,
  SIGNAL_BORDER,
  SIGNAL_CARD_W,
  SIGNAL_EVENT_TITLE,
  SIGNAL_HEADER_H,
  SignalCardBody,
} from "../signal-event-card";
import { EASE_OUT } from "./timing";

// A signal-event card collapsing into its own cluster pill. Nothing translates:
// the card's box shrinks onto the pill and the flex-centred parent re-centres it,
// while the content stays at a FIXED width so it clips rather than reflows.
// FLAG: the boolean `collapsed`/`durationMs` path has no caller left.

const PAD_X = 12;
const PAD_Y = 8;
const BORDER = 1;

const TRANSPARENT = "rgb(49 134 255 / 0)";

const mix = (from: number, to: number, t: number) => from + (to - from) * t;

export interface PillMetrics {
  width: number;
  height: number;
}

interface Props {
  /** Drives the collapse on a wall-clock timer. Ignored when `progress` is set. */
  collapsed?: boolean;
  durationMs?: number;
  /** Drives the collapse off an external value: 0 = full card, 1 = bare pill.
   *  The only mode that rewinds frame-for-frame, so it is the one a
   *  scroll-scrubbed caller wants. */
  progress?: MotionValue<number>;
  /** Set false for a card that should collapse but NOT grow a pill — the
   *  copies stacked behind the live one in the signal stack. Four cards
   *  shrinking is depth; four pills appearing would be four clusters. The pill
   *  stays mounted either way, since it is what sets the collapsed width. */
  showPill?: boolean;
  /** Reports the pill's natural size once measured — the stage needs its
   *  height to park the pill above the clusters card. */
  onMeasure?: (metrics: PillMetrics) => void;
  /** The card's open width. Defaults to the base breakpoint's; the desktop
   *  stack passes the panel card's MEASURED width, which the panel widens at
   *  2xl, so the flight hands over between two boxes of the same size. */
  cardW?: number;
}

const MorphingSignalCard = ({
  collapsed = false,
  durationMs = 0,
  progress,
  showPill = true,
  onMeasure,
  cardW: CARD_W = SIGNAL_CARD_W,
}: Props) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ card: number; pill: PillMetrics } | null>(null);

  // Measured off the CONTENT box, not the card, whose height this DRIVES — and
  // observed rather than read once, which would race the webfont into a clipped
  // line. `offset*`, NOT getBoundingClientRect: these come back out as CSS
  // lengths and a rect is post-transform, 20% short inside the mobile stack.
  useLayoutEffect(() => {
    const content = contentRef.current;
    const pill = pillRef.current;
    if (!content || !pill) return;
    const measure = () => {
      const next = {
        card: content.offsetHeight + 2 * PAD_Y + 2 * BORDER,
        pill: { width: pill.offsetWidth, height: pill.offsetHeight },
      };
      // A zero box means this ran inside a `display: none` subtree — the mobile
      // tree is hidden above `md` and vice versa, so a browser resized across
      // that breakpoint gets here with nothing laid out. Storing it would pin the
      // card to a bogus natural height until something else resizes.
      if (next.pill.width === 0) return;
      setSize((prev) =>
        prev &&
        Math.abs(prev.card - next.card) < 0.5 &&
        Math.abs(prev.pill.width - next.pill.width) < 0.5 &&
        Math.abs(prev.pill.height - next.pill.height) < 0.5
          ? prev
          : next
      );
      onMeasure?.(next.pill);
    };
    measure();
    // Fonts land late, and both of these are text measurements.
    const observer = new ResizeObserver(measure);
    observer.observe(pill);
    observer.observe(content);
    return () => observer.disconnect();
  }, [onMeasure]);

  // Until measured the card renders at its natural size and nothing animates.
  const collapsedNow = collapsed && size !== null;
  const transition = { duration: durationMs / 1000, ease: EASE_OUT };
  const fadeTransition = { duration: durationMs / 2000, ease: "easeOut" as const };

  // +2 on both axes for the card's own border, which box-border folds in.
  // Width is measured (it is a text measurement); height is the constant header
  // row, so the collapse lands on a deterministic box rather than one that
  // shifts when fonts settle.
  const closedW = size ? size.pill.width + 2 * BORDER : CARD_W;
  const closedH = SIGNAL_HEADER_H + 2 * BORDER;

  // Function-form transforms, not [in]/[out] ranges, so they read the CURRENT
  // `size`: it lands a render after mount, and a range captured at zero would
  // collapse the card to nothing.
  const parked = useMotionValue(0);
  const p = progress ?? parked;
  const width = useTransform(p, (v) => mix(CARD_W, closedW, v));
  const height = useTransform(p, (v) => mix(size?.card ?? 0, closedH, v));
  const padX = useTransform(p, (v) => mix(PAD_X, 0, v));
  const padY = useTransform(p, (v) => mix(PAD_Y, 0, v));
  const borderColor = useTransform(p, [0, 1], [SIGNAL_BORDER, TRANSPARENT]);
  const backgroundColor = useTransform(p, [0, 1], [SIGNAL_BG, TRANSPARENT]);
  /** Contents clear out over the first QUARTER, well before the card's right
   *  edge reaches the pill. Text riding a shrinking box most of the way down
   *  reads as the copy being crushed rather than the card emptying, so this is
   *  deliberately much faster than the geometry it sits inside. */
  const contentOpacity = useTransform(p, [0, 0.25], [1, 0]);
  /** The pill arrives over the second half — after the title has gone, so the
   *  two never read as overlapping text. */
  const pillOpacity = useTransform(p, [0.5, 1], [0, 1]);

  const scrubbed = !!progress;

  return (
    <motion.div
      ref={cardRef}
      className="rounded-md border box-border overflow-hidden"
      initial={false}
      style={
        scrubbed
          ? {
              width,
              // Held off until measured, so the card can report its natural
              // height instead of being pinned to a placeholder.
              height: size ? height : undefined,
              paddingLeft: padX,
              paddingRight: padX,
              paddingTop: padY,
              paddingBottom: padY,
              borderColor,
              backgroundColor,
            }
          : undefined
      }
      animate={
        scrubbed
          ? undefined
          : {
              width: collapsedNow ? closedW : CARD_W,
              height: collapsedNow ? closedH : (size?.card ?? "auto"),
              paddingLeft: collapsedNow ? 0 : PAD_X,
              paddingRight: collapsedNow ? 0 : PAD_X,
              paddingTop: collapsedNow ? 0 : PAD_Y,
              paddingBottom: collapsedNow ? 0 : PAD_Y,
              borderColor: collapsedNow ? TRANSPARENT : SIGNAL_BORDER,
              backgroundColor: collapsedNow ? TRANSPARENT : SIGNAL_BG,
            }
      }
      transition={transition}
    >
      {/* The pill is centred on the CARD, not on the header row, and sits
          outside the padded content flow. That is what frees the header row to
          be its natural height — pinning it to the pill's 34px was adding ~9px
          of dead air above and below the title in every card on the page. At
          full collapse the padding is 0 and the box IS the pill's box, so
          centring here lands it exactly where the header row used to. */}
      <motion.div
        initial={false}
        className="absolute inset-0 flex items-center px-0"
        style={scrubbed ? { opacity: showPill ? pillOpacity : 0 } : undefined}
        animate={scrubbed ? undefined : { opacity: showPill && collapsedNow ? 1 : 0 }}
        transition={fadeTransition}
      >
        <div ref={pillRef} className="flex">
          <ClusterPill />
        </div>
      </motion.div>

      <div
        ref={contentRef}
        className="flex flex-col gap-0.5 shrink-0"
        style={{ width: CARD_W - 2 * PAD_X - 2 * BORDER }}
      >
        <div className="relative flex items-center justify-between gap-2">
          <motion.span
            initial={false}
            className="text-xs font-medium text-white truncate"
            style={scrubbed ? { opacity: contentOpacity } : undefined}
            animate={scrubbed ? undefined : { opacity: collapsedNow ? 0 : 1 }}
            transition={fadeTransition}
          >
            {SIGNAL_EVENT_TITLE}
          </motion.span>
          {/* Fades well before the card's right edge reaches it.
              `p-0.5` is LOAD-BEARING, not styling: it mirrors the padding on
              SignalContent's close BUTTON, so this 16px icon occupies the same
              20px the canonical control does (the height SIGNAL_HEADER_H is
              derived from). The header row is `items-center`, so its height is
              its tallest child — without the padding this card's natural height
              comes out 4px under SignalContent's, and the step-6 flight hands
              off between the two mid-scroll. Top-left stays aligned either way,
              so the shortfall reads as the card jumping 2px UP as it detaches. */}
          <motion.span
            initial={false}
            className="shrink-0 p-0.5"
            style={scrubbed ? { opacity: contentOpacity } : undefined}
            animate={scrubbed ? undefined : { opacity: collapsedNow ? 0 : 1 }}
            transition={fadeTransition}
          >
            <X className="size-4 shrink-0 text-foreground-300" strokeWidth={1.5} />
          </motion.span>
        </div>

        <motion.div
          initial={false}
          style={scrubbed ? { opacity: contentOpacity } : undefined}
          animate={scrubbed ? undefined : { opacity: collapsedNow ? 0 : 1 }}
          transition={fadeTransition}
        >
          <SignalCardBody />
        </motion.div>
      </div>
    </motion.div>
  );
};

export default MorphingSignalCard;
