"use client";

import { motion, type MotionValue, useTransform } from "framer-motion";
import { useEffect, useRef } from "react";

import ClustersCard from "../has-this-issue/clusters-card";
import { DEFAULT_TIMING } from "../has-this-issue/timing";
import { useClusterBeats } from "../has-this-issue/use-cluster-beats";
import { SIGNAL_CLUSTER_ID } from "../signal-cluster";
import { easeOutCubic, type StackTiming } from "./stack-timing";

// The clusters card as the closing beat: it rises under the collapsing stack,
// takes the pill in, then Act 2 plays. ../has-this-issue is the mobile twin —
// same card and Act 2, but there the pill falls in from off-frame.

interface Props {
  /** 0 = below the frame, 1 = resting. */
  rise: MotionValue<number>;
  /** Absolute y of the card's top edge at rest, from the frame's top. */
  restY: number;
  /** Reports the card's live height, which grows as Act 2 reveals its rows.
   *  The parent re-centres the assembly on it. */
  onHeight: (height: number) => void;
  /** Act 2 has been armed by the scroll position. */
  armed: boolean;
  /** The pill is inside the card, so its cluster owns those events. */
  landed: boolean;
  timing: StackTiming;
}

const ClustersStage = ({ rise, restY, onHeight, armed, landed, timing }: Props) => {
  const eased = useTransform(rise, easeOutCubic);
  // Only the RISE, not the rest position: `restY` is applied as `top` instead,
  // so the card re-centres the frame it grows in rather than a frame later.
  const y = useTransform(eased, (r) => (1 - r) * timing.cardRiseFrom);

  const beats = useClusterBeats(armed, DEFAULT_TIMING);

  const cardRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => onHeight(el.offsetHeight));
    observer.observe(el);
    return () => observer.disconnect();
  }, [onHeight]);

  return (
    // Centred in CSS, not against a frame width: the frame's width is a media
    // query, and this card is the only thing here that does not have to be
    // lerped against a measured box.
    <motion.div ref={cardRef} style={{ y, top: restY, opacity: eased, x: "-50%" }} className="absolute left-1/2">
      <ClustersCard
        layout="column"
        armed={beats.chartArmed}
        entered={landed && beats.landed}
        pulsingClusterId={beats.pulsing ? SIGNAL_CLUSTER_ID : null}
        pulseMs={DEFAULT_TIMING.pulseMs}
        revealedCount={beats.revealed}
        revealMs={DEFAULT_TIMING.revealMs}
      />
    </motion.div>
  );
};

export default ClustersStage;
