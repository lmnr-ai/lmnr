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

// FLAG: lives here for historical reasons — this section used to open with the
// card collapsing into its pill, and now opens with the pill already formed,
// falling in from above. The ONLY caller left is
// ../understand-why-trace-view/signal-stack, which drives it with `progress`
// off scroll. The boolean `collapsed` / `durationMs` path is therefore
// currently unused; keep it or delete it, but do not assume it is exercised.
//
// A signal-event card that collapses into its own cluster pill.
//
//   ┌─────────────────────────────┐        ╭──────────────────╮
//   │ ╭──────────────────╮      × │   ──▶  │ ▣ Cluster name ↗ │
//   │ ╰──────────────────╯        │        ╰──────────────────╯
//   │ Agent run flagged 4 issues… │
//   └─────────────────────────────┘
//
// Nothing here translates. The card's own box shrinks — width, height and
// padding all land exactly on the pill — so the pill ends up flush inside a
// now-invisible frame. The parent is flex-centred, which means the shrinking
// box re-centres itself for free and the pill finishes dead centre.
//
// The content sits at a FIXED width inside an overflow-hidden card, so the
// paragraph never reflows as the card narrows; it is clipped (and faded) away
// instead. Reflowing text mid-collapse reads as a glitch.

/** Card width. Shared with the trace panel above this section, so the two read
 *  as — and in the stack animation literally are — the same card. */
const CARD_W = SIGNAL_CARD_W;
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
}

const MorphingSignalCard = ({ collapsed = false, durationMs = 0, progress, showPill = true, onMeasure }: Props) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ card: number; pill: PillMetrics } | null>(null);

  // One measurement pass at natural size, before anything animates. The card
  // only starts collapsing on scroll-in, so this has always landed by then.
  useLayoutEffect(() => {
    const card = cardRef.current;
    const pill = pillRef.current;
    if (!card || !pill) return;
    const measure = () => {
      const pillRect = pill.getBoundingClientRect();
      const next = {
        card: card.getBoundingClientRect().height,
        pill: { width: pillRect.width, height: pillRect.height },
      };
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
    // Fonts land late; the pill's width is a text measurement.
    const observer = new ResizeObserver(measure);
    observer.observe(pill);
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

  // Scrubbed mode. Hooks run unconditionally against a parked stand-in when the
  // caller is in boolean mode; the resulting values are simply not applied.
  // Function-form transforms (not [in]/[out] ranges) so they read the CURRENT
  // `size` — it lands a render after mount, and a range captured at zero would
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
      <div className="flex flex-col gap-2 shrink-0" style={{ width: CARD_W - 2 * PAD_X - 2 * BORDER }}>
        <div className="relative flex items-center justify-between gap-2" style={{ minHeight: SIGNAL_HEADER_H }}>
          <motion.span
            initial={false}
            className="text-sm font-medium text-white truncate"
            style={scrubbed ? { opacity: contentOpacity } : undefined}
            animate={scrubbed ? undefined : { opacity: collapsedNow ? 0 : 1 }}
            transition={fadeTransition}
          >
            {SIGNAL_EVENT_TITLE}
          </motion.span>
          {/* Fades well before the card's right edge reaches it. */}
          <motion.span
            initial={false}
            style={scrubbed ? { opacity: contentOpacity } : undefined}
            animate={scrubbed ? undefined : { opacity: collapsedNow ? 0 : 1 }}
            transition={fadeTransition}
          >
            <X className="size-4 shrink-0 text-foreground-300" strokeWidth={1.5} />
          </motion.span>

          {/* The cluster this event ends up in. It does NOT exist while the
              card is open — a cluster only forms once enough events have
              grouped — so it fades IN over the title as the card collapses,
              and it is absolutely positioned so it never drives layout. */}
          <motion.div
            ref={pillRef}
            initial={false}
            className="absolute left-0 top-1/2 -translate-y-1/2 flex"
            style={scrubbed ? { opacity: showPill ? pillOpacity : 0 } : undefined}
            animate={scrubbed ? undefined : { opacity: showPill && collapsedNow ? 1 : 0 }}
            transition={fadeTransition}
          >
            <ClusterPill />
          </motion.div>
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
