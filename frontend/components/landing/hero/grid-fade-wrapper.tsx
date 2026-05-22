"use client";

import { motion } from "framer-motion";
import { type ReactNode } from "react";

import { GRID_FADE_DURATION } from "./extended-diamonds";

interface Props {
  children: ReactNode;
  className?: string;
}

// Fades the diamond grid + extended diamonds (+ radial glow) in from 20%
// opacity on mount. The diamond launch in ExtendedDiamondsOverlay waits
// GRID_FADE_DURATION before kicking off, so the visual sequence reads as:
// grid materializes → then heads start popping out toward the cluster.
// Exported as a client component so hero/index.tsx can stay server-rendered.
const GridFadeWrapper = ({ children, className }: Props) => (
  <motion.div
    className={className}
    initial={{ opacity: 0.2 }}
    animate={{ opacity: 1 }}
    transition={{ duration: GRID_FADE_DURATION, ease: "easeOut" }}
  >
    {children}
  </motion.div>
);

export default GridFadeWrapper;
