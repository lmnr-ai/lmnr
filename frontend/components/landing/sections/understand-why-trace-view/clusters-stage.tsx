"use client";

import { motion, type MotionValue, useTransform } from "framer-motion";

import ClustersCard, { CLUSTERS_CARD_COL_W } from "../has-this-issue/clusters-card";
import { DEFAULT_TIMING } from "../has-this-issue/timing";
import { useClusterBeats } from "../has-this-issue/use-cluster-beats";
import { SIGNAL_CLUSTER_ID } from "../signal-cluster";
import { FRAME_W } from "./geometry";
import { easeOutCubic, type StackTiming } from "./stack-timing";

// The clusters card, as the closing beat of the trace-view scrollytell. It
// rises into the frame under the collapsing signal stack, the pill drops into
// it (../understand-why-trace-view/signal-stack owns the pill), and Act 2
// plays: the landed cluster pulses, the rest stagger in, the chart fills.
//
// The standalone ../has-this-issue section is the MOBILE-only twin of this. The
// two share the card, the Act 2 scheduler and the Act 2 timings, but not their
// Act 1: there the pill falls in from off-frame, here it arrives already formed
// out of the stack.

interface Props {
  /** 0 = below the frame, 1 = resting. */
  rise: MotionValue<number>;
  /** Absolute y of the card's top edge at rest, from the frame's top. */
  restY: number;
  /** Act 2 has been armed by the scroll position. */
  armed: boolean;
  /** The pill is inside the card, so its cluster owns those events. */
  landed: boolean;
  timing: StackTiming;
}

const ClustersStage = ({ rise, restY, armed, landed, timing }: Props) => {
  const eased = useTransform(rise, easeOutCubic);
  const y = useTransform(eased, (r) => restY + (1 - r) * timing.cardRiseFrom);

  const beats = useClusterBeats(armed, DEFAULT_TIMING);

  return (
    <motion.div style={{ y, opacity: eased, left: (FRAME_W - CLUSTERS_CARD_COL_W) / 2 }} className="absolute top-0">
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
