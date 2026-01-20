"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";

const CachedBadge = () => {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: false });

  return (
    <motion.div
      ref={ref}
      className="border-[0.5px] border-landing-surface-600 flex items-center px-2 py-0.5 rounded"
      animate={
        isInView
          ? {
              backgroundColor: [
                "var(--color-landing-surface-500)",
                "var(--color-landing-surface-400)",
                "var(--color-landing-surface-500)",
              ],
            }
          : { backgroundColor: "var(--color-landing-surface-500)" }
      }
      transition={{
        duration: 0.8,
        ease: "easeInOut",
      }}
    >
      <motion.p
        className="text-xs"
        animate={
          isInView
            ? {
                color: [
                  "var(--color-landing-text-500)",
                  "var(--color-landing-text-300)",
                  "var(--color-landing-text-500)",
                ],
              }
            : { color: "var(--color-landing-text-500)" }
        }
        transition={{
          duration: 0.8,
          ease: "easeInOut",
        }}
      >
        Cached
      </motion.p>
    </motion.div>
  );
};

export default CachedBadge;
