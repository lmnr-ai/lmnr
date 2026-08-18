"use client";

import { AnimatePresence, motion } from "framer-motion";

// A pass DOWN the trace window — timeline, toolbar and transcript: what "every
// run is analyzed" looks like in the second the step has to say it. Laid OVER
// them, since the timeline paints its own surface; the alphas are low enough
// that nothing under it loses legibility.

/** primary-400. Literal, not `var(--color-*)`: these are composed into gradient
 *  strings, where a variable reference cannot carry an alpha. */
const PRIMARY_400 = "208 117 78";

/** Where the band sits inside the sweeping element, as percentages of its
 *  height. The travel below is derived from them, so the band enters exactly at
 *  the top edge and leaves exactly at the bottom one — no dead frames at either
 *  end. Half the box tall, which is what gives the tail room to drain out behind
 *  the crest. */
const BAND_TOP = 25;
const BAND_H = 50;

/** Falling, so the band starts fully above the box and ends fully below it.
 *  Percentages, NOT px, and load-bearing: the signal card opening shortens this
 *  box mid-pass, and in % the band stays exactly clipped at each edge through
 *  the resize where px would jump it back into view. */
const FROM = `${-(BAND_TOP + BAND_H)}%`;
const TO = `${100 - BAND_TOP}%`;

/** Builds to the crest at the BOTTOM — the leading edge of a fall — with the
 *  tail draining away above it. */
const BAND = `linear-gradient(to bottom, transparent, rgb(${PRIMARY_400} / 0.1))`;

/** The crest itself. Faded at both ends: a full-bleed rule would read as a
 *  divider the panel had grown rather than something travelling down it. */
const CREST = `linear-gradient(to right, transparent, rgb(${PRIMARY_400} / 0.35) 22%, rgb(${PRIMARY_400} / 0.35) 78%, transparent)`;

/** Mostly linear through the middle — a scan is a machine, not a thrown ball —
 *  but eased at both ends so it neither starts nor stops on a hard edge. */
const SWEEP_EASE = [0.32, 0, 0.3, 1] as const;

interface Props {
  active: boolean;
  durationMs: number;
}

const ScanSweep = ({ active, durationMs }: Props) => (
  <AnimatePresence>
    {active && (
      <motion.div
        className="absolute inset-0 pointer-events-none"
        initial={{ y: FROM }}
        animate={{ y: TO }}
        // Only reached if the reader scrolls back mid-pass; on a clean run the
        // band is already clipped by the panel's edge when this fires.
        exit={{ opacity: 0, transition: { duration: 0.15 } }}
        transition={{ duration: durationMs / 1000, ease: SWEEP_EASE }}
      >
        <div className="absolute inset-x-0" style={{ top: `${BAND_TOP}%`, height: `${BAND_H}%`, background: BAND }} />
        <div className="absolute inset-x-0 h-px" style={{ top: `${BAND_TOP + BAND_H}%`, background: CREST }} />
      </motion.div>
    )}
  </AnimatePresence>
);

export default ScanSweep;
