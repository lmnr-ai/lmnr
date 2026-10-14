"use client";

import { motion, type MotionValue, useTransform } from "framer-motion";

import WarningMark from "./warning-mark";

interface Props {
  appearanceThreshold: number;
  color: string;
  revealProgress: MotionValue<number>;
  revision: number;
  shape: number;
}

const PatternGridCell = ({ appearanceThreshold, color, revealProgress, revision, shape }: Props) => {
  const revealEnd = Math.min(appearanceThreshold + 0.04, 1);
  const opacity = useTransform(revealProgress, [appearanceThreshold, revealEnd], [0, 1]);
  const scale = useTransform(revealProgress, [appearanceThreshold, revealEnd], [0.4, 1]);

  return (
    <span className="flex size-6 items-center justify-center">
      <motion.span className="flex size-6 items-center justify-center" style={{ opacity, scale }}>
        <motion.span
          key={revision}
          className="flex size-6 items-center justify-center"
          initial={revision === 0 ? false : { opacity: 0, scale: 0.4 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        >
          {shape === 0 && <WarningMark color={color} />}
          {shape === 1 && <i className="block size-1 rounded-full" style={{ backgroundColor: color }} />}
          {shape === 2 && <i className="block size-1.5 rounded-full border" style={{ borderColor: color }} />}
        </motion.span>
      </motion.span>
    </span>
  );
};

export default PatternGridCell;
