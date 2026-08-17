"use client";

import { useDialKit } from "dialkit";
import { useEffect } from "react";

import { CARD_GLOW_DEFAULTS } from "./card-hover-glow";

// Live tuning for the card hover glow, DEV ONLY. Mounted once at the landing
// root through a `process.env.NODE_ENV`-gated next/dynamic, so the dialkit
// chunk is dead code in a production build.
//
// Unlike the other dials modules this one does NOT thread values through
// props: the glow renders inside two different Card components in two files
// (Enterprise-ready and every-stage-of-agent-development), so a prop would have
// to be threaded through both. It writes CSS custom properties on :root
// instead, which every glow on the page picks up at once. In production
// nothing sets them and the component's own fallbacks apply, so the committed
// look is CARD_GLOW_DEFAULTS.
//
// TRAP: values persist to localStorage under `dialkit:landing-card-glow*`, and
// once touched the stored values WIN over CARD_GLOW_DEFAULTS — editing the
// defaults then appears to do nothing on the machine that did the tuning. Bump
// the -vN in the id on every default change, and verify from a clean profile.
const D = CARD_GLOW_DEFAULTS;

const CardGlowDials = () => {
  const p = useDialKit(
    "Card hover glow",
    {
      /** How far it travels, in px. Also its parked distance to the right. */
      slide: [D.slide, 0, 400, 4],
      durationMs: [D.durationMs, 0, 2000, 50],
      /** The opacity it arrives AT. The artwork itself is a solid fill, so
       *  this is the whole of what you see. */
      opacity: [D.opacity, 0, 0.5, 0.005],
      /** Where the shape's corner parks relative to the card's. Negative
       *  pushes it out past the edge; the defaults are the blur's bleed. */
      offsetX: [D.offsetX, -300, 100, 4],
      offsetY: [D.offsetY, -300, 100, 4],
    },
    // Bumped on every default change: stored clips outrank these, so without it
    // the retune silently does nothing on the machine that tuned it.
    { id: "landing-card-glow-v3", persist: true }
  );

  useEffect(() => {
    const s = document.documentElement.style;
    s.setProperty("--card-glow-slide", `${p.slide}px`);
    s.setProperty("--card-glow-ms", `${p.durationMs}ms`);
    s.setProperty("--card-glow-opacity", String(p.opacity));
    s.setProperty("--card-glow-x", `${p.offsetX}px`);
    s.setProperty("--card-glow-y", `${p.offsetY}px`);
  }, [p.slide, p.durationMs, p.opacity, p.offsetX, p.offsetY]);

  // No chrome here — the dock is mounted once at the landing root.
  return null;
};

export default CardGlowDials;
