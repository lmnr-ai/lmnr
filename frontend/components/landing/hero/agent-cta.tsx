"use client";

import { motion, useAnimationControls, type Variants } from "framer-motion";
import { useEffect } from "react";

import { ClaudeLogo, CodexLogo, CursorLogo } from "./agent-logos";
import CopySetupButton from "./copy-setup-button";

// Parent staggers its children so the three logos animate in a wave, not in unison.
const group: Variants = {
  hidden: {},
  rest: {},
  jump: { transition: { staggerChildren: 0.09 } },
  intro: { transition: { staggerChildren: 0.12 } },
};

// Each logo hops up and settles: fast-out on the way up, ease-in on the way down
// for a natural little jump. `intro` is the same hop but fades the logo in as it
// jumps (it starts from `hidden`); `jump` is the hover replay on already-visible logos.
const hop: Variants = {
  hidden: { opacity: 0, y: 6 },
  rest: { opacity: 1, y: 0 },
  jump: { opacity: 1, y: [0, -7, 0], transition: { duration: 0.42, times: [0, 0.45, 1], ease: ["easeOut", "easeIn"] } },
  intro: {
    opacity: [0, 1, 1],
    y: [6, -7, 0],
    transition: { duration: 0.5, times: [0, 0.45, 1], ease: ["easeOut", "easeIn"] },
  },
};

// The "Copy setup prompt" button plus the coding-agent marks. Hovering the
// button makes the logos do a staggered jump — same jump also plays once on
// page load, delayed ~1s. Logos are desktop-only.
const AgentCta = () => {
  const controls = useAnimationControls();

  // Logos start hidden and appear with a staggered jump shortly after load.
  useEffect(() => {
    const t = setTimeout(() => controls.start("intro"), 500);
    return () => clearTimeout(t);
  }, [controls]);

  return (
    <>
      <span
        className="inline-flex"
        onMouseEnter={() => controls.start("jump")}
        onMouseLeave={() => controls.start("rest")}
      >
        <CopySetupButton />
      </span>
      <motion.div
        className="hidden sm:flex items-center gap-4 pl-1.5 text-foreground-300"
        variants={group}
        initial="hidden"
        animate={controls}
      >
        <motion.span variants={hop} className="inline-flex">
          <ClaudeLogo className="size-6" />
        </motion.span>
        <motion.span variants={hop} className="inline-flex">
          <CursorLogo className="size-5" />
        </motion.span>
        <motion.span variants={hop} className="inline-flex">
          <CodexLogo className="size-5" />
        </motion.span>
      </motion.div>
    </>
  );
};

export default AgentCta;
