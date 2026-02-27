"use client";

import { motion, type MotionValue, useTransform } from "framer-motion";

const StaggeredPath = ({ d, offset, progress }: { d: string; offset: number; progress: MotionValue<number> }) => {
  const pathLength = useTransform(progress, [offset, 1], [0, 1]);
  return <motion.path d={d} stroke="#D0754E" strokeOpacity={0.6} style={{ pathLength }} />;
};

export default StaggeredPath;
