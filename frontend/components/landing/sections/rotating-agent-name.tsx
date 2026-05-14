"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";

const NAMES = ["Claude", "Cursor", "Codex"] as const;

// Rotates through agent names with a quick opacity fade between each. Used as
// the first word of the "Claude, fix my agent" section title — pairs with
// `AnimatePresence mode="wait"` so the exit completes before the next enters.
const RotatingAgentName = () => {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % NAMES.length);
    }, 2500);
    return () => window.clearInterval(id);
  }, []);

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.span
        key={NAMES[index]}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15, ease: "easeOut" }}
        className="inline-block"
      >
        {NAMES[index]}
      </motion.span>
    </AnimatePresence>
  );
};

export default RotatingAgentName;
