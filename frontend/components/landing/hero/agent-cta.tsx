"use client";

import { motion, type Variants } from "framer-motion";
import { useState } from "react";

import { ClaudeLogo, CodexLogo, CursorLogo } from "./agent-logos";
import CopySetupButton from "./copy-setup-button";

// Parent staggers its children so the three logos pop in sequence — bip-bip-bip.
const group: Variants = {
  rest: {},
  jump: { transition: { staggerChildren: 0.09 } },
};

// Each logo hops up and settles: fast-out on the way up, ease-in on the way down
// for a natural little jump.
const hop: Variants = {
  rest: { y: 0 },
  jump: { y: [0, -7, 0], transition: { duration: 0.42, times: [0, 0.45, 1], ease: ["easeOut", "easeIn"] } },
};

// The "Copy setup prompt" button plus the coding-agent marks. Hovering the
// button makes the logos do a staggered jump. Logos are desktop-only.
const AgentCta = () => {
  const [hovered, setHovered] = useState(false);

  return (
    <>
      <span className="inline-flex" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
        <CopySetupButton />
      </span>
      <motion.div
        className="hidden sm:flex items-center gap-4 pl-1.5 text-foreground-500"
        variants={group}
        initial="rest"
        animate={hovered ? "jump" : "rest"}
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
